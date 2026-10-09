"""발행 파일 직렬화(순수 함수) · 쓰기(tmp_path) 테스트. DB 없음.

발행 흐름(기록본 상태 · 재시도 · API)은 test_admin_publish.py 가 맡는다.
"""

import json
import os
import stat
from datetime import date, datetime
from pathlib import Path

import pytest

from app.data_core.enums import SourceKind
from app.publishing import dataset_file
from app.publishing.dataset_file import (
    MAX_EXACT_INTEGER,
    ContentInvalid,
    DatasetFileInput,
    PublishRow,
    UnsafePublishPath,
    WriteOutcome,
    build_dataset_file,
    dataset_file_path,
    file_sha256,
    write_dataset_file,
)

URL_A = "https://example.org/a"
URL_B = "https://example.org/b"
DAY_1 = date(2026, 10, 1)
DAY_2 = date(2026, 10, 9)
FIELDS: list[dict[str, object]] = [
    {"name": "number", "type": "int", "key": True},
    {"name": "name", "label": "이름", "type": "text"},
    {"name": "year", "type": "year"},
]
CONTENT = b'{"dataset":"elements"}'
OTHER_CONTENT = b'{"dataset":"other"}'
# 0755 와 다른, 운영자가 정했다고 가정한 기존 폴더 권한
EXISTING_DIR_MODE = 0o750


def external(key: int, url: str = URL_A, as_of: date = DAY_1, **data: object) -> PublishRow:
    return PublishRow(
        row_key=str(key),
        data={"number": key, **data},
        source_kind=SourceKind.EXTERNAL,
        source_url=url,
        as_of_date=as_of,
    )


def self_written(key: int, **data: object) -> PublishRow:
    return PublishRow(row_key=str(key), data={"number": key, **data}, source_kind=SourceKind.SELF, source_url=None, as_of_date=None)


def file_input(rows: list[PublishRow], fields: list[dict[str, object]] | None = None) -> DatasetFileInput:
    return DatasetFileInput(
        slug="elements",
        title="원소",
        version_no=3,
        schema_version=2,
        created_at=datetime(2026, 10, 9, 4, 5, 6),
        fields=FIELDS if fields is None else fields,
        rows=rows,
    )


def parsed(rows: list[PublishRow], fields: list[dict[str, object]] | None = None) -> dict[str, object]:
    return json.loads(build_dataset_file(file_input(rows, fields)))


# --- 직렬화 ---


def test_same_input_gives_same_bytes_regardless_of_row_input_order() -> None:
    rows = [external(2, name="헬륨"), self_written(1, name="수소"), external(3, url=URL_B)]

    first = build_dataset_file(file_input(rows))
    again = build_dataset_file(file_input(rows))
    reordered = build_dataset_file(file_input(list(reversed(rows))))

    assert first == again == reordered


def test_bytes_are_compact_utf8_without_bom_or_ascii_escape() -> None:
    content = build_dataset_file(file_input([external(1, name="수소")]))

    assert not content.startswith(b"\xef\xbb\xbf")
    assert "수소".encode() in content
    assert b"\\u" not in content
    assert b", " not in content and b": " not in content


def test_document_head_matches_contract() -> None:
    document = parsed([external(1)])

    assert {key: document[key] for key in ("dataset", "title", "version", "schema_version", "created_at")} == {
        "dataset": "elements",
        "title": "원소",
        "version": 3,
        "schema_version": 2,
        "created_at": "2026-10-09T04:05:06Z",
    }
    assert document["fields"] == FIELDS


def test_sources_are_deduplicated_and_rows_reference_them() -> None:
    document = parsed(
        [
            external(1),
            external(2),
            external(3, as_of=DAY_2),
            self_written(4),
            self_written(5),
            external(6, url=URL_B),
        ]
    )

    assert document["sources"] == [
        {"id": "s1", "kind": "external", "url": URL_A, "as_of_date": "2026-10-01"},
        {"id": "s2", "kind": "external", "url": URL_A, "as_of_date": "2026-10-09"},
        {"id": "self", "kind": "self"},
        {"id": "s3", "kind": "external", "url": URL_B, "as_of_date": "2026-10-01"},
    ]
    assert [(item["key"], item["source"]) for item in document["rows"]] == [
        ("1", "s1"),
        ("2", "s1"),
        ("3", "s2"),
        ("4", "self"),
        ("5", "self"),
        ("6", "s3"),
    ]


