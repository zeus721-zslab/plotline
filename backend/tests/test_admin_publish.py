"""발행(기록본 + 공개 파일) 관리자 API 의 흐름 · 경계 테스트(실제 MariaDB = db-test, 발행 폴더 = tmp_path).

직렬화 · 파일 쓰기 규칙 자체는 test_dataset_file.py(DB 없음)가 맡는다.
"""

import hashlib
import json
import re
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, select, update
from sqlalchemy.orm import Session

from app.admin_imports import publish
from app.admin_imports.paste import save_import
from app.admin_imports.publish import PublishResult, abandon_version, publish_dataset, retry_publish
from app.admin_imports.service import approve_rows_by_kind
from app.data_core.enums import ChangeKind, ImportSourceType, PublishStatus, RowStatus
from app.data_core.models import (
    DataImport,
    Dataset,
    DatasetKeyExclusion,
    DatasetRow,
    DatasetSchema,
    DatasetVersion,
    DatasetVersionRow,
)
from app.publishing import dataset_file
from app.publishing.dataset_file import write_dataset_file
from app.publishing.story_refs import STORY_FILE_MAX_BYTES
from conftest import assert_row_invariant

pytestmark = pytest.mark.db

IMPORTS_PATH = "/api/admin/imports"
DATASETS_PATH = "/api/admin/datasets"
SLUG = "elements"
OTHER_SLUG = "other-set"
SOURCE_URL = "https://example.org/elements"
AS_OF = "2026-10-01"
UTC_ISO_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
FIELDS: list[dict[str, object]] = [
    {"name": "symbol", "type": "text", "key": True},
    {"name": "year", "type": "year"},
    {"name": "note", "type": "text"},
]


def external(symbol: str, year: int = 1800) -> dict[str, object]:
    return {"symbol": symbol, "year": year, "source_kind": "external", "source_url": SOURCE_URL, "as_of_date": AS_OF}


def self_written(symbol: str, year: int = 1800) -> dict[str, object]:
    return {"symbol": symbol, "year": year, "source_kind": "self"}


