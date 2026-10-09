"""이야기 등록 · 발행 · 재시도 · 되돌리기 · 공개 파일 다시 쓰기와 데이터 판 내용 API 의 흐름 · 경계 테스트(D-37, 실제 MariaDB = db-test, 발행 폴더 = tmp_path).

인증(401) · Origin(403) · no-store 는 test_admin_auth.py 의 라우트 순회 테스트가 admin_router 아래 새 경로까지 함께 덮는다.
"""

import json
import os
import shutil
import stat
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app.admin_stories import service
from app.data_core.enums import PublishStatus
from app.data_core.models import Dataset, DatasetVersion, Story, StoryVersion
from app.publishing import story_file
from app.publishing.story_refs import STORY_FILE_MAX_BYTES, find_story_references
from test_admin_publish import external, paste_and_approve, publish_now

pytestmark = pytest.mark.db

STORIES_PATH = "/api/admin/stories"
DATASETS_PATH = "/api/admin/datasets"
FIRST = "element-discovery"
SECOND = "light-age"
FIRST_DATASETS = {"elements_ko": 1, "element_discoveries": 1}
SECOND_DATASETS = {"sky_objects": 1, "earth_moments": 1}
TITLE = "원소는 언제 발견됐을까"
SUMMARY = "고대부터 오늘까지, 주기율표가 채워진 순서를 따라갑니다."
# 공개 계약(frontend/src/lib/story/published.ts PublishedStory · StoryDatasetReference · StoryIndexEntry)의 키 집합
STORY_KEYS = {"story", "title", "published_at", "datasets"}
REFERENCE_KEYS = {"version", "path"}
INDEX_KEYS = {"stories"}
INDEX_ENTRY_KEYS = {"story", "title", "summary", "published_at"}
FILE_MODE = 0o644
# 다시 쓰기가 저장된 판 발행 시각을 쓰는지 보려고 DB 에 넣는 지난 시각(UTC)
STORED_PUBLISHED_AT = datetime(2020, 1, 2, 3, 4, 5)


def publish_dataset_version(client: TestClient, headers: dict[str, str], slug: str, symbol: str) -> None:
    paste_and_approve(client, headers, [external(symbol)], slug=slug)
    response = publish_now(client, headers, slug=slug)
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "done"


def prepare(client: TestClient, headers: dict[str, str], datasets: dict[str, int]) -> None:
    """묶음마다 v1 공개 판을 만든다."""
    for slug in datasets:
        publish_dataset_version(client, headers, slug, "Fe")


def publish(
    client: TestClient,
    headers: dict[str, str],
    story: str = FIRST,
    title: str = TITLE,
    summary: str = SUMMARY,
    datasets: dict[str, int] | None = None,
) -> httpx.Response:
    body = {"title": title, "summary": summary, "datasets": FIRST_DATASETS if datasets is None else datasets}
    return client.post(f"{STORIES_PATH}/{story}/publish", json=body, headers=headers)


def stories_dir(published_dir: Path) -> Path:
    return published_dir / "stories"


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_bytes())


def temp_files(published_dir: Path) -> list[str]:
    return [path.name for path in stories_dir(published_dir).glob(".*.tmp")]


def story_versions(session: Session, story: str) -> list[StoryVersion]:
    session.expire_all()
    return list(
        session.scalars(
            select(StoryVersion).join(Story, Story.id == StoryVersion.story_id).where(Story.slug == story)
            .order_by(StoryVersion.version_no)
        )
    )


def first_published_at(session: Session, story: str) -> object:
    session.expire_all()
    return session.scalar(select(Story.first_published_at).where(Story.slug == story))


# --- 발행 ---