def test_values_skip_null_and_fields_outside_structure() -> None:
    document = parsed([external(1, name=None, year=1766, removed_field="옛 칸")])

    assert document["rows"] == [{"key": "1", "values": {"number": 1, "year": 1766}, "source": "s1"}]


def test_numeric_key_is_ordered_as_number() -> None:
    document = parsed([external(10), external(2), external(1)])

    assert [item["key"] for item in document["rows"]] == ["1", "2", "10"]


def test_text_keys_are_ordered_by_code_point_in_key_field_order() -> None:
    fields: list[dict[str, object]] = [
        {"name": "group", "type": "category", "key": True, "options": ["b", "a"]},
        {"name": "number", "type": "int", "key": True},
    ]
    rows = [
        PublishRow(row_key=f"{group}|{number}", data={"group": group, "number": number}, source_kind=SourceKind.SELF, source_url=None, as_of_date=None)
        for group, number in [("b", 1), ("a", 10), ("a", 2), ("B", 5)]
    ]

    document = parsed(rows, fields)

    assert [item["key"] for item in document["rows"]] == ["B|5", "a|2", "a|10", "b|1"]


@pytest.mark.parametrize(
    "bad_field",
    [
        {"name": "number", "type": "int", "key": True, "label": None},
        {"name": "number", "type": "string", "key": True},
        {"type": "int", "key": True},
    ],
)
def test_field_outside_published_contract_is_rejected(bad_field: dict[str, object]) -> None:
    # published.ts isFieldDefinition 이 거부하는 정의(label null · 모르는 type · name 없음)는 파일로 만들지 않는다.
    with pytest.raises(ValueError, match="field definition 1"):
        build_dataset_file(file_input([external(1)], [bad_field]))


def test_nan_value_is_rejected() -> None:
    with pytest.raises(ValueError):
        build_dataset_file(file_input([external(1, year=float("nan"))]))


def test_no_rows_is_content_invalid() -> None:
    with pytest.raises(ContentInvalid, match="no rows"):
        build_dataset_file(file_input([]))


@pytest.mark.parametrize(
    "bad_value",
    [["a"], {"nested": 1}, float("inf"), MAX_EXACT_INTEGER + 1, -(MAX_EXACT_INTEGER + 1)],
    ids=["array", "object", "infinity", "above-2^53", "below-minus-2^53"],
)
def test_value_outside_published_cell_types_is_content_invalid(bad_value: object) -> None:
    # published.ts isCellValue 는 문자열 · 유한한 숫자 · 참/거짓만 받는다. 2^53 을 넘는 정수는 화면에서 값이 바뀐다.
    with pytest.raises(ContentInvalid, match="value name"):
        build_dataset_file(file_input([external(1, name=bad_value)]))


def test_values_at_published_limits_are_accepted() -> None:
    document = parsed([external(1, name=True, year=MAX_EXACT_INTEGER), external(2, name=-MAX_EXACT_INTEGER, year=1.5)])

    assert [item["values"] for item in document["rows"]] == [
        {"number": 1, "name": True, "year": MAX_EXACT_INTEGER},
        {"number": 2, "name": -MAX_EXACT_INTEGER, "year": 1.5},
    ]


@pytest.mark.parametrize("where", ["value", "title"])
def test_lone_surrogate_is_content_invalid(where: str) -> None:
    lone = "\ud800"
    source = file_input([external(1, name=lone if where == "value" else "수소")])
    if where == "title":
        source = DatasetFileInput(**{**vars(source), "title": lone})

    with pytest.raises(ContentInvalid, match="UTF-8"):
        build_dataset_file(source)


def test_key_values_of_mixed_types_are_content_invalid() -> None:
    # 숫자 구분 칸에 숫자와 글자가 섞이면 정렬 비교가 TypeError 를 낸다.
    rows = [external(1), PublishRow(row_key="x", data={"number": "x"}, source_kind=SourceKind.SELF, source_url=None, as_of_date=None)]

    with pytest.raises(ContentInvalid, match="ordered"):
        build_dataset_file(file_input(rows))


def test_approved_row_without_key_value_is_content_invalid() -> None:
    # 정렬(sorted) 안에서 나는 오류도 ContentInvalid 그대로 올라온다(정렬 try 는 TypeError 만 바꿈).
    rows = [external(1), PublishRow(row_key="2", data={"name": "헬륨"}, source_kind=SourceKind.SELF, source_url=None, as_of_date=None)]

    with pytest.raises(ContentInvalid, match="no key value"):
        build_dataset_file(file_input(rows))


