"""이야기 등록 · 발행 · 재시도 · 되돌리기 · 공개 파일 다시 쓰기와 데이터 판 내용 조회(D-37).

발행 · 재시도 · 되돌리기 · 다시 쓰기는 한 트랜잭션 안에서 story_publish_lock 행을 첫 DB 문장으로 잠그고, 판 기록 → 이야기 파일 교체
→ 목록 교체 → 결과 상태 기록(커밋)까지 잠금을 쥔다. 목록(index.json)은 DB 의 공개된 이야기 전체로 만들기 때문에, 데이터
발행처럼 중간 커밋으로 잠금을 놓으면 두 요청의 교체 순서가 뒤바뀌어 옛 목록이 마지막에 남을 수 있다.
pending 판은 결과 상태와 함께 커밋되므로 중단되면 판 행이 남지 않는다(파일만 바뀌었을 수 있고, 다음 발행이 다시 쓴다).
"""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.admin_datasets import service as dataset_service
from app.admin_imports.publish import _file_present, _version_schema, build_version_content
from app.admin_stories.errors import StoryErrorCode, StoryServiceError
from app.admin_stories.registry import STORY_REGISTRY
from app.data_core.enums import PublishStatus
from app.data_core.models import (
    STORY_PUBLISH_LOCK_ID,
    Dataset,
    DatasetVersion,
    Story,
    StoryPublishLock,
    StoryVersion,
)
from app.publishing.dataset_file import ContentInvalid, UnsafePublishPath
from app.publishing.story_file import (
    PublicFileStatus,
    StoryIndexItem,
    build_story_file,
    build_story_index,
    ensure_stories_dir,
    public_story_file_status,
    replace_file,
    story_file_paths,
)

logger = logging.getLogger(__name__)

# 실패 판에 남기는 오류 코드(경로 · 예외 문장은 저장하지 않음). 프론트 lib/admin/stories.ts STORY_PUBLISH_ERRORS 와 같다.
PUBLISH_DIR_MISSING_ERROR = "publish_dir_missing"
UNSAFE_PATH_ERROR = "unsafe_path"
STORY_FILE_WRITE_FAILED_ERROR = "story_file_write_failed"
INDEX_WRITE_FAILED_ERROR = "index_write_failed"


@dataclass(frozen=True)
class StoryContent:
    title: str
    summary: str
    # 묶음 주소 이름 → 데이터 판 번호(registry 순서)
    datasets: dict[str, int]


@dataclass(frozen=True)
class StoryVersionView:
    version_no: int
    status: PublishStatus
    title: str
    summary: str
    datasets: dict[str, int]
    published_at: datetime | None
    publish_error: str | None
    created_at: datetime


@dataclass(frozen=True)
class DoneDatasetVersion:
    version_no: int
    # 조회 시점에 공개 파일이 일반 파일로 있는가(DB 에 저장하지 않음)
    file_present: bool


@dataclass(frozen=True)
class StoryDatasetChoice:
    name: str
    # 공개된(done) 판, 큰 번호부터
    done_versions: list[DoneDatasetVersion]
    # 이야기의 최신 공개 판이 쓰는 판 번호(공개 판이 없으면 None)
    current_version: int | None
    # 이 묶음의 최신 공개 판이 current_version 보다 새로움(공개 판이 없으면 False)
    newer_than_current: bool


@dataclass(frozen=True)
class StoryOverview:
    story: str
    latest: StoryVersionView | None
    latest_done: StoryVersionView | None
    datasets: list[StoryDatasetChoice]
    # 최신 공개 판과 공개 이야기 파일의 일치 여부(공개 판이 없으면 None). 조회 시점 값이며 DB 에 저장하지 않는다.
    public_file: PublicFileStatus | None


@dataclass(frozen=True)
class StoryDetail:
    overview: StoryOverview
    # 큰 번호부터
    versions: list[StoryVersionView]


@dataclass(frozen=True)
class StoryPublishResult:
    story: str
    version_no: int
    status: PublishStatus
    published_at: datetime | None
    publish_error: str | None


@dataclass(frozen=True)
class StoryRewriteResult:
    story: str
    version_no: int
    # 다시 쓴 이야기 파일의 published_at(= 저장된 판 발행 시각)
    published_at: datetime
    # 쓰기 실패 코드(성공이면 None). 판에 저장하지 않는다.
    write_error: str | None