def paste_and_approve(
    client: TestClient, headers: dict[str, str], rows: list[dict[str, object]], slug: str = SLUG
) -> None:
    payload = json.dumps({"dataset": {"slug": slug, "title": "원소"}, "fields": FIELDS, "rows": rows})
    previewed = client.post(f"{IMPORTS_PATH}/preview", json={"payload": payload, "source_type": "upload"}, headers=headers)
    assert previewed.status_code == 200, previewed.text
    saved = client.post(
        IMPORTS_PATH,
        json={
            "payload": payload,
            "source_type": "upload",
            "create_dataset": previewed.json()["target"]["is_new"],
            "confirm_schema": True,
        },
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    pending = client.get(f"{DATASETS_PATH}/{slug}/rows", params={"status": "pending"}, headers=headers).json()["rows"]
    if pending:
        approved = client.post(
            f"{DATASETS_PATH}/{slug}/rows/approve", json={"row_ids": [item["id"] for item in pending]}, headers=headers
        )
        assert approved.status_code == 200, approved.text


def publish_now(client: TestClient, headers: dict[str, str], slug: str = SLUG) -> httpx.Response:
    return client.post(f"{DATASETS_PATH}/{slug}/publish", headers=headers)


def retry(client: TestClient, headers: dict[str, str], version_no: int, slug: str = SLUG) -> httpx.Response:
    return client.post(f"{DATASETS_PATH}/{slug}/versions/{version_no}/publish", headers=headers)


def stored_version(session: Session, version_no: int) -> DatasetVersion:
    session.expire_all()
    return session.scalars(select(DatasetVersion).where(DatasetVersion.version_no == version_no)).one()


def file_of(published_dir: Path, version_no: int, slug: str = SLUG) -> Path:
    return published_dir / "datasets" / slug / f"v{version_no}.json"


def refuse_link(source: object, target: object) -> None:
    raise OSError(1, "hard links are not supported")


# --- 발행 ---


def test_publish_writes_file_and_marks_done(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe"), self_written("Cu", 1700)])

    response = publish_now(admin_client, admin_headers)

    assert response.status_code == 201, response.text
    body = response.json()
    assert {key: body[key] for key in ("version_no", "status", "path", "row_count", "used_by")} == {
        "version_no": 1,
        "status": "done",
        "path": "/data/datasets/elements/v1.json",
        "row_count": 2,
        "used_by": [],
    }
    assert UTC_ISO_PATTERN.match(body["published_at"])
    content = file_of(published_dir, 1).read_bytes()
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.publish_error) == (PublishStatus.DONE, None)
    assert version.file_sha256 == hashlib.sha256(content).hexdigest()
    document = json.loads(content)
    assert (document["dataset"], document["title"], document["version"], document["schema_version"]) == (
        SLUG,
        "원소",
        1,
        1,
    )
    # 구분 칸(text) 코드포인트 순 · null 칸(note) 제외
    assert document["rows"] == [
        {"key": "Cu", "values": {"symbol": "Cu", "year": 1700}, "source": "self"},
        {"key": "Fe", "values": {"symbol": "Fe", "year": 1800}, "source": "s1"},
    ]
    assert_row_invariant(db_session)


def test_publish_without_approved_rows_is_409_and_creates_nothing(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    payload = json.dumps({"dataset": {"slug": SLUG, "title": "원소"}, "fields": FIELDS, "rows": [external("Fe")]})
    saved = admin_client.post(
        IMPORTS_PATH,
        json={"payload": payload, "source_type": "upload", "create_dataset": True, "confirm_schema": True},
        headers=admin_headers,
    )
    assert saved.status_code == 200, saved.text

    response = publish_now(admin_client, admin_headers)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "publish_empty"
    assert db_session.scalars(select(DatasetVersion)).all() == []
    assert not (published_dir / "datasets").exists()


def test_publish_unchanged_is_409(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    assert publish_now(admin_client, admin_headers).status_code == 201

    response = publish_now(admin_client, admin_headers)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "publish_unchanged"


def test_write_failure_blocks_next_publish_until_retry(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    # monkeypatch.undo() 는 admin_client 픽스처의 설정까지 되돌리므로 범위를 context 로 한정한다.
    with monkeypatch.context() as patch:
        patch.setattr(dataset_file.os, "link", refuse_link)
        failed = publish_now(admin_client, admin_headers)
    paste_and_approve(admin_client, admin_headers, [external("Cu")])

    blocked = publish_now(admin_client, admin_headers)
    retried = retry(admin_client, admin_headers, 1)

    assert failed.status_code == 201, failed.text
    assert failed.json()["status"] == "failed"
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "publish_incomplete"
    assert retried.status_code == 200, retried.text
    assert (retried.json()["status"], retried.json()["row_count"]) == ("done", 1)
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.publish_error) == (PublishStatus.DONE, None)
    assert version.file_sha256 == hashlib.sha256(file_of(published_dir, 1).read_bytes()).hexdigest()
    # 미완료가 풀리면 다음 발행이 된다.
    assert publish_now(admin_client, admin_headers).json()["version_no"] == 2
    assert_row_invariant(db_session)


def test_failed_state_keeps_only_error_code(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    monkeypatch.setattr(dataset_file.os, "link", refuse_link)

    publish_now(admin_client, admin_headers)

    version = stored_version(db_session, 1)
    assert (version.publish_status, version.publish_error, version.published_at) == (
        PublishStatus.FAILED,
        "file_write_failed",
        None,
    )


def test_existing_different_file_is_conflict_and_kept(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    existing = file_of(published_dir, 1)
    existing.parent.mkdir(parents=True)
    existing.write_bytes(b"{}")

    response = publish_now(admin_client, admin_headers)

    assert response.json()["status"] == "failed"
    assert stored_version(db_session, 1).publish_error == "file_conflict"
    assert existing.read_bytes() == b"{}"


def test_retry_after_stop_between_commit_and_status_is_done(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])

    def write_then_stop(published_root: Path, path: Path, content: bytes) -> None:
        # 파일은 다 썼지만 상태를 커밋하기 전에 프로세스가 멈춘 경우를 흉내 낸다.
        write_dataset_file(published_root, path, content)
        raise RuntimeError("stopped after file write")

    with monkeypatch.context() as patch, pytest.raises(RuntimeError):
        patch.setattr(publish, "write_dataset_file", write_then_stop)
        publish_dataset(db_session, SLUG, published_dir)
    written = file_of(published_dir, 1).read_bytes()
    assert stored_version(db_session, 1).publish_status is PublishStatus.PENDING

    def must_not_rebuild(*args: object) -> bytes:
        raise AssertionError("retry rebuilt the file although the stored hash matches")

    # 저장한 해시와 같은 파일이 있으면 바이트를 다시 만들지 않고 done 으로 끝내는지(지름길) 본다.
    with monkeypatch.context() as patch:
        patch.setattr(publish, "_build_content", must_not_rebuild)
        response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "done"
    assert file_of(published_dir, 1).read_bytes() == written
    assert stored_version(db_session, 1).file_sha256 == hashlib.sha256(written).hexdigest()


def test_stored_field_outside_contract_fails_before_commit_and_leaves_no_version(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    # 정의 검사가 label null 을 거부하기 전에 저장된 구조를 흉내 낸다.
    schema = db_session.scalars(select(DatasetSchema)).one()
    schema.fields = [{**FIELDS[0], "label": None}, *FIELDS[1:]]
    db_session.commit()

    # 정의 어긋남도 내용 오류(ContentInvalid)라 커밋 전 롤백 후 409 로 끝난다(D-30).
    response = publish_now(admin_client, admin_headers)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "publish_content_invalid"
    assert db_session.scalars(select(DatasetVersion)).all() == []
    assert not (published_dir / "datasets").exists()


def test_retry_of_done_version_returns_it_unchanged(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    first = publish_now(admin_client, admin_headers).json()

    response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 200, response.text
    assert (response.json()["status"], response.json()["published_at"]) == ("done", first["published_at"])


def test_excluded_key_is_not_in_published_file(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe"), external("Cu")])
    excluded = admin_client.post(f"{DATASETS_PATH}/{SLUG}/exclusions", json={"row_key": "Cu"}, headers=admin_headers)
    assert excluded.status_code == 204, excluded.text

    publish_now(admin_client, admin_headers)

    document = json.loads(file_of(published_dir, 1).read_bytes())
    assert [item["key"] for item in document["rows"]] == ["Fe"]


def test_retry_with_other_dataset_version_number_is_404(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    paste_and_approve(admin_client, admin_headers, [external("Fe")], slug=OTHER_SLUG)
    assert publish_now(admin_client, admin_headers).status_code == 201

    response = retry(admin_client, admin_headers, 1, slug=OTHER_SLUG)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "version_not_found"


# --- 폐기(D-30) ---


def abandon(client: TestClient, headers: dict[str, str], version_no: int, slug: str = SLUG) -> httpx.Response:
    return client.post(f"{DATASETS_PATH}/{slug}/versions/{version_no}/abandon", headers=headers)


def publish_failing(client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch) -> httpx.Response:
    # 링크 미지원으로 쓰기 실패(failed · file_write_failed). 범위를 context 로 한정한다(admin_client 설정 보존).
    with monkeypatch.context() as patch:
        patch.setattr(dataset_file.os, "link", refuse_link)
        return publish_now(client, headers)


def publish_stopping_before_write(session: Session, published_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """기록본 커밋 직후 · 파일 쓰기 전에 멈춘 경우(pending, 파일 없음)를 만든다."""

    def stop(published_root: Path, path: Path, content: bytes) -> None:
        raise RuntimeError("stopped before file write")

    with monkeypatch.context() as patch, pytest.raises(RuntimeError):
        patch.setattr(publish, "write_dataset_file", stop)
        publish_dataset(session, SLUG, published_dir)


def replace_row_data(session: Session, row_key: str, **changes: object) -> None:
    """승인 줄의 저장된 값을 직접 바꾼다(검사를 거치지 않은 옛 데이터 · 결정성이 깨진 경우를 흉내 냄)."""
    row = session.scalars(
        select(DatasetRow).where(DatasetRow.row_key == row_key, DatasetRow.status == RowStatus.APPROVED)
    ).one()
    row.data = {**row.data, **changes}
    session.commit()


def replace_row_columns(session: Session, target_key: str, /, **columns: object) -> None:
    """승인 줄의 칸(row_key · 출처 등)을 직접 바꾼다. 검사를 거치지 않은 옛 데이터를 흉내 낸다(DB 제약은 nullable)."""
    row = session.scalars(
        select(DatasetRow).where(DatasetRow.row_key == target_key, DatasetRow.status == RowStatus.APPROVED)
    ).one()
    for name, value in columns.items():
        setattr(row, name, value)
    session.commit()


@pytest.mark.parametrize("make_incomplete", ["pending", "failed"])
def test_incomplete_version_is_abandoned_keeping_error_and_version_rows(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    make_incomplete: str,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    if make_incomplete == "pending":
        publish_stopping_before_write(db_session, published_dir, monkeypatch)
    else:
        assert publish_failing(admin_client, admin_headers, monkeypatch).json()["status"] == "failed"
    before = stored_version(db_session, 1)
    expected_error = before.publish_error

    response = abandon(admin_client, admin_headers, 1)

    assert response.status_code == 200, response.text
    assert (response.json()["status"], response.json()["published_at"]) == ("abandoned", None)
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.publish_error, version.published_at) == (
        PublishStatus.ABANDONED,
        expected_error,
        None,
    )
    assert db_session.scalars(select(DatasetVersionRow).where(DatasetVersionRow.version_id == version.id)).all() != []


def test_abandon_during_file_write_is_not_revived_by_finish(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    real_write = publish.write_dataset_file

    def abandon_then_write(published_root: Path, path: Path, content: bytes) -> dataset_file.WriteOutcome:
        # 발행이 기록본을 커밋하고 잠금을 놓은 뒤 · 파일을 쓰기 전에 다른 요청이 폐기한 경우.
        abandon_version(db_session, SLUG, 1, published_dir)
        return real_write(published_root, path, content)

    with monkeypatch.context() as patch:
        patch.setattr(publish, "write_dataset_file", abandon_then_write)
        response = publish_now(admin_client, admin_headers)

    assert response.status_code == 201, response.text
    assert response.json()["status"] == "abandoned"
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.published_at) == (PublishStatus.ABANDONED, None)
    # 파일은 써졌지만 지우지 않는다(폐기는 파일을 건드리지 않음).
    assert file_of(published_dir, 1).exists()


@pytest.mark.parametrize("status_before", ["done", "abandoned"])
def test_done_or_abandoned_version_is_not_abandonable(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    status_before: str,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    if status_before == "done":
        assert publish_now(admin_client, admin_headers).json()["status"] == "done"
    else:
        publish_failing(admin_client, admin_headers, monkeypatch)
        assert abandon(admin_client, admin_headers, 1).status_code == 200

    response = abandon(admin_client, admin_headers, 1)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "version_not_abandonable"


def test_publish_after_abandon_uses_next_number_and_keeps_existing_file(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    existing = file_of(published_dir, 1)
    existing.parent.mkdir(parents=True)
    existing.write_bytes(b"{}")
    assert publish_now(admin_client, admin_headers).json()["status"] == "failed"
    assert abandon(admin_client, admin_headers, 1).status_code == 200

    response = publish_now(admin_client, admin_headers)

    assert response.status_code == 201, response.text
    assert (response.json()["version_no"], response.json()["status"]) == (2, "done")
    # 폐기는 공개 URL 의 바이트를 건드리지 않는다(지우지도 옮기지도 않음). 번호 1은 소진.
    assert existing.read_bytes() == b"{}"
    assert stored_version(db_session, 1).publish_status is PublishStatus.ABANDONED


def test_abandon_with_other_dataset_version_number_is_404(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    paste_and_approve(admin_client, admin_headers, [external("Fe")], slug=OTHER_SLUG)
    assert publish_now(admin_client, admin_headers).status_code == 201

    response = abandon(admin_client, admin_headers, 1, slug=OTHER_SLUG)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "version_not_found"


def test_retry_of_abandoned_version_is_409(
    admin_client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    publish_failing(admin_client, admin_headers, monkeypatch)
    assert abandon(admin_client, admin_headers, 1).status_code == 200

    response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "version_abandoned"


# --- 계획 기준: 마지막 done(D-30) ---


def next_version(client: TestClient, headers: dict[str, str]) -> dict[str, object]:
    response = client.get(f"{DATASETS_PATH}/{SLUG}/versions/next", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_plan_compares_with_last_done_ignoring_failed_and_abandoned(
    admin_client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    assert publish_now(admin_client, admin_headers).json()["status"] == "done"
    paste_and_approve(admin_client, admin_headers, [external("Cu")])
    assert publish_failing(admin_client, admin_headers, monkeypatch).json()["version_no"] == 2

    # 실패한 v2(Fe · Cu)가 아니라 공개된 v1(Fe) 대비로 센다.
    with_failed = next_version(admin_client, admin_headers)
    assert abandon(admin_client, admin_headers, 2).status_code == 200
    with_abandoned = next_version(admin_client, admin_headers)

    expected = {"next_version_no": 3, "row_count": 2, "carried": 1, "added": 1, "replaced": 0, "removed": 0}
    for preview in (with_failed, with_abandoned):
        assert {key: preview[key] for key in expected} == expected
        assert preview["unchanged"] is False


def test_unchanged_is_judged_against_last_done_after_abandon(
    admin_client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    assert publish_now(admin_client, admin_headers).json()["status"] == "done"
    paste_and_approve(admin_client, admin_headers, [external("Cu")])
    publish_failing(admin_client, admin_headers, monkeypatch)
    assert abandon(admin_client, admin_headers, 2).status_code == 200
    # 폐기한 v2 와 달라졌지만 공개된 v1 과는 같다 → 변화 없음.
    excluded = admin_client.post(f"{DATASETS_PATH}/{SLUG}/exclusions", json={"row_key": "Cu"}, headers=admin_headers)
    assert excluded.status_code == 204, excluded.text

    preview = next_version(admin_client, admin_headers)
    detail = admin_client.get(f"{DATASETS_PATH}/{SLUG}", headers=admin_headers).json()
    blocked = publish_now(admin_client, admin_headers)

    assert (preview["next_version_no"], preview["unchanged"]) == (3, True)
    assert detail["has_unpublished_changes"] is False
    assert blocked.json()["detail"]["code"] == "publish_unchanged"


def test_first_publish_after_only_abandoned_versions_counts_all_as_added(
    admin_client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    publish_failing(admin_client, admin_headers, monkeypatch)
    assert abandon(admin_client, admin_headers, 1).status_code == 200

    preview = next_version(admin_client, admin_headers)

    assert {key: preview[key] for key in ("next_version_no", "carried", "added", "unchanged")} == {
        "next_version_no": 2,
        "carried": 0,
        "added": 1,
        "unchanged": False,
    }


# --- 내용 오류(D-30) ---


def make_mixed_key_types(session: Session) -> None:
    # 구분 칸을 숫자 형식으로 바꾸고 한 줄만 숫자 값으로 둔다(정렬 비교 TypeError).
    schema = session.scalars(select(DatasetSchema)).one()
    schema.fields = [{**FIELDS[0], "type": "int"}, *FIELDS[1:]]
    session.commit()
    replace_row_data(session, "Fe", symbol=1)


# 고립 서로게이트 · 정의(fields) 안의 무한대는 DB 가 저장 단계에서 거부한다(JSON CHECK, 4025). 직렬화 검사는
# test_dataset_file.py 가 맡는다. row_key 없는 줄은 기록본 후보에서 빠져 발행에 닿지 않으므로 재시도 테스트가 맡는다.
CONTENT_BREAKERS = {
    "array-value": lambda session: replace_row_data(session, "Fe", note=["a"]),
    "integer-above-2^53": lambda session: replace_row_data(session, "Fe", year=2**53 + 1),
    "mixed-key-types": make_mixed_key_types,
    "missing-key-value": lambda session: replace_row_data(session, "Fe", symbol=None),
    "external-without-source-url": lambda session: replace_row_columns(session, "Fe", source_url=None),
    "missing-source-kind": lambda session: replace_row_columns(session, "Fe", source_kind=None),
}


@pytest.mark.parametrize("breaker", CONTENT_BREAKERS.values(), ids=CONTENT_BREAKERS.keys())
def test_publish_with_invalid_content_is_409_and_leaves_no_version(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    breaker: Callable[[Session], None],
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe"), external("Cu")])
    breaker(db_session)

    response = publish_now(admin_client, admin_headers)

    assert response.status_code == 409, response.text
    assert response.json()["detail"]["code"] == "publish_content_invalid"
    assert db_session.scalars(select(DatasetVersion)).all() == []
    assert db_session.scalars(select(DatasetVersionRow)).all() == []
    assert not (published_dir / "datasets").exists()


def test_retry_with_invalid_content_commits_failed_content_invalid(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    publish_failing(admin_client, admin_headers, monkeypatch)
    stored_hash = stored_version(db_session, 1).file_sha256
    replace_row_data(db_session, "Fe", note=["a"])

    response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 200, response.text
    assert (response.json()["status"], response.json()["publish_error"]) == ("failed", "content_invalid")
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.publish_error, version.file_sha256) == (
        PublishStatus.FAILED,
        "content_invalid",
        stored_hash,
    )
    assert not file_of(published_dir, 1).exists()


def test_retry_with_version_row_without_row_key_commits_failed_content_invalid(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    publish_failing(admin_client, admin_headers, monkeypatch)
    # 기록본에 이미 든 줄의 row_key 가 비면(발행 후보 규칙을 거치지 않음) 500 이 아니라 내용 오류로 끝나야 한다.
    replace_row_columns(db_session, "Fe", row_key=None)

    response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 200, response.text
    assert (response.json()["status"], response.json()["publish_error"]) == ("failed", "content_invalid")
    assert stored_version(db_session, 1).publish_status is PublishStatus.FAILED
    assert not file_of(published_dir, 1).exists()


def test_retry_with_changed_bytes_keeps_stored_hash_and_writes_nothing(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    publish_failing(admin_client, admin_headers, monkeypatch)
    stored_hash = stored_version(db_session, 1).file_sha256
    # 형식은 맞지만 발행 때와 다른 바이트가 나오는 경우(결정성이 깨짐).
    replace_row_data(db_session, "Fe", year=1900)

    response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 200, response.text
    assert (response.json()["status"], response.json()["publish_error"]) == ("failed", "content_changed")
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.file_sha256) == (PublishStatus.FAILED, stored_hash)
    assert not file_of(published_dir, 1).exists()


def test_retry_without_stored_hash_stores_rebuilt_hash(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    publish_failing(admin_client, admin_headers, monkeypatch)
    # 해시 칸이 생기기 전(D-29 마이그레이션 이전)에 만든 기록본을 흉내 낸다.
    stored_version(db_session, 1).file_sha256 = None
    db_session.commit()

    response = retry(admin_client, admin_headers, 1)

    assert response.json()["status"] == "done"
    assert stored_version(db_session, 1).file_sha256 == hashlib.sha256(file_of(published_dir, 1).read_bytes()).hexdigest()


# --- done 파일 유실(D-30) ---


def test_retry_of_done_version_with_missing_file_rewrites_same_bytes(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    first = publish_now(admin_client, admin_headers).json()
    written = file_of(published_dir, 1).read_bytes()
    file_of(published_dir, 1).unlink()

    response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 200, response.text
    assert (response.json()["status"], response.json()["published_at"]) == ("done", first["published_at"])
    assert file_of(published_dir, 1).read_bytes() == written


def test_retry_of_done_version_with_missing_file_and_changed_bytes_is_409(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    assert publish_now(admin_client, admin_headers).json()["status"] == "done"
    stored_hash = stored_version(db_session, 1).file_sha256
    file_of(published_dir, 1).unlink()
    replace_row_data(db_session, "Fe", year=1900)

    response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "content_changed"
    assert not file_of(published_dir, 1).exists()
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.file_sha256) == (PublishStatus.DONE, stored_hash)


def test_retry_of_done_version_with_missing_file_and_write_failure_is_409(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    assert publish_now(admin_client, admin_headers).json()["status"] == "done"
    file_of(published_dir, 1).unlink()

    with monkeypatch.context() as patch:
        patch.setattr(dataset_file.os, "link", refuse_link)
        response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "publish_file_missing"
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.publish_error) == (PublishStatus.DONE, None)


def test_retry_of_done_version_with_file_syncs_folders_and_ignores_sync_failure(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    assert publish_now(admin_client, admin_headers).json()["status"] == "done"
    synced: list[Path] = []

    def failing_fsync_dir(directory: Path) -> None:
        synced.append(directory)
        raise OSError(5, "input/output error")

    # 파일은 있으므로 폴더 fsync 가 실패해도 409 가 아니라 200 · done 그대로다.
    with monkeypatch.context() as patch:
        patch.setattr(dataset_file, "_fsync_dir", failing_fsync_dir)
        response = retry(admin_client, admin_headers, 1)

    assert response.status_code == 200, response.text
    assert (response.json()["status"], response.json()["file_present"]) == ("done", True)
    assert synced != []
    version = stored_version(db_session, 1)
    assert (version.publish_status, version.publish_error) == (PublishStatus.DONE, None)


def test_retry_shortcut_syncs_folders_before_done(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])

    def write_then_stop(published_root: Path, path: Path, content: bytes) -> None:
        write_dataset_file(published_root, path, content)
        raise RuntimeError("stopped after file write")

    with monkeypatch.context() as patch, pytest.raises(RuntimeError):
        patch.setattr(publish, "write_dataset_file", write_then_stop)
        publish_dataset(db_session, SLUG, published_dir)
    synced: list[Path] = []
    with monkeypatch.context() as patch:
        patch.setattr(dataset_file, "_fsync_dir", synced.append)
        response = retry(admin_client, admin_headers, 1)

    assert response.json()["status"] == "done"
    root = published_dir.resolve()
    assert [folder.resolve() for folder in synced] == [root / "datasets" / SLUG, root / "datasets", root]


# --- 동시 재시도(별도 세션 2개, 실제 커밋) ---


CONCURRENT_SLUG = "concurrent-retry"
CONCURRENT_WORKERS = 2


def remove_dataset(engine: Engine, slug: str) -> None:
    """실제 커밋으로 만든 묶음을 지운다(테스트 DB 정리). FK 순서: 기록본 줄 → 기록본 → 공개 제외 → 줄 → 입력 → 구조 → 묶음."""
    with Session(engine) as session:
        dataset_id = session.scalar(select(Dataset.id).where(Dataset.slug == slug))
        if dataset_id is None:
            return
        version_ids = select(DatasetVersion.id).where(DatasetVersion.dataset_id == dataset_id)
        session.execute(delete(DatasetVersionRow).where(DatasetVersionRow.version_id.in_(version_ids)))
        session.execute(delete(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id))
        session.execute(delete(DatasetKeyExclusion).where(DatasetKeyExclusion.dataset_id == dataset_id))
        # 줄끼리 prev_row_id 로 이어져 있어 먼저 끊는다(한 문장 삭제 중 FK 검사 순서에 기대지 않음).
        session.execute(update(DatasetRow).where(DatasetRow.dataset_id == dataset_id).values(prev_row_id=None))
        session.execute(delete(DatasetRow).where(DatasetRow.dataset_id == dataset_id))
        session.execute(delete(DataImport).where(DataImport.dataset_id == dataset_id))
        session.execute(delete(DatasetSchema).where(DatasetSchema.dataset_id == dataset_id))
        session.execute(delete(Dataset).where(Dataset.id == dataset_id))
        session.commit()


def test_concurrent_retries_of_same_pending_version_finish_once(
    db_engine: Engine, published_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = json.dumps(
        {"dataset": {"slug": CONCURRENT_SLUG, "title": "동시"}, "fields": FIELDS, "rows": [external("Fe")]}
    )
    remove_dataset(db_engine, CONCURRENT_SLUG)
    try:
        with Session(db_engine) as setup:
            save_import(setup, None, payload, ImportSourceType.UPLOAD, None, True, True)
            assert approve_rows_by_kind(setup, CONCURRENT_SLUG, ChangeKind.NEW) == 1

            def stop(published_root: Path, path: Path, content: bytes) -> None:
                raise RuntimeError("stopped before file write")

            with monkeypatch.context() as patch, pytest.raises(RuntimeError):
                patch.setattr(publish, "write_dataset_file", stop)
                publish_dataset(setup, CONCURRENT_SLUG, published_dir)
            setup.rollback()

        barrier = threading.Barrier(CONCURRENT_WORKERS)

        def run_retry() -> PublishResult:
            with Session(db_engine) as worker:
                barrier.wait()
                return retry_publish(worker, CONCURRENT_SLUG, 1, published_dir)

        with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as pool:
            results = [future.result() for future in [pool.submit(run_retry) for _ in range(CONCURRENT_WORKERS)]]

        assert [result.status for result in results] == [PublishStatus.DONE] * CONCURRENT_WORKERS
        published_ats = {result.published_at for result in results}
        assert len(published_ats) == 1 and None not in published_ats
        folder = published_dir / "datasets" / CONCURRENT_SLUG
        assert sorted(path.name for path in folder.iterdir()) == ["v1.json"]
    finally:
        remove_dataset(db_engine, CONCURRENT_SLUG)


# --- 이 묶음을 쓰는 이야기 ---


def write_story(published_dir: Path, name: str, content: str | bytes) -> None:
    stories = published_dir / "stories"
    stories.mkdir(exist_ok=True)
    path = stories / name
    if isinstance(content, bytes):
        path.write_bytes(content)
    else:
        path.write_text(content, encoding="utf-8")


def story(story_id: str, references: dict[str, tuple[int, str]]) -> str:
    return json.dumps(
        {
            "story": story_id,
            "title": f"{story_id} 제목",
            "published_at": "2026-10-09T00:00:00Z",
            "datasets": {name: {"version": version, "path": path} for name, (version, path) in references.items()},
        }
    )


def test_versions_list_shows_story_usage_and_skips_broken_files(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    write_story(published_dir, "uses.json", story("uses", {"elements": (1, "/data/datasets/elements/v1.json")}))
    write_story(published_dir, "other.json", story("other", {"x": (3, "/data/datasets/elements-ko/v3.json")}))
    write_story(published_dir, "broken.json", "{not json")
    write_story(published_dir, "wrong-shape.json", json.dumps({"story": "s", "title": "t", "datasets": []}))
    write_story(published_dir, "huge.json", b" " * (STORY_FILE_MAX_BYTES + 1))
    write_story(published_dir, "index.json", "{not a story}")

    published = publish_now(admin_client, admin_headers).json()
    listed = admin_client.get(f"{DATASETS_PATH}/{SLUG}/versions", headers=admin_headers).json()

    expected = [{"story": "uses", "title": "uses 제목", "version": 1, "version_status": "done"}]
    assert published["used_by"] == expected
    assert listed["used_by"] == expected
    assert (listed["skipped_story_files"], listed["skipped_references"]) == (3, 0)
    version = listed["versions"][0]
    assert {key: version[key] for key in ("version_no", "status", "path", "row_count", "file_present")} == {
        "version_no": 1,
        "status": "done",
        "path": "/data/datasets/elements/v1.json",
        "row_count": 1,
        "file_present": True,
    }
    assert UTC_ISO_PATTERN.match(version["published_at"])


def list_history(client: TestClient, headers: dict[str, str]) -> dict[str, object]:
    response = client.get(f"{DATASETS_PATH}/{SLUG}/versions", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def file_present_by_version(history: dict[str, object]) -> dict[int, bool]:
    versions = history["versions"]
    assert isinstance(versions, list)
    return {version["version_no"]: version["file_present"] for version in versions}


def test_abandoned_version_with_remaining_file_shows_file_present(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    # 다른 바이트의 파일이 미리 있어 실패(file_conflict) → 폐기. 파일은 지우지 않으므로 공개 URL 에 남아 있다(D-30).
    existing = file_of(published_dir, 1)
    existing.parent.mkdir(parents=True)
    existing.write_bytes(b"{}")
    failed = publish_now(admin_client, admin_headers).json()

    abandoned = abandon(admin_client, admin_headers, 1)

    assert failed["file_present"] is True
    assert abandoned.status_code == 200, abandoned.text
    assert (abandoned.json()["status"], abandoned.json()["file_present"]) == ("abandoned", True)
    assert file_present_by_version(list_history(admin_client, admin_headers)) == {1: True}


def test_done_version_whose_file_was_deleted_shows_file_missing(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    assert publish_failing(admin_client, admin_headers, monkeypatch).json()["file_present"] is False
    assert retry(admin_client, admin_headers, 1).json()["file_present"] is True
    file_of(published_dir, 1).unlink()

    history = list_history(admin_client, admin_headers)
    restored = retry(admin_client, admin_headers, 1)

    assert file_present_by_version(history) == {1: False}
    assert (restored.json()["status"], restored.json()["file_present"]) == ("done", True)


def test_story_reference_shows_status_of_referenced_version(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paste_and_approve(admin_client, admin_headers, [external("Fe")])
    publish_failing(admin_client, admin_headers, monkeypatch)
    assert abandon(admin_client, admin_headers, 1).status_code == 200
    assert publish_now(admin_client, admin_headers).json()["version_no"] == 2
    write_story(published_dir, "a-done.json", story("done", {"main": (2, "/data/datasets/elements/v2.json")}))
    write_story(published_dir, "b-abandoned.json", story("abandoned", {"main": (1, "/data/datasets/elements/v1.json")}))
    write_story(published_dir, "c-missing.json", story("missing", {"main": (9, "/data/datasets/elements/v9.json")}))
    write_story(published_dir, "d-mismatch.json", story("mismatch", {"main": (2, "/data/datasets/elements/v3.json")}))

    history = list_history(admin_client, admin_headers)
    retried = retry(admin_client, admin_headers, 2).json()

    expected = [("done", 2, "done"), ("abandoned", 1, "abandoned"), ("missing", 9, "missing")]
    for used_by in (history["used_by"], retried["used_by"]):
        assert isinstance(used_by, list)
        assert [(use["story"], use["version"], use["version_status"]) for use in used_by] == expected
    assert (history["skipped_story_files"], history["skipped_references"]) == (0, 1)