@pytest.mark.parametrize("missing", ["source_url", "as_of_date"])
def test_external_row_without_source_url_or_as_of_date_is_content_invalid(missing: str) -> None:
    row = external(1)
    broken = PublishRow(**{**vars(row), missing: None})

    with pytest.raises(ContentInvalid, match="source url or as-of date"):
        build_dataset_file(file_input([broken]))


def test_non_finite_number_in_field_definition_is_content_invalid() -> None:
    # 값은 _check_values 가 막지만 정의(fields) 안의 무한대는 json.dumps(allow_nan=False)의 ValueError 로만 드러난다.
    # DB 의 JSON 칸은 무한대를 저장하지 못해 이 경우는 DB 테스트 대신 여기서 본다.
    fields: list[dict[str, object]] = [{**FIELDS[0], "max": float("inf")}, *FIELDS[1:]]

    with pytest.raises(ContentInvalid, match="JSON"):
        build_dataset_file(file_input([external(1)], fields))


GOLDEN_FIELDS: list[dict[str, object]] = [
    {"name": "period", "label": "주기", "type": "int", "key": True},
    {"name": "symbol", "label": "기호", "type": "text", "key": True},
    {"name": "name", "label": "이름", "type": "text"},
    {"name": "mass", "type": "number"},
    {"name": "metal", "type": "bool"},
]
GOLDEN_ROWS = [
    PublishRow(
        row_key="2|Li",
        data={"period": 2, "symbol": "Li", "name": "리튬", "mass": 6.94, "metal": True},
        source_kind=SourceKind.EXTERNAL,
        source_url=URL_B,
        as_of_date=DAY_2,
    ),
    PublishRow(
        row_key="1|He",
        data={"period": 1, "symbol": "He", "name": "헬륨", "mass": 4.0026, "metal": False},
        source_kind=SourceKind.SELF,
        source_url=None,
        as_of_date=None,
    ),
    PublishRow(
        row_key="1|H",
        data={"period": 1, "symbol": "H", "name": "수소", "mass": 1.008, "metal": False},
        source_kind=SourceKind.EXTERNAL,
        source_url=URL_A,
        as_of_date=DAY_1,
    ),
]
GOLDEN_SHA256 = "4a6d090354ecd33b88752386dad1901723aa5098560d1034192a849380400f40"


def test_serialized_bytes_match_golden_sha256() -> None:
    # 형식을 바꾸면 done 파일 복구 · 재시도가 content_changed 가 됨(D-30).
    source = DatasetFileInput(
        slug="elements",
        title="원소 주기",
        version_no=1,
        schema_version=1,
        created_at=datetime(2026, 10, 9, 4, 5, 6),
        fields=GOLDEN_FIELDS,
        rows=GOLDEN_ROWS,
    )

    assert file_sha256(build_dataset_file(source)) == GOLDEN_SHA256


# --- 경로 ---


@pytest.mark.parametrize("slug", ["../escape", "a/b", "Upper", "..", "", "a" * 65])
def test_unsafe_slug_is_rejected(tmp_path: Path, slug: str) -> None:
    with pytest.raises(UnsafePublishPath):
        dataset_file_path(tmp_path, slug, 1)


def test_dataset_file_path_is_under_datasets_dir(tmp_path: Path) -> None:
    assert dataset_file_path(tmp_path, "elements", 2) == tmp_path.resolve() / "datasets" / "elements" / "v2.json"