# --- 조회 ---


def list_stories(session: Session, published_dir: Path) -> list[StoryOverview]:
    """registry 의 이야기마다 최신 판 · 최신 공개 판 · 묶음별 고를 수 있는 판."""
    versions = _story_versions(session, None)
    done = _done_dataset_versions(session, _all_dataset_names())
    session.commit()
    return [
        _overview(story, names, versions.get(story, []), done, published_dir) for story, names in STORY_REGISTRY.items()
    ]


def get_story(session: Session, story: str, published_dir: Path) -> StoryDetail:
    names = _registered_names(story)
    history = _story_versions(session, story).get(story, [])
    done = _done_dataset_versions(session, names)
    session.commit()
    return StoryDetail(overview=_overview(story, names, history, done, published_dir), versions=history)


def read_dataset_version_content(session: Session, slug: str, version_no: int) -> bytes:
    """공개된(done) 데이터 판의 발행 파일과 같은 내용. 문구 대조 · 미리보기가 쓴다(개발 · 운영 같은 경로)."""
    dataset = dataset_service._find_dataset(session, slug)
    if dataset is None:
        raise StoryServiceError(StoryErrorCode.DATASET_NOT_FOUND)
    version = session.scalars(
        select(DatasetVersion).where(DatasetVersion.dataset_id == dataset.id, DatasetVersion.version_no == version_no)
    ).one_or_none()
    if version is None:
        raise StoryServiceError(StoryErrorCode.VERSION_NOT_FOUND)
    if version.publish_status is not PublishStatus.DONE:
        raise StoryServiceError(StoryErrorCode.VERSION_NOT_DONE)
    try:
        content = build_version_content(session, dataset, _version_schema(session, version), version)
    except ContentInvalid as error:
        logger.warning("dataset version content invalid: dataset=%s version=%s reason=%s", slug, version_no, error)
        raise StoryServiceError(StoryErrorCode.CONTENT_INVALID) from error
    session.commit()
    return content


# --- 발행 · 재시도 · 되돌리기 ---


def publish_story(
    session: Session, story: str, title: str, summary: str, datasets: dict[str, int], published_dir: Path
) -> StoryPublishResult:
    """새 판을 만들고 이야기 파일 · 목록을 교체한다. title · summary 는 요청 검증에서 앞뒤 공백을 지운 값이다."""
    names = _registered_names(story)
    _lock_publishing(session)
    with _release_on_error(session):
        content = _checked_content(session, names, title, summary, datasets, published_dir)
        return _publish_content(session, story, content, published_dir)


def retry_story(session: Session, story: str, version_no: int, published_dir: Path) -> StoryPublishResult:
    """가장 최근 판이 실패(failed)일 때 같은 내용으로 이야기 파일 · 목록을 다시 쓴다(둘 다, 멱등)."""
    names = _registered_names(story)
    _lock_publishing(session)
    with _release_on_error(session):
        story_row, version = _require_version(session, story, version_no)
        latest = _latest_version(session, story_row.id)
        if version.publish_status is not PublishStatus.FAILED or latest is None or latest.id != version.id:
            raise StoryServiceError(StoryErrorCode.VERSION_NOT_RETRYABLE)
        _checked_content(session, names, version.title, version.summary, version.datasets, published_dir)
        return _write_and_record(session, story_row, version, published_dir)


def restore_story(session: Session, story: str, version_no: int, published_dir: Path) -> StoryPublishResult:
    """공개됐던(done) 판의 내용으로 새 판을 발행한다(발행과 같은 검사 · 경로).

    지금 공개된(최신 done) 판은 되돌릴 대상이 아니다. 다만 최신 판이 실패(failed)면 공개 파일이 그 실패 판 내용일 수 있어
    최신 done 판으로도 되돌릴 수 있다.
    """
    names = _registered_names(story)
    _lock_publishing(session)
    with _release_on_error(session):
        story_row, version = _require_version(session, story, version_no)
        latest = _latest_version(session, story_row.id)
        latest_done = _latest_done_version(session, story_row.id)
        latest_failed = latest is not None and latest.publish_status is PublishStatus.FAILED
        is_current = latest_done is not None and latest_done.id == version.id
        if version.publish_status is not PublishStatus.DONE or (is_current and not latest_failed):
            raise StoryServiceError(StoryErrorCode.VERSION_NOT_RESTORABLE)
        content = _checked_content(session, names, version.title, version.summary, version.datasets, published_dir)
        return _publish_content(session, story, content, published_dir)