def test_first_publish_writes_story_file_and_index(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)

    response = publish(admin_client, admin_headers, title=f"  {TITLE} ", summary=f"{SUMMARY}\n")

    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["story"], body["version_no"], body["status"], body["publish_error"]) == (FIRST, 1, "done", None)
    story_document = read_json(stories_dir(published_dir) / f"{FIRST}.json")
    assert story_document == {
        "story": FIRST,
        "title": TITLE,
        "published_at": body["published_at"],
        "datasets": {
            "elements_ko": {"version": 1, "path": "/data/datasets/elements_ko/v1.json"},
            "element_discoveries": {"version": 1, "path": "/data/datasets/element_discoveries/v1.json"},
        },
    }
    assert read_json(stories_dir(published_dir) / "index.json") == {
        "stories": [{"story": FIRST, "title": TITLE, "summary": SUMMARY, "published_at": body["published_at"]}]
    }
    assert first_published_at(db_session, FIRST) is not None
    versions = story_versions(db_session, FIRST)
    assert [(version.version_no, version.publish_status, version.datasets) for version in versions] == [
        (1, PublishStatus.DONE, FIRST_DATASETS)
    ]
    assert temp_files(published_dir) == []


def test_story_file_and_index_keys_match_public_contract(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201

    story_path = stories_dir(published_dir) / f"{FIRST}.json"
    index_path = stories_dir(published_dir) / "index.json"
    story_document = read_json(story_path)
    index_document = read_json(index_path)
    assert set(story_document) == STORY_KEYS
    assert all(set(reference) == REFERENCE_KEYS for reference in story_document["datasets"].values())
    assert set(index_document) == INDEX_KEYS
    assert all(set(entry) == INDEX_ENTRY_KEYS for entry in index_document["stories"])
    for path in (story_path, index_path):
        assert stat.S_IMODE(os.stat(path).st_mode) == FILE_MODE
    # 데이터 발행 화면의 "쓰는 이야기"(story_refs)가 같은 파일을 형식 검사로 읽는다.
    usage = find_story_references(published_dir, "elements_ko")
    assert [(reference.story, reference.version) for reference in usage.references] == [(FIRST, 1)]
    assert usage.skipped_files == 0


def test_republish_keeps_first_published_at_and_index_order(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, {**FIRST_DATASETS, **SECOND_DATASETS})
    first = publish(admin_client, admin_headers).json()
    assert publish(admin_client, admin_headers, story=SECOND, title="밤하늘은 과거다", datasets=SECOND_DATASETS).status_code == 201
    kept = first_published_at(db_session, FIRST)

    republished = publish(admin_client, admin_headers, summary="바뀐 요약")

    assert republished.status_code == 201, republished.text
    assert republished.json()["version_no"] == 2
    assert first_published_at(db_session, FIRST) == kept
    entries = read_json(stories_dir(published_dir) / "index.json")["stories"]
    assert [entry["story"] for entry in entries] == [FIRST, SECOND]
    assert entries[0]["summary"] == "바뀐 요약"
    assert entries[0]["published_at"] == first["published_at"]
    assert read_json(stories_dir(published_dir) / f"{FIRST}.json")["published_at"] == republished.json()["published_at"]


def test_same_content_is_409_unchanged(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201

    response = publish(admin_client, admin_headers, title=f" {TITLE} ")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "publish_unchanged"
    assert len(story_versions(db_session, FIRST)) == 1


@pytest.mark.parametrize(
    ("datasets", "status_code", "code"),
    [
        ({"elements_ko": 1}, 422, "datasets_mismatch"),
        ({"elements_ko": 1, "element_discoveries": 1, "sky_objects": 1}, 422, "datasets_mismatch"),
        ({"elements_ko": 1, "element_discoveries": 9}, 409, "dataset_version_not_done"),
    ],
)
def test_invalid_dataset_choice_is_rejected_without_version(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    datasets: dict[str, int],
    status_code: int,
    code: str,
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)

    response = publish(admin_client, admin_headers, datasets=datasets)

    assert response.status_code == status_code, response.text
    assert response.json()["detail"]["code"] == code
    assert story_versions(db_session, FIRST) == []
    assert not stories_dir(published_dir).exists()


def test_failed_dataset_version_is_not_choosable(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    mark_dataset_version(db_session, "element_discoveries", 1, PublishStatus.FAILED)

    response = publish(admin_client, admin_headers)

    assert response.status_code == 409
    assert response.json()["detail"] == {
        "code": "dataset_version_not_done",
        "message": response.json()["detail"]["message"],
        "problems": ["element_discoveries v1"],
    }


def test_missing_dataset_file_is_409(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    (published_dir / "datasets" / "elements_ko" / "v1.json").unlink()

    response = publish(admin_client, admin_headers)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "dataset_file_missing"
    assert story_versions(db_session, FIRST) == []


def test_unknown_story_is_404(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    assert publish(admin_client, admin_headers, story="no-such-story").status_code == 404
    assert admin_client.get(f"{STORIES_PATH}/no-such-story", headers=admin_headers).status_code == 404


# --- 쓰기 실패 · 재시도 ---


def fail_story_file(monkeypatch: pytest.MonkeyPatch) -> None:
    original = service.replace_file

    def failing(path: Path, content: bytes) -> None:
        if path.name == f"{FIRST}.json":
            raise OSError(28, "no space left")
        original(path, content)

    monkeypatch.setattr(service, "replace_file", failing)


def fail_index_rename(monkeypatch: pytest.MonkeyPatch) -> None:
    # 임시 파일을 쓴 뒤 rename 단계에서 실패시켜 임시 파일 정리까지 본다.
    original = os.replace

    def failing(source: object, target: object) -> None:
        if Path(str(target)).name == "index.json":
            raise OSError(5, "io error")
        original(source, target)

    monkeypatch.setattr(story_file.os, "replace", failing)


@pytest.mark.parametrize(
    ("break_write", "error_code", "story_file_written"),
    [(fail_story_file, "story_file_write_failed", False), (fail_index_rename, "index_write_failed", True)],
)
def test_write_failure_is_failed_and_retry_finishes(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    published_dir: Path,
    break_write: object,
    error_code: str,
    story_file_written: bool,
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    with pytest.MonkeyPatch.context() as patch:
        assert callable(break_write)
        break_write(patch)
        failed = publish(admin_client, admin_headers)

    assert failed.status_code == 201, failed.text
    assert (failed.json()["status"], failed.json()["publish_error"]) == ("failed", error_code)
    assert (stories_dir(published_dir) / f"{FIRST}.json").exists() is story_file_written
    assert not (stories_dir(published_dir) / "index.json").exists()
    assert temp_files(published_dir) == []
    assert first_published_at(db_session, FIRST) is None

    retried = admin_client.post(f"{STORIES_PATH}/{FIRST}/versions/1/retry", headers=admin_headers)
    assert retried.status_code == 200, retried.text
    assert (retried.json()["version_no"], retried.json()["status"], retried.json()["publish_error"]) == (1, "done", None)
    assert read_json(stories_dir(published_dir) / f"{FIRST}.json")["title"] == TITLE
    assert [entry["story"] for entry in read_json(stories_dir(published_dir) / "index.json")["stories"]] == [FIRST]
    assert first_published_at(db_session, FIRST) is not None
    assert temp_files(published_dir) == []

    again = admin_client.post(f"{STORIES_PATH}/{FIRST}/versions/1/retry", headers=admin_headers)
    assert again.status_code == 409
    assert again.json()["detail"]["code"] == "version_not_retryable"


def test_missing_published_dir_is_failed_without_creating_it(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    # 볼륨이 빠진 상황: 발행 폴더를 통째로 지우고, 묶음 파일 검사만 통과시킨다(폴더가 없으면 파일도 없으므로).
    shutil.rmtree(published_dir)
    monkeypatch.setattr(service, "_file_present", lambda *args: True)

    response = publish(admin_client, admin_headers)

    assert response.status_code == 201, response.text
    assert (response.json()["status"], response.json()["publish_error"]) == ("failed", "publish_dir_missing")
    assert not published_dir.exists()


def publish_failed(client: TestClient, headers: dict[str, str], summary: str) -> None:
    with pytest.MonkeyPatch.context() as patch:
        fail_story_file(patch)
        response = publish(client, headers, summary=summary)
    assert (response.status_code, response.json()["status"]) == (201, "failed"), response.text


@pytest.mark.parametrize("summary", [SUMMARY, "새 요약"], ids=["same_as_latest_done", "new_content"])
def test_failed_latest_does_not_block_publish(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path, summary: str
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    publish_failed(admin_client, admin_headers, summary="실패한 요약")

    # 최신 판이 실패면 공개 파일이 그 판 내용일 수 있어, 최신 공개 판(v1)과 같은 내용도 새 판으로 발행한다.
    response = publish(admin_client, admin_headers, summary=summary)

    assert response.status_code == 201, response.text
    assert (response.json()["version_no"], response.json()["status"]) == (3, "done")
    assert read_json(stories_dir(published_dir) / "index.json")["stories"][0]["summary"] == summary
    assert [version.publish_status for version in story_versions(db_session, FIRST)] == [
        PublishStatus.DONE,
        PublishStatus.FAILED,
        PublishStatus.DONE,
    ]


def test_pending_latest_blocks_publish(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    # pending 판은 결과 상태와 함께 커밋되어 보통 남지 않는다. 남아 있는 상황을 행으로 직접 만든다.
    story_id = db_session.scalar(select(Story.id).where(Story.slug == FIRST))
    db_session.add(
        StoryVersion(
            story_id=story_id,
            version_no=2,
            title=TITLE,
            summary="진행 중",
            datasets=FIRST_DATASETS,
            publish_status=PublishStatus.PENDING,
        )
    )
    db_session.commit()

    response = publish(admin_client, admin_headers, summary="새 요약")

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "publish_incomplete"
    assert len(story_versions(db_session, FIRST)) == 2


# --- 되돌리기 ---


def test_restore_publishes_old_content_as_new_version(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    assert publish(admin_client, admin_headers, summary="바뀐 요약").status_code == 201

    current = admin_client.post(f"{STORIES_PATH}/{FIRST}/versions/2/restore", headers=admin_headers)
    restored = admin_client.post(f"{STORIES_PATH}/{FIRST}/versions/1/restore", headers=admin_headers)

    assert current.status_code == 409
    assert current.json()["detail"]["code"] == "version_not_restorable"
    assert restored.status_code == 201, restored.text
    assert (restored.json()["version_no"], restored.json()["status"]) == (3, "done")
    versions = story_versions(db_session, FIRST)
    assert [(version.title, version.summary, version.datasets) for version in versions] == [
        (TITLE, SUMMARY, FIRST_DATASETS),
        (TITLE, "바뀐 요약", FIRST_DATASETS),
        (TITLE, SUMMARY, FIRST_DATASETS),
    ]
    assert read_json(stories_dir(published_dir) / "index.json")["stories"][0]["summary"] == SUMMARY

    detail = admin_client.get(f"{STORIES_PATH}/{FIRST}", headers=admin_headers).json()
    assert [version["version_no"] for version in detail["versions"]] == [3, 2, 1]
    assert detail["latest_done"]["version_no"] == 3


def test_failed_latest_allows_restore_to_latest_done(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    publish_failed(admin_client, admin_headers, summary="실패한 요약")

    restored = admin_client.post(f"{STORIES_PATH}/{FIRST}/versions/1/restore", headers=admin_headers)

    assert restored.status_code == 201, restored.text
    assert (restored.json()["version_no"], restored.json()["status"]) == (3, "done")
    assert story_versions(db_session, FIRST)[2].summary == SUMMARY
    assert read_json(stories_dir(published_dir) / "index.json")["stories"][0]["summary"] == SUMMARY


def test_restore_rules_with_failed_versions(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    assert publish(admin_client, admin_headers, summary="두 번째 요약").status_code == 201
    publish_failed(admin_client, admin_headers, summary="실패한 요약")

    failed_target = admin_client.post(f"{STORIES_PATH}/{FIRST}/versions/3/restore", headers=admin_headers)
    older_done = admin_client.post(f"{STORIES_PATH}/{FIRST}/versions/1/restore", headers=admin_headers)

    assert failed_target.status_code == 409
    assert failed_target.json()["detail"]["code"] == "version_not_restorable"
    assert older_done.status_code == 201, older_done.text
    assert (older_done.json()["version_no"], older_done.json()["status"]) == (4, "done")
    assert story_versions(db_session, FIRST)[3].summary == SUMMARY


def test_list_shows_newer_dataset_version(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    publish_dataset_version(admin_client, admin_headers, "elements_ko", "Cu")

    listed = admin_client.get(STORIES_PATH, headers=admin_headers)

    assert listed.status_code == 200
    first = next(item for item in listed.json() if item["story"] == FIRST)
    assert [(item["name"], item["current_version"], item["newer_than_current"]) for item in first["datasets"]] == [
        ("elements_ko", 1, True),
        ("element_discoveries", 1, False),
    ]
    assert [version["version_no"] for version in first["datasets"][0]["done_versions"]] == [2, 1]
    second = next(item for item in listed.json() if item["story"] == SECOND)
    assert (second["latest_version_no"], second["latest_done"]) == (None, None)


# --- 공개 파일 다시 쓰기 ---


def rewrite(client: TestClient, headers: dict[str, str]) -> httpx.Response:
    return client.post(f"{STORIES_PATH}/{FIRST}/rewrite", headers=headers)


def set_stored_published_at(session: Session, version_no: int) -> None:
    story_id = session.scalar(select(Story.id).where(Story.slug == FIRST))
    session.execute(
        update(StoryVersion)
        .where(StoryVersion.story_id == story_id, StoryVersion.version_no == version_no)
        .values(published_at=STORED_PUBLISHED_AT)
    )
    session.commit()


def test_rewrite_writes_latest_done_with_stored_time_and_keeps_state(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    first = publish(admin_client, admin_headers).json()
    set_stored_published_at(db_session, 1)
    kept_first_published_at = first_published_at(db_session, FIRST)
    (stories_dir(published_dir) / f"{FIRST}.json").unlink()
    (stories_dir(published_dir) / "index.json").write_text("{}", encoding="utf-8")

    response = rewrite(admin_client, admin_headers)

    assert response.status_code == 200, response.text
    assert response.json() == {
        "story": FIRST,
        "version_no": 1,
        "published_at": "2020-01-02T03:04:05Z",
        "write_error": None,
    }
    story_document = read_json(stories_dir(published_dir) / f"{FIRST}.json")
    assert story_document["published_at"] == "2020-01-02T03:04:05Z"
    assert story_document["title"] == TITLE
    assert read_json(stories_dir(published_dir) / "index.json") == {
        "stories": [{"story": FIRST, "title": TITLE, "summary": SUMMARY, "published_at": first["published_at"]}]
    }
    versions = story_versions(db_session, FIRST)
    assert [(version.version_no, version.publish_status, version.published_at) for version in versions] == [
        (1, PublishStatus.DONE, STORED_PUBLISHED_AT)
    ]
    assert first_published_at(db_session, FIRST) == kept_first_published_at
    assert temp_files(published_dir) == []
    # 저장된 발행 시각으로 썼으므로 공개 파일 판정이 ok 다.
    detail = admin_client.get(f"{STORIES_PATH}/{FIRST}", headers=admin_headers).json()
    assert detail["public_file"] == "ok"


def test_rewrite_needs_done_latest(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    no_version = rewrite(admin_client, admin_headers)
    assert publish(admin_client, admin_headers).status_code == 201
    publish_failed(admin_client, admin_headers, summary="실패한 요약")
    before = (stories_dir(published_dir) / "index.json").read_bytes()

    failed_latest = rewrite(admin_client, admin_headers)

    for response in (no_version, failed_latest):
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "version_not_rewritable"
    assert (stories_dir(published_dir) / "index.json").read_bytes() == before


def test_rewrite_rejects_missing_dataset_file(
    admin_client: TestClient, admin_headers: dict[str, str], published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    (published_dir / "datasets" / "elements_ko" / "v1.json").unlink()
    (stories_dir(published_dir) / f"{FIRST}.json").unlink()

    response = rewrite(admin_client, admin_headers)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "dataset_file_missing"
    assert not (stories_dir(published_dir) / f"{FIRST}.json").exists()


def test_rewrite_write_failure_keeps_done_and_returns_code(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    (stories_dir(published_dir) / f"{FIRST}.json").unlink()

    with pytest.MonkeyPatch.context() as patch:
        fail_story_file(patch)
        response = rewrite(admin_client, admin_headers)

    assert response.status_code == 200, response.text
    assert (response.json()["version_no"], response.json()["write_error"]) == (1, "story_file_write_failed")
    versions = story_versions(db_session, FIRST)
    assert [(version.publish_status, version.publish_error) for version in versions] == [(PublishStatus.DONE, None)]
    detail = admin_client.get(f"{STORIES_PATH}/{FIRST}", headers=admin_headers).json()
    assert detail["public_file"] == "missing"


# --- 공개 파일 상태 ---


def remove_story_file(path: Path) -> None:
    path.unlink()


def change_story_title(path: Path) -> None:
    document = read_json(path)
    document["title"] = "손으로 바꾼 제목"
    path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")


def change_story_published_at(path: Path) -> None:
    document = read_json(path)
    document["published_at"] = "2001-01-01T00:00:00Z"
    path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")


def change_story_version(path: Path) -> None:
    document = read_json(path)
    document["datasets"]["elements_ko"] = {"version": 2, "path": "/data/datasets/elements_ko/v2.json"}
    path.write_text(json.dumps(document), encoding="utf-8")


def break_story_json(path: Path) -> None:
    path.write_text("{", encoding="utf-8")


def link_story_file(path: Path) -> None:
    # 같은 내용의 파일을 가리키는 링크여도 따라가지 않는다.
    target = path.with_name("elsewhere.txt")
    target.write_bytes(path.read_bytes())
    path.unlink()
    path.symlink_to(target)


def fifo_story_file(path: Path) -> None:
    # FIFO 는 열 때 기다리지 않고(O_NONBLOCK) 일반 파일 아님으로 본다.
    path.unlink()
    os.mkfifo(path)


def oversize_story_file(path: Path) -> None:
    path.write_bytes(b" " * (STORY_FILE_MAX_BYTES + 1))


@pytest.mark.parametrize(
    ("break_file", "expected"),
    [
        (None, "ok"),
        (remove_story_file, "missing"),
        (change_story_title, "mismatch"),
        (change_story_published_at, "mismatch"),
        (change_story_version, "mismatch"),
        (break_story_json, "mismatch"),
        (link_story_file, "unreadable"),
        (fifo_story_file, "unreadable"),
        (oversize_story_file, "unreadable"),
    ],
    ids=["ok", "missing", "title", "published_at", "version", "invalid_json", "link", "fifo", "oversize"],
)
def test_public_file_status_in_list_and_detail(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    published_dir: Path,
    break_file: Callable[[Path], None] | None,
    expected: str,
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201
    if break_file is not None:
        break_file(stories_dir(published_dir) / f"{FIRST}.json")

    listed = admin_client.get(STORIES_PATH, headers=admin_headers).json()
    detail = admin_client.get(f"{STORIES_PATH}/{FIRST}", headers=admin_headers).json()

    assert next(item for item in listed if item["story"] == FIRST)["public_file"] == expected
    assert next(item for item in listed if item["story"] == SECOND)["public_file"] is None
    assert detail["public_file"] == expected


# --- 판 내용 API ---


def mark_dataset_version(session: Session, slug: str, version_no: int, publish_status: PublishStatus) -> None:
    dataset_id = session.scalar(select(Dataset.id).where(Dataset.slug == slug))
    session.execute(
        update(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset_id, DatasetVersion.version_no == version_no)
        .values(publish_status=publish_status)
    )
    session.commit()


def test_version_content_returns_published_bytes_for_done_only(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, published_dir: Path
) -> None:
    publish_dataset_version(admin_client, admin_headers, "elements_ko", "Fe")

    done = admin_client.get(f"{DATASETS_PATH}/elements_ko/versions/1/content", headers=admin_headers)
    missing = admin_client.get(f"{DATASETS_PATH}/elements_ko/versions/2/content", headers=admin_headers)
    no_dataset = admin_client.get(f"{DATASETS_PATH}/nothing/versions/1/content", headers=admin_headers)
    mark_dataset_version(db_session, "elements_ko", 1, PublishStatus.FAILED)
    not_done = admin_client.get(f"{DATASETS_PATH}/elements_ko/versions/1/content", headers=admin_headers)

    assert done.status_code == 200
    assert done.headers["cache-control"] == "no-store"
    assert done.headers["content-type"].startswith("application/json")
    assert done.content == (published_dir / "datasets" / "elements_ko" / "v1.json").read_bytes()
    assert (missing.status_code, missing.json()["detail"]["code"]) == (404, "version_not_found")
    assert (no_dataset.status_code, no_dataset.json()["detail"]["code"]) == (404, "dataset_not_found")
    assert (not_done.status_code, not_done.json()["detail"]["code"]) == (409, "version_not_done")
    assert not_done.headers["cache-control"] == "no-store"


# --- 잠금 ---


def prepare_retry(client: TestClient, headers: dict[str, str]) -> None:
    with pytest.MonkeyPatch.context() as patch:
        fail_story_file(patch)
        assert publish(client, headers).json()["status"] == "failed"


def prepare_restore(client: TestClient, headers: dict[str, str]) -> None:
    assert publish(client, headers).status_code == 201
    assert publish(client, headers, summary="바뀐 요약").status_code == 201


def prepare_rewrite(client: TestClient, headers: dict[str, str]) -> None:
    assert publish(client, headers).status_code == 201


@pytest.mark.parametrize(
    ("arrange", "act"),
    [
        (None, lambda client, headers: publish(client, headers)),
        (prepare_retry, lambda client, headers: client.post(f"{STORIES_PATH}/{FIRST}/versions/1/retry", headers=headers)),
        (
            prepare_restore,
            lambda client, headers: client.post(f"{STORIES_PATH}/{FIRST}/versions/1/restore", headers=headers),
        ),
        (prepare_rewrite, lambda client, headers: rewrite(client, headers)),
    ],
    ids=["publish", "retry", "restore", "rewrite"],
)
def test_publish_paths_take_global_lock_as_first_statement(
    admin_client: TestClient,
    admin_headers: dict[str, str],
    db_session: Session,
    arrange: Callable[[TestClient, dict[str, str]], None] | None,
    act: Callable[[TestClient, dict[str, str]], httpx.Response],
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    if arrange is not None:
        arrange(admin_client, admin_headers)
    statements: list[str] = []
    db_session.commit()
    connection = db_session.connection()

    def record(conn: object, cursor: object, statement: str, *args: object) -> None:
        # 테스트 격리용 savepoint 문장은 서비스 문장이 아니다.
        if "SAVEPOINT" not in statement.upper():
            statements.append(statement)

    # 요청 처리 전체(의존성 · 라우터 · 서비스)에서 잠금이 요청의 첫 SQL 인지 HTTP 경유로 본다. 잠금 전 rollback 이
    # 앞선 읽기 스냅샷을 끝내는지는 이 하네스(공유 연결 · savepoint)로는 볼 수 없다.
    event.listen(connection, "before_cursor_execute", record)
    try:
        response = act(admin_client, admin_headers)
    finally:
        event.remove(connection, "before_cursor_execute", record)

    assert response.status_code in (200, 201), response.text
    assert "story_publish_lock" in statements[0]
    assert "FOR UPDATE" in statements[0].upper()


def test_story_version_status_rejects_abandoned_in_db(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    prepare(admin_client, admin_headers, FIRST_DATASETS)
    assert publish(admin_client, admin_headers).status_code == 201

    with pytest.raises((IntegrityError, OperationalError)):
        db_session.execute(update(StoryVersion).values(publish_status=PublishStatus.ABANDONED))
        db_session.flush()
    db_session.rollback()