def test_slug_folder_linked_outside_is_rejected(tmp_path: Path) -> None:
    # slug 형식은 맞지만 그 폴더가 발행 폴더 밖을 가리키는 링크인 경우(이탈 검사만 막을 수 있음).
    published = tmp_path / "published"
    (published / "datasets").mkdir(parents=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    (published / "datasets" / "elements").symlink_to(outside, target_is_directory=True)

    with pytest.raises(UnsafePublishPath):
        dataset_file_path(published, "elements", 1)


def test_inner_link_to_other_dataset_folder_is_rejected(tmp_path: Path) -> None:
    # 발행 폴더 안을 가리키는 링크(datasets/a → datasets/b)는 이탈 검사로는 통과하므로 기대 경로 비교로 막는다.
    datasets = tmp_path / "datasets"
    (datasets / "b").mkdir(parents=True)
    (datasets / "a").symlink_to(datasets / "b", target_is_directory=True)

    with pytest.raises(UnsafePublishPath, match="expected path"):
        dataset_file_path(tmp_path, "a", 1)


def test_linked_version_file_is_rejected(tmp_path: Path) -> None:
    folder = tmp_path / "datasets" / "elements"
    folder.mkdir(parents=True)
    (folder / "other.json").write_bytes(CONTENT)
    (folder / "v1.json").symlink_to(folder / "other.json")

    with pytest.raises(UnsafePublishPath, match="expected path"):
        dataset_file_path(tmp_path, "elements", 1)


def test_published_root_link_itself_is_allowed(tmp_path: Path) -> None:
    # 발행 폴더(볼륨 마운트 지점) 자체가 링크인 것은 허용한다(그 아래만 기대 경로와 비교).
    real_root = tmp_path / "real"
    real_root.mkdir()
    linked_root = tmp_path / "linked"
    linked_root.symlink_to(real_root, target_is_directory=True)

    assert dataset_file_path(linked_root, "elements", 1) == real_root.resolve() / "datasets" / "elements" / "v1.json"


@pytest.mark.parametrize("error_type", [OSError, RuntimeError])
def test_resolve_error_becomes_unsafe_path_without_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, error_type: type[Exception]
) -> None:
    # resolve 가 내는 예외(권한 · 링크 순환 등)는 문장에 경로가 들어 있다. 경로 없는 UnsafePublishPath 로 바뀌어야 한다.
    def failing_resolve(self: Path, strict: bool = False) -> Path:
        raise error_type(f"cannot resolve {self}")

    monkeypatch.setattr(Path, "resolve", failing_resolve)

    with pytest.raises(UnsafePublishPath) as raised:
        dataset_file_path(tmp_path, "elements", 1)

    assert str(tmp_path) not in str(raised.value)


# --- 쓰기 ---


def leftover_temp_files(directory: Path) -> list[str]:
    return [path.name for path in directory.iterdir() if path.name.endswith(dataset_file.TEMP_FILE_SUFFIX)]


def test_new_file_is_written_with_public_modes(tmp_path: Path) -> None:
    path = dataset_file_path(tmp_path, "elements", 1)
    # 기본 umask(022)면 chmod 없이도 0755 가 되므로, 좁은 umask 에서도 공개 권한이 되는지 본다.
    previous_umask = os.umask(0o077)
    try:
        outcome = write_dataset_file(tmp_path, path, CONTENT)
    finally:
        os.umask(previous_umask)

    assert outcome is WriteOutcome.WRITTEN
    assert path.read_bytes() == CONTENT
    assert stat.S_IMODE(path.stat().st_mode) == 0o644
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o755
    assert stat.S_IMODE(path.parent.parent.stat().st_mode) == 0o755
    assert leftover_temp_files(path.parent) == []


def test_same_existing_file_is_success(tmp_path: Path) -> None:
    path = dataset_file_path(tmp_path, "elements", 1)
    write_dataset_file(tmp_path, path, CONTENT)

    outcome = write_dataset_file(tmp_path, path, CONTENT)

    assert outcome is WriteOutcome.SAME
    assert path.read_bytes() == CONTENT
    assert leftover_temp_files(path.parent) == []


def test_different_existing_file_is_conflict_and_kept(tmp_path: Path) -> None:
    path = dataset_file_path(tmp_path, "elements", 1)
    write_dataset_file(tmp_path, path, CONTENT)

    outcome = write_dataset_file(tmp_path, path, OTHER_CONTENT)

    assert outcome is WriteOutcome.CONFLICT
    assert path.read_bytes() == CONTENT
    assert leftover_temp_files(path.parent) == []


def test_link_failure_is_failed_without_temp_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = dataset_file_path(tmp_path, "elements", 1)

    def refuse_link(source: object, target: object) -> None:
        raise OSError(1, "hard links are not supported")

    monkeypatch.setattr(dataset_file.os, "link", refuse_link)

    outcome = write_dataset_file(tmp_path, path, CONTENT)

    assert outcome is WriteOutcome.FAILED
    assert not path.exists()
    assert leftover_temp_files(path.parent) == []
    # rename 등으로 대체해 쓰지 않았다(폴더에 아무 파일도 없음).
    assert os.listdir(path.parent) == []


def test_temp_write_failure_is_failed_without_temp_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = dataset_file_path(tmp_path, "elements", 1)

    def refuse_fsync(descriptor: int) -> None:
        raise OSError(28, "no space left on device")

    monkeypatch.setattr(dataset_file.os, "fsync", refuse_fsync)

    outcome = write_dataset_file(tmp_path, path, CONTENT)

    assert outcome is WriteOutcome.FAILED
    assert os.listdir(path.parent) == []