def rewrite_story(session: Session, story: str, published_dir: Path) -> StoryRewriteResult:
    """최신 판이 공개된(done) 판일 때 그 내용으로 이야기 파일 · 목록을 다시 쓴다(공개 파일 ↔ DB 어긋남 복구).

    판 상태 · 발행 시각 · 처음 공개된 시각은 바꾸지 않는다. 이야기 파일 published_at 은 저장된 판 발행 시각이다.
    쓰기에 실패해도 판은 done 그대로 두고 오류 코드만 돌려준다(DB 변경 없음).
    """
    names = _registered_names(story)
    _lock_publishing(session)
    with _release_on_error(session):
        story_row = _find_story(session, story)
        latest = None if story_row is None else _latest_version(session, story_row.id)
        if story_row is None or latest is None or latest.publish_status is not PublishStatus.DONE:
            raise StoryServiceError(StoryErrorCode.VERSION_NOT_REWRITABLE)
        if latest.published_at is None or story_row.first_published_at is None:
            # done 판은 발행 시각 · 처음 공개된 시각과 같은 커밋으로 기록된다(_write_and_record).
            raise RuntimeError("done story version has no published time")
        # 재시도와 같은 검사: registry 와 묶음이 어긋나거나 데이터 파일이 없으면 쓰지 않는다(깨진 조합을 다시 공개하지 않음).
        _checked_content(session, names, latest.title, latest.summary, latest.datasets, published_dir)
        story_content, index_content = _file_contents(
            session, story_row, latest, latest.published_at, story_row.first_published_at
        )
        error_code = _write_files(published_dir, story_row.slug, story_content, index_content)
        result = StoryRewriteResult(
            story=story_row.slug,
            version_no=latest.version_no,
            published_at=latest.published_at,
            write_error=error_code,
        )
    if error_code is not None:
        logger.warning("story rewrite failed: story=%s version=%s error=%s", result.story, result.version_no, error_code)
    # 바꾼 행이 없으므로 롤백으로 잠금만 놓는다.
    session.rollback()
    return result


@contextmanager
def _release_on_error(session: Session) -> Iterator[None]:
    """잠금을 잡은 뒤 오류로 끝나면(도메인 오류 · 예상 밖 예외 모두) 바로 롤백해 잠금을 놓는다(요청 세션 정리를 기다리지 않음)."""
    try:
        yield
    except Exception:
        session.rollback()
        raise


def _lock_publishing(session: Session) -> None:
    """전역 잠금 행을 잡는다. 트랜잭션의 첫 조회여야 앞선 발행이 커밋한 상태를 본다(InnoDB 일관된 읽기 시점)."""
    # 앞선 읽기가 연 트랜잭션이 있으면 REPEATABLE READ 스냅샷이 잠금 전 시점에 고정되므로 먼저 끝낸다.
    # 잠금 전 세션의 미커밋 변경도 버린다 — 선행 쓰기를 붙이지 말 것.
    session.rollback()
    locked = session.scalar(
        select(StoryPublishLock.id).where(StoryPublishLock.id == STORY_PUBLISH_LOCK_ID).with_for_update()
    )
    if locked is None:
        # 마이그레이션이 넣는 행이다. 없으면 잠금 없이 발행하게 되므로 진행하지 않는다.
        raise RuntimeError("story publish lock row is missing")


def _checked_content(
    session: Session,
    names: tuple[str, ...],
    title: str,
    summary: str,
    datasets: dict[str, int],
    published_dir: Path,
) -> StoryContent:
    """묶음 이름 집합 = registry · 각 판이 그 묶음의 공개 판 · 그 판의 데이터 파일이 발행 폴더에 있음."""
    if set(datasets) != set(names):
        problems = sorted(set(datasets) ^ set(names))
        raise StoryServiceError(StoryErrorCode.DATASETS_MISMATCH, problems=problems)
    done = _done_dataset_versions(session, names)
    not_done = [f"{name} v{datasets[name]}" for name in names if datasets[name] not in done.get(name, [])]
    if not_done:
        raise StoryServiceError(StoryErrorCode.DATASET_VERSION_NOT_DONE, problems=not_done)
    missing = [
        f"{name} v{datasets[name]}" for name in names if not _file_present(published_dir, name, datasets[name])
    ]
    if missing:
        raise StoryServiceError(StoryErrorCode.DATASET_FILE_MISSING, problems=missing)
    return StoryContent(title=title, summary=summary, datasets={name: datasets[name] for name in names})


def _publish_content(session: Session, story: str, content: StoryContent, published_dir: Path) -> StoryPublishResult:
    story_row = _find_story(session, story)
    if story_row is None:
        story_row = Story(slug=story)
        session.add(story_row)
        session.flush()
    latest = _latest_version(session, story_row.id)
    if latest is not None and latest.publish_status is PublishStatus.PENDING:
        raise StoryServiceError(StoryErrorCode.PUBLISH_INCOMPLETE)
    # 최신 판이 실패(failed)면 공개 파일이 그 판 내용일 수 있어, 최신 공개 판과 같은 내용도 새 판으로 받아들인다.
    if latest is not None and latest.publish_status is PublishStatus.DONE and _same_content(latest, content):
        raise StoryServiceError(StoryErrorCode.PUBLISH_UNCHANGED)
    version = StoryVersion(
        story_id=story_row.id,
        version_no=1 if latest is None else latest.version_no + 1,
        title=content.title,
        summary=content.summary,
        datasets=content.datasets,
        publish_status=PublishStatus.PENDING,
    )
    session.add(version)
    try:
        session.flush()
    except IntegrityError as error:
        # 전역 잠금으로 줄 서므로 생기지 않지만, 잠금을 거치지 않은 쓰기가 있으면 유니크 제약이 하나만 받아들인다.
        session.rollback()
        raise StoryServiceError(StoryErrorCode.CONCURRENT_CHANGE) from error
    return _write_and_record(session, story_row, version, published_dir)


def _write_and_record(
    session: Session, story_row: Story, version: StoryVersion, published_dir: Path
) -> StoryPublishResult:
    """이야기 파일 → 목록 순으로 교체하고 결과 상태를 같은 트랜잭션에서 커밋한다(잠금은 커밋 때 놓인다)."""
    now = _utc_now(session)
    first_published_at = now if story_row.first_published_at is None else story_row.first_published_at
    story_content, index_content = _file_contents(session, story_row, version, now, first_published_at)
    error_code = _write_files(published_dir, story_row.slug, story_content, index_content)
    if error_code is None:
        version.publish_status = PublishStatus.DONE
        version.published_at = now
        version.publish_error = None
        story_row.first_published_at = first_published_at
    else:
        logger.warning("story publish failed: story=%s version=%s error=%s", story_row.slug, version.version_no, error_code)
        version.publish_status = PublishStatus.FAILED
        version.published_at = None
        version.publish_error = error_code
    # 커밋 뒤 만료된 객체를 다시 읽지 않게 결과를 먼저 담는다.
    result = StoryPublishResult(
        story=story_row.slug,
        version_no=version.version_no,
        status=version.publish_status,
        published_at=version.published_at,
        publish_error=version.publish_error,
    )
    session.commit()
    return result


def _file_contents(
    session: Session,
    story_row: Story,
    version: StoryVersion,
    published_at: datetime,
    first_published_at: datetime,
) -> tuple[bytes, bytes]:
    """(이야기 파일, 목록) 바이트. 목록은 다른 이야기의 최신 공개 판 + 이 판으로 만든다."""
    datasets = {name: version.datasets[name] for name in STORY_REGISTRY[story_row.slug]}
    story_content = build_story_file(story_row.slug, version.title, published_at, datasets)
    current_item = StoryIndexItem(
        story=story_row.slug, title=version.title, summary=version.summary, first_published_at=first_published_at
    )
    index_content = build_story_index([*_other_index_items(session, story_row.id), current_item])
    return story_content, index_content