def test_missing_published_dir_is_failed_and_not_created(tmp_path: Path) -> None:
    path = dataset_file_path(tmp_path / "not-mounted", "elements", 1)

    outcome = write_dataset_file(tmp_path / "not-mounted", path, CONTENT)

    assert outcome is WriteOutcome.FAILED
    assert not (tmp_path / "not-mounted").exists()


def test_existing_folders_keep_their_mode(tmp_path: Path) -> None:
    # 이미 있던 폴더는 운영자가 정한 권한일 수 있어 chmod 하지 않는다(새로 만든 폴더만 0755).
    folder = tmp_path / "datasets" / "elements"
    folder.mkdir(parents=True)
    os.chmod(folder, EXISTING_DIR_MODE)
    os.chmod(folder.parent, EXISTING_DIR_MODE)
    path = dataset_file_path(tmp_path, "elements", 1)

    outcome = write_dataset_file(tmp_path, path, CONTENT)

    assert outcome is WriteOutcome.WRITTEN
    assert stat.S_IMODE(folder.stat().st_mode) == EXISTING_DIR_MODE
    assert stat.S_IMODE(folder.parent.stat().st_mode) == EXISTING_DIR_MODE


def test_existing_fifo_at_final_path_is_conflict_without_waiting(tmp_path: Path) -> None:
    # O_NONBLOCK 없이 열면 쓰는 쪽이 없는 FIFO 에서 영원히 기다린다. 대기 없이 충돌로 끝나야 한다.
    path = dataset_file_path(tmp_path, "elements", 1)
    path.parent.mkdir(parents=True)
    os.mkfifo(path)

    outcome = write_dataset_file(tmp_path, path, CONTENT)

    assert outcome is WriteOutcome.CONFLICT
    assert stat.S_ISFIFO(os.lstat(path).st_mode)
    assert leftover_temp_files(path.parent) == []


def test_existing_link_at_final_path_is_conflict_and_target_is_untouched(tmp_path: Path) -> None:
    # 경로 확인 뒤 링크가 생긴 경우(경합): 링크를 따라가 읽지도 쓰지도 않는다. 대상이 같은 바이트여도 충돌.
    folder = tmp_path / "datasets" / "elements"
    folder.mkdir(parents=True)
    target = tmp_path / "target.json"
    target.write_bytes(CONTENT)
    path = folder / "v1.json"
    path.symlink_to(target)

    outcome = write_dataset_file(tmp_path, path, CONTENT)

    assert outcome is WriteOutcome.CONFLICT
    assert path.is_symlink()
    assert target.read_bytes() == CONTENT


def test_same_existing_file_syncs_three_folders(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # 앞선 쓰기가 링크 뒤 폴더 fsync 전에 멈췄을 수 있어 SAME 에서도 3단(slug · datasets · 발행 폴더)을 남긴다.
    path = dataset_file_path(tmp_path, "elements", 1)
    write_dataset_file(tmp_path, path, CONTENT)
    synced: list[Path] = []
    monkeypatch.setattr(dataset_file, "_fsync_dir", synced.append)

    outcome = write_dataset_file(tmp_path, path, CONTENT)

    assert outcome is WriteOutcome.SAME
    assert [folder.resolve() for folder in synced] == [path.parent, tmp_path.resolve() / "datasets", tmp_path.resolve()]


def test_temp_file_mode_is_set_before_fsync(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    original_fchmod = os.fchmod
    original_fsync = os.fsync

    def recording_fchmod(descriptor: int, mode: int) -> None:
        calls.append("fchmod")
        original_fchmod(descriptor, mode)

    def recording_fsync(descriptor: int) -> None:
        calls.append("fsync")
        original_fsync(descriptor)

    monkeypatch.setattr(dataset_file.os, "fchmod", recording_fchmod)
    monkeypatch.setattr(dataset_file.os, "fsync", recording_fsync)
    path = dataset_file_path(tmp_path, "elements", 1)

    outcome = write_dataset_file(tmp_path, path, CONTENT)

    assert outcome is WriteOutcome.WRITTEN
    # 임시 파일: fchmod → fsync, 그 뒤 폴더 fsync 3회
    assert calls == ["fchmod", "fsync", "fsync", "fsync", "fsync"]