def _write_files(published_dir: Path, story: str, story_content: bytes, index_content: bytes) -> str | None:
    """성공하면 None, 실패하면 오류 코드. 로그에는 경로를 남기지 않는다(파일 이름 · 오류 번호만)."""
    if not published_dir.is_dir():
        logger.warning("story publish dir missing")
        return PUBLISH_DIR_MISSING_ERROR
    try:
        ensure_stories_dir(published_dir)
    except OSError as error:
        logger.warning("story dir create failed: errno=%s", error.errno)
        return STORY_FILE_WRITE_FAILED_ERROR
    try:
        story_path, index_path = story_file_paths(published_dir, story)
    except UnsafePublishPath as error:
        logger.warning("story file path unsafe: story=%s reason=%s", story, error)
        return UNSAFE_PATH_ERROR
    try:
        replace_file(story_path, story_content)
    except OSError as error:
        logger.warning("story file write failed: file=%s errno=%s", story_path.name, error.errno)
        return STORY_FILE_WRITE_FAILED_ERROR
    try:
        replace_file(index_path, index_content)
    except OSError as error:
        logger.warning("story index write failed: file=%s errno=%s", index_path.name, error.errno)
        return INDEX_WRITE_FAILED_ERROR
    return None


# --- 내부 조회 ---


def _registered_names(story: str) -> tuple[str, ...]:
    names = STORY_REGISTRY.get(story)
    if names is None:
        raise StoryServiceError(StoryErrorCode.STORY_NOT_FOUND)
    return names


def _all_dataset_names() -> tuple[str, ...]:
    return tuple(name for names in STORY_REGISTRY.values() for name in names)


def _find_story(session: Session, story: str) -> Story | None:
    row = session.scalars(select(Story).where(Story.slug == story)).one_or_none()
    # slug 컬럼 collation(utf8mb4_unicode_ci)은 대소문자 · 끝 공백을 무시하므로 정확히 같을 때만 같은 이야기로 본다.
    if row is None or row.slug != story:
        return None
    return row


def _require_version(session: Session, story: str, version_no: int) -> tuple[Story, StoryVersion]:
    story_row = _find_story(session, story)
    version = (
        None
        if story_row is None
        else session.scalars(
            select(StoryVersion).where(StoryVersion.story_id == story_row.id, StoryVersion.version_no == version_no)
        ).one_or_none()
    )
    if story_row is None or version is None:
        raise StoryServiceError(StoryErrorCode.STORY_VERSION_NOT_FOUND)
    return story_row, version


def _latest_version(session: Session, story_id: int) -> StoryVersion | None:
    return session.scalars(
        select(StoryVersion).where(StoryVersion.story_id == story_id).order_by(StoryVersion.version_no.desc()).limit(1)
    ).one_or_none()


def _latest_done_version(session: Session, story_id: int) -> StoryVersion | None:
    return session.scalars(
        select(StoryVersion)
        .where(StoryVersion.story_id == story_id, StoryVersion.publish_status == PublishStatus.DONE)
        .order_by(StoryVersion.version_no.desc())
        .limit(1)
    ).one_or_none()


def _same_content(version: StoryVersion, content: StoryContent) -> bool:
    # datasets 는 순서와 무관하게 이름 → 판 번호로 비교한다. title · summary 는 앞뒤 공백을 지운 값으로 저장된다.
    return (
        version.title == content.title
        and version.summary == content.summary
        and dict(version.datasets) == content.datasets
    )


def _utc_now(session: Session) -> datetime:
    # 다른 시각 칸(UTC_TIMESTAMP 기본값)과 같은 DB 시계로 정한다. 초 단위(공개 계약 형식과 같음).
    now = session.scalar(select(func.utc_timestamp()))
    if not isinstance(now, datetime):
        raise RuntimeError("database did not return a timestamp")
    return now


def _other_index_items(session: Session, story_id: int) -> list[StoryIndexItem]:
    """이번 이야기를 뺀, 공개 판이 있는 이야기마다 최신 공개 판의 제목 · 요약과 처음 공개된 시각(한 번의 조회)."""
    latest_done = (
        select(StoryVersion.story_id, func.max(StoryVersion.version_no).label("version_no"))
        .where(StoryVersion.publish_status == PublishStatus.DONE)
        .group_by(StoryVersion.story_id)
        .subquery()
    )
    rows = session.execute(
        select(Story.slug, Story.first_published_at, StoryVersion.title, StoryVersion.summary)
        .join(latest_done, latest_done.c.story_id == Story.id)
        .join(
            StoryVersion,
            (StoryVersion.story_id == Story.id) & (StoryVersion.version_no == latest_done.c.version_no),
        )
        .where(Story.id != story_id)
    ).all()
    items: list[StoryIndexItem] = []
    for slug, first_published_at, title, summary in rows:
        if first_published_at is None:
            # 공개 판이 있으면 처음 공개된 시각이 있다(_write_and_record). 없으면 목록 순서를 정할 수 없어 뺀다.
            logger.warning("story without first published time skipped from index: story=%s", slug)
            continue
        items.append(StoryIndexItem(story=slug, title=title, summary=summary, first_published_at=first_published_at))
    return items


def _story_versions(session: Session, story: str | None) -> dict[str, list[StoryVersionView]]:
    """이야기 이름 → 판 목록(큰 번호부터). story 가 있으면 그 이야기만."""
    statement = (
        select(Story.slug, StoryVersion)
        .join(StoryVersion, StoryVersion.story_id == Story.id)
        .order_by(Story.slug, StoryVersion.version_no.desc())
    )
    if story is not None:
        statement = statement.where(Story.slug == story)
    result: dict[str, list[StoryVersionView]] = {}
    for slug, version in session.execute(statement):
        if slug not in STORY_REGISTRY or (story is not None and slug != story):
            continue
        result.setdefault(slug, []).append(_version_view(version))
    return result


def _version_view(version: StoryVersion) -> StoryVersionView:
    return StoryVersionView(
        version_no=version.version_no,
        status=version.publish_status,
        title=version.title,
        summary=version.summary,
        datasets=dict(version.datasets),
        published_at=version.published_at,
        publish_error=version.publish_error,
        created_at=version.created_at,
    )


def _done_dataset_versions(session: Session, names: tuple[str, ...]) -> dict[str, list[int]]:
    """묶음 이름 → 공개된(done) 판 번호(큰 번호부터). 한 번의 조회."""
    result: dict[str, list[int]] = {}
    for slug, version_no in session.execute(
        select(Dataset.slug, DatasetVersion.version_no)
        .join(DatasetVersion, DatasetVersion.dataset_id == Dataset.id)
        .where(Dataset.slug.in_(names), DatasetVersion.publish_status == PublishStatus.DONE)
        .order_by(Dataset.slug, DatasetVersion.version_no.desc())
    ):
        # collation 이 대소문자를 무시하므로 정확히 같은 이름만 받는다.
        if slug in names:
            result.setdefault(slug, []).append(version_no)
    return result


def _overview(
    story: str,
    names: tuple[str, ...],
    versions: list[StoryVersionView],
    done: dict[str, list[int]],
    published_dir: Path,
) -> StoryOverview:
    latest = versions[0] if versions else None
    latest_done = next((version for version in versions if version.status is PublishStatus.DONE), None)
    choices: list[StoryDatasetChoice] = []
    for name in names:
        done_versions = done.get(name, [])
        current = None if latest_done is None else latest_done.datasets.get(name)
        choices.append(
            StoryDatasetChoice(
                name=name,
                done_versions=[
                    DoneDatasetVersion(version_no=number, file_present=_file_present(published_dir, name, number))
                    for number in done_versions
                ],
                current_version=current,
                newer_than_current=current is not None and bool(done_versions) and done_versions[0] > current,
            )
        )
    public_file = None if latest_done is None else _public_file_status(published_dir, story, latest_done)
    return StoryOverview(
        story=story, latest=latest, latest_done=latest_done, datasets=choices, public_file=public_file
    )


def _public_file_status(published_dir: Path, story: str, latest_done: StoryVersionView) -> PublicFileStatus:
    if latest_done.published_at is None:
        # done 판은 발행 시각과 같은 커밋으로 기록된다(_write_and_record). 없으면 맞는 파일을 정할 수 없다.
        return PublicFileStatus.MISMATCH
    return public_story_file_status(
        published_dir, story, latest_done.title, latest_done.published_at, latest_done.datasets
    )
