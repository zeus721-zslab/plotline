"""발행 유스케이스(D-29): 기록본 생성(DB 커밋, 상태 pending · 파일 해시) → 발행 파일 쓰기 → 결과 상태(done/failed) 커밋.

파일 쓰기는 DB 트랜잭션 밖에서 한다. 파일을 먼저 쓰고 커밋하면 커밋 실패 때 고아 파일이 남고, 한 트랜잭션 안에서
쓰면 쓰기 동안 묶음 잠금을 쥔다. 커밋 직후 중단되면 pending 이 남고 재시도(retry_publish)가 마무리한다.
재시도로 끝낼 수 없는 미완료는 폐기(abandon_version)로 끝낸다(D-30).
"""

import logging
import os
import stat
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.admin_imports.errors import ImportErrorCode, ImportServiceError
from app.admin_imports.service import (
    VersionSummary,
    _lock_existing_dataset,
    _plan_version,
    _require_dataset,
    list_versions,
    lock_dataset,
)
from app.data_core.enums import PublishStatus
from app.data_core.models import Dataset, DatasetRow, DatasetSchema, DatasetVersion, DatasetVersionRow
from app.publishing.dataset_file import (
    ContentInvalid,
    DatasetFileInput,
    PublishRow,
    UnsafePublishPath,
    WriteOutcome,
    build_dataset_file,
    dataset_file_path,
    file_sha256,
    public_path,
    read_regular_file,
    sync_dataset_dirs,
    write_dataset_file,
)
from app.publishing.story_refs import StoryUsage, find_story_references

logger = logging.getLogger(__name__)

# 미완료: 새 발행을 막고 재시도 · 폐기 대상. abandoned 는 끝난 상태다(D-30).
INCOMPLETE_STATUSES = (PublishStatus.PENDING, PublishStatus.FAILED)
# 쓰기 결과 → (상태, 오류 코드). 오류 코드만 저장한다(경로 · 예외 문장은 저장하지 않음).
FILE_CONFLICT_ERROR = "file_conflict"
FILE_WRITE_FAILED_ERROR = "file_write_failed"
# 재시도에서 기록본 줄로 다시 만든 내용이 공개 형식에 맞지 않음
CONTENT_INVALID_ERROR = "content_invalid"
# 재시도에서 다시 만든 바이트가 발행 때 저장한 해시와 다름(직렬화 결정성이 깨짐)
CONTENT_CHANGED_ERROR = "content_changed"
OUTCOME_STATUS: dict[WriteOutcome, tuple[PublishStatus, str | None]] = {
    WriteOutcome.WRITTEN: (PublishStatus.DONE, None),
    WriteOutcome.SAME: (PublishStatus.DONE, None),
    WriteOutcome.CONFLICT: (PublishStatus.FAILED, FILE_CONFLICT_ERROR),
    WriteOutcome.FAILED: (PublishStatus.FAILED, FILE_WRITE_FAILED_ERROR),
}
# 이야기가 가리키는 판 번호가 이 묶음에 없을 때의 version_status
MISSING_VERSION_STATUS = "missing"
type ReferencedVersionStatus = PublishStatus | Literal["missing"]


@dataclass(frozen=True)
class StoryUse:
    """이 묶음을 쓰는 이야기 1개와, 그 이야기가 가리키는 판의 발행 상태(조회 시점)."""

    story: str
    title: str
    version: int
    version_status: ReferencedVersionStatus


@dataclass(frozen=True)
class DatasetUsage:
    used_by: list[StoryUse]
    # 읽지 못한(일반 파일 아님 · 크기 초과 · 해석 실패 · 형식 불일치) 이야기 파일 수
    skipped_story_files: int
    # path 의 판 번호가 version 과 어긋나 건너뛴 이 묶음 항목 수
    skipped_references: int


@dataclass(frozen=True)
class ListedVersion:
    summary: VersionSummary
    # 조회 시점에 공개 파일이 일반 파일로 있는가(DB 에 저장하지 않음)
    file_present: bool


@dataclass(frozen=True)
class PublishResult:
    version_no: int
    status: PublishStatus
    # 공개 경로(/data/datasets/{slug}/v{n}.json)
    path: str
    row_count: int
    published_at: datetime | None
    publish_error: str | None
    # 조회 시점에 공개 파일이 일반 파일로 있는가(DB 에 저장하지 않음)
    file_present: bool
    usage: DatasetUsage


def publish_dataset(session: Session, slug: str, published_dir: Path) -> PublishResult:
    """다음 기록본을 만들고 발행 파일을 쓴다. 미완료 기록본이 있거나 · 후보가 없거나 · 변화가 없으면 막는다."""
    _lock_existing_dataset(session, slug)
    dataset = _require_dataset(session, slug)
    # 커밋 뒤 dataset 속성을 읽으면 만료된 객체를 다시 읽는 조회가 새 트랜잭션의 첫 조회(잠금보다 앞)가 된다.
    dataset_slug = dataset.slug
    if _has_incomplete_version(session, dataset.id):
        raise ImportServiceError(ImportErrorCode.PUBLISH_INCOMPLETE)
    plan = _plan_version(session, dataset.id)
    schema = plan.schema
    if schema is None or not plan.candidates:
        raise ImportServiceError(ImportErrorCode.PUBLISH_EMPTY)
    if plan.unchanged:
        raise ImportServiceError(ImportErrorCode.PUBLISH_UNCHANGED)
    # DB 에 쓰기 전에 경로를 확인한다(경로가 잘못이면 pending 기록본을 남기지 않음).
    file_path = dataset_file_path(published_dir, dataset.slug, plan.next_version_no)

    version = DatasetVersion(
        dataset_id=dataset.id,
        schema_id=schema.id,
        version_no=plan.next_version_no,
        publish_status=PublishStatus.PENDING,
    )
    session.add(version)
    try:
        session.flush()
    except IntegrityError as error:
        # 동시에 같은 다음 번호를 저장하면 (dataset_id, version_no) 유니크 제약이 하나만 받아들인다.
        session.rollback()
        raise ImportServiceError(ImportErrorCode.VERSION_CONFLICT) from error
    session.add_all(
        DatasetVersionRow(version_id=version.id, row_id=row_id) for row_id in sorted(set(plan.candidates.values()))
    )
    session.flush()
    # created_at 은 DB 기본값(UTC_TIMESTAMP())이라 파일에 싣기 전에 읽어 온다.
    session.refresh(version)
    try:
        content = build_version_content(session, dataset, schema, version)
    except ContentInvalid as error:
        # 커밋 전이라 기록본 · 기록본 줄을 남기지 않는다.
        session.rollback()
        logger.warning("publish content invalid: dataset=%s reason=%s", dataset_slug, error)
        raise ImportServiceError(ImportErrorCode.PUBLISH_CONTENT_INVALID) from error
    version.file_sha256 = file_sha256(content)
    version_id = version.id
    session.commit()
    return _write_and_finish(session, dataset_slug, version_id, file_path, content, published_dir)


def retry_publish(session: Session, slug: str, version_no: int, published_dir: Path) -> PublishResult:
    """pending · failed 기록본의 파일을 다시 쓴다. done 이면 파일이 있을 때 그대로 돌려주고, 없으면 같은 바이트로만 다시 쓴다.

    기록본에 든 줄(발행했을 때의 줄)로 다시 만든다. 다시 만든 바이트가 저장한 해시와 다르면 덮어쓰지 않는다(D-30).
    """
    _lock_existing_dataset(session, slug)
    dataset = _require_dataset(session, slug)
    version = _find_version(session, dataset.id, version_no)
    # 커밋 뒤 만료된 객체를 다시 읽지 않게 미리 담아 둔다(publish_dataset 과 같은 이유).
    dataset_slug = dataset.slug
    version_id = version.id
    stored_sha256 = version.file_sha256
    if version.publish_status is PublishStatus.ABANDONED:
        raise ImportServiceError(ImportErrorCode.VERSION_ABANDONED)
    file_path = dataset_file_path(published_dir, dataset_slug, version_no)
    if version.publish_status is PublishStatus.DONE:
        return _restore_done_file(session, dataset, version, file_path, published_dir)

    # 커밋 직후 중단된 경우: 파일은 이미 다 쓰였고 그 바이트가 저장한 해시와 같다. 폴더 항목까지 디스크에 남긴 뒤 done.
    if stored_sha256 is not None and _existing_file_sha256(file_path) == stored_sha256 and _sync_dirs(
        published_dir, file_path
    ):
        _mark(session, version_id, PublishStatus.DONE, None)
        session.commit()
        return _result(session, dataset_slug, version_id, published_dir)

    try:
        content = build_version_content(session, dataset, _version_schema(session, version), version)
    except ContentInvalid:
        logger.warning("publish retry content invalid: dataset=%s version_id=%s", dataset_slug, version_id)
        return _finish_without_write(session, dataset_slug, version_id, CONTENT_INVALID_ERROR, published_dir)
    rebuilt_sha256 = file_sha256(content)
    if stored_sha256 is not None and rebuilt_sha256 != stored_sha256:
        # 저장 해시를 덮어쓰지 않는다(결정성이 깨졌다는 신호를 남김). 파일도 쓰지 않는다.
        logger.warning("publish retry content changed: dataset=%s version_id=%s", dataset_slug, version_id)
        return _finish_without_write(session, dataset_slug, version_id, CONTENT_CHANGED_ERROR, published_dir)
    if stored_sha256 is None:
        version.file_sha256 = rebuilt_sha256
    session.commit()
    return _write_and_finish(session, dataset_slug, version_id, file_path, content, published_dir)


def abandon_version(session: Session, slug: str, version_no: int, published_dir: Path) -> PublishResult:
    """미완료(pending · failed) 기록본을 폐기(abandoned)로 끝낸다. 번호는 소진되고 줄 · 기록본 줄 · 파일은 건드리지 않는다.

    이미 파일이 있어도 지우거나 옮기지 않는다(공개 URL 의 바이트는 바꾸지 않음, D-30). publish_error 는 남긴다(왜 폐기했는지).
    """
    _lock_existing_dataset(session, slug)
    dataset = _require_dataset(session, slug)
    version = _find_version(session, dataset.id, version_no)
    dataset_slug = dataset.slug
    version_id = version.id
    if version.publish_status not in INCOMPLETE_STATUSES:
        raise ImportServiceError(ImportErrorCode.VERSION_NOT_ABANDONABLE)
    version.publish_status = PublishStatus.ABANDONED
    version.published_at = None
    session.commit()
    return _result(session, dataset_slug, version_id, published_dir)


def list_versions_with_usage(
    session: Session, slug: str, published_dir: Path
) -> tuple[list[ListedVersion], DatasetUsage]:
    """기록본 이력(최근 순, 파일 존재 포함)과 이 묶음을 쓰는 이야기. 없는 묶음이면 이야기 파일을 읽기 전에 404 로 끝난다."""
    versions = list_versions(session, slug)
    listed = [
        ListedVersion(summary=version, file_present=_file_present(published_dir, slug, version.version_no))
        for version in versions
    ]
    statuses = {version.version_no: version.publish_status for version in versions}
    return listed, _with_version_status(find_story_references(published_dir, slug), statuses)


def _write_and_finish(
    session: Session, slug: str, version_id: int, file_path: Path, content: bytes, published_dir: Path
) -> PublishResult:
    """파일을 쓰고 새 트랜잭션에서 결과 상태를 커밋한다. 잠금 순서는 다른 유스케이스와 같게 묶음 → 기록본."""
    outcome = write_dataset_file(published_dir, file_path, content)
    publish_status, error_code = OUTCOME_STATUS[outcome]
    if error_code is not None:
        logger.warning("publish failed: dataset=%s version_id=%s error=%s", slug, version_id, error_code)
    lock_dataset(session, slug)
    _mark(session, version_id, publish_status, error_code)
    session.commit()
    return _result(session, slug, version_id, published_dir)


def _finish_without_write(
    session: Session, slug: str, version_id: int, error_code: str, published_dir: Path
) -> PublishResult:
    """재시도에서 파일을 쓰지 않고 failed(오류 코드)로 끝낸다. 묶음 잠금을 쥔 첫 트랜잭션 안에서 부른다."""
    _mark(session, version_id, PublishStatus.FAILED, error_code)
    session.commit()
    return _result(session, slug, version_id, published_dir)


def _restore_done_file(
    session: Session, dataset: Dataset, version: DatasetVersion, file_path: Path, published_dir: Path
) -> PublishResult:
    """done 기록본의 재시도. 파일이 일반 파일로 있으면 그대로, 없으면 저장 해시와 같은 바이트일 때만 다시 쓴다.

    상태는 어느 경우에도 done 그대로다(되돌리지 않음). 다시 만든 바이트가 다르면 409 content_changed, 쓰지 못하면
    409 publish_file_missing(D-30).
    """
    dataset_slug = dataset.slug
    version_id = version.id
    stored_sha256 = version.file_sha256
    if _is_regular_file(file_path):
        session.commit()
        # 앞선 쓰기 · 복구가 폴더 fsync 전에 멈췄을 수 있어 폴더 항목을 디스크에 남긴다. 실패해도 파일은 있으므로
        # 상태 done 그대로 200 으로 돌려준다(경고 로그는 _sync_dirs 가 남김).
        _sync_dirs(published_dir, file_path)
        return _result(session, dataset_slug, version_id, published_dir)
    try:
        content: bytes | None = build_version_content(session, dataset, _version_schema(session, version), version)
    except ContentInvalid:
        # 공개했던 바이트는 형식 검사를 통과했으므로 지금 형식에 어긋나면 내용이 달라진 것이다.
        content = None
    # 상태를 바꾸지 않으므로 파일을 쓰기 전에 잠금을 놓는다.
    session.commit()
    if content is None or stored_sha256 is None or file_sha256(content) != stored_sha256:
        logger.warning("publish restore content changed: dataset=%s version_id=%s", dataset_slug, version_id)
        raise ImportServiceError(ImportErrorCode.CONTENT_CHANGED)
    outcome = write_dataset_file(published_dir, file_path, content)
    if outcome not in (WriteOutcome.WRITTEN, WriteOutcome.SAME):
        logger.warning("publish restore failed: dataset=%s version_id=%s outcome=%s", dataset_slug, version_id, outcome)
        raise ImportServiceError(ImportErrorCode.PUBLISH_FILE_MISSING)
    return _result(session, dataset_slug, version_id, published_dir)


def _mark(session: Session, version_id: int, publish_status: PublishStatus, error_code: str | None) -> None:
    # 미완료(pending · failed)일 때만 바꾼다. done 은 되돌리지 않고(같은 기록본을 동시에 재시도해 한쪽이 먼저 done 으로
    # 끝낸 경우) · abandoned 도 되살리지 않는다(파일 쓰기 동안 폐기된 경우, D-30).
    session.execute(
        update(DatasetVersion)
        .where(DatasetVersion.id == version_id, DatasetVersion.publish_status.in_(INCOMPLETE_STATUSES))
        .values(
            publish_status=publish_status,
            published_at=func.utc_timestamp() if publish_status is PublishStatus.DONE else None,
            publish_error=error_code,
        )
        .execution_options(synchronize_session=False)
    )


def _result(session: Session, slug: str, version_id: int, published_dir: Path) -> PublishResult:
    dataset_id, version_no, publish_status, published_at, publish_error = session.execute(
        select(
            DatasetVersion.dataset_id,
            DatasetVersion.version_no,
            DatasetVersion.publish_status,
            DatasetVersion.published_at,
            DatasetVersion.publish_error,
        ).where(DatasetVersion.id == version_id)
    ).one()
    row_count = session.scalar(
        select(func.count(DatasetVersionRow.row_id)).where(DatasetVersionRow.version_id == version_id)
    ) or 0
    # 이야기가 가리키는 판의 상태를 붙이려고 이 묶음 판 상태를 한 번에 읽는다(판마다 조회하지 않음).
    statuses: dict[int, PublishStatus] = {
        number: status
        for number, status in session.execute(
            select(DatasetVersion.version_no, DatasetVersion.publish_status).where(
                DatasetVersion.dataset_id == dataset_id
            )
        )
    }
    # 읽기만 한 트랜잭션을 닫는다(잠금 · 읽기 시점을 다음 요청까지 끌지 않음).
    session.commit()
    return PublishResult(
        version_no=version_no,
        status=publish_status,
        path=public_path(slug, version_no),
        row_count=row_count,
        published_at=published_at,
        publish_error=publish_error,
        file_present=_file_present(published_dir, slug, version_no),
        usage=_with_version_status(find_story_references(published_dir, slug), statuses),
    )


def _with_version_status(usage: StoryUsage, statuses: dict[int, PublishStatus]) -> DatasetUsage:
    """이야기 참조마다 그 판의 발행 상태를 붙인다. 이 묶음에 없는 판 번호면 missing."""
    return DatasetUsage(
        used_by=[
            StoryUse(
                story=reference.story,
                title=reference.title,
                version=reference.version,
                version_status=statuses.get(reference.version, MISSING_VERSION_STATUS),
            )
            for reference in usage.references
        ],
        skipped_story_files=usage.skipped_files,
        skipped_references=usage.skipped_references,
    )


def _file_present(published_dir: Path, slug: str, version_no: int) -> bool:
    """조회 시점에 공개 파일이 일반 파일로 있는가. 링크 · 없음 · 그 밖 OSError · 경로 이상(UnsafePublishPath)은 False.

    파일을 지우거나 옮기지 않으므로(D-30) 폐기한 판의 파일이 남았는지 · 공개 판의 파일이 사라졌는지를 화면에 알린다.
    """
    try:
        file_path = dataset_file_path(published_dir, slug, version_no)
    except UnsafePublishPath:
        return False
    return _is_regular_file(file_path)


def _find_version(session: Session, dataset_id: int, version_no: int) -> DatasetVersion:
    # 묶음 id 로 좁혀 찾는다. 다른 묶음의 같은 번호는 없는 기록본(404)이다.
    version = session.scalars(
        select(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id, DatasetVersion.version_no == version_no)
    ).one_or_none()
    if version is None:
        raise ImportServiceError(ImportErrorCode.VERSION_NOT_FOUND)
    return version


def _version_schema(session: Session, version: DatasetVersion) -> DatasetSchema:
    schema = session.get(DatasetSchema, version.schema_id)
    if schema is None:
        # schema_id 는 외래 키라 없을 수 없다.
        raise ValueError("version schema is missing")
    return schema


def _has_incomplete_version(session: Session, dataset_id: int) -> bool:
    count = session.scalar(
        select(func.count(DatasetVersion.id)).where(
            DatasetVersion.dataset_id == dataset_id, DatasetVersion.publish_status.in_(INCOMPLETE_STATUSES)
        )
    )
    return bool(count)


def build_version_content(session: Session, dataset: Dataset, schema: DatasetSchema, version: DatasetVersion) -> bytes:
    """기록본에 든 줄로 발행 파일 바이트를 만든다. 기록본 · 구조 · 줄은 고치지 않으므로 다시 만들어도 바이트가 같다."""
    rows: list[PublishRow] = []
    for row_key, data, source_kind, source_url, as_of_date in session.execute(
        select(DatasetRow.row_key, DatasetRow.data, DatasetRow.source_kind, DatasetRow.source_url, DatasetRow.as_of_date)
        .join(DatasetVersionRow, DatasetVersionRow.row_id == DatasetRow.id)
        .where(DatasetVersionRow.version_id == version.id)
    ):
        if row_key is None or source_kind is None:
            # 기록본에는 구분 칸 · 출처 유형이 있는 승인 줄만 들어간다(_version_candidates · is_approvable).
            raise ContentInvalid("version row has no row key or source kind")
        rows.append(
            PublishRow(row_key=row_key, data=data, source_kind=source_kind, source_url=source_url, as_of_date=as_of_date)
        )
    return build_dataset_file(
        DatasetFileInput(
            slug=dataset.slug,
            title=dataset.title,
            version_no=version.version_no,
            schema_version=schema.version,
            created_at=version.created_at,
            fields=schema.fields,
            rows=rows,
        )
    )


def _existing_file_sha256(file_path: Path) -> str | None:
    # 링크 · FIFO 등 일반 파일이 아니면 읽지 않는다(read_regular_file 이 None).
    try:
        content = read_regular_file(file_path)
    except OSError as error:
        logger.warning("publish file read failed: file=%s errno=%s", file_path.name, error.errno)
        return None
    return None if content is None else file_sha256(content)


def _is_regular_file(file_path: Path) -> bool:
    # 링크를 따라가지 않는다(lstat). 링크 · FIFO 는 "일반 파일로 있음"이 아니다.
    try:
        return stat.S_ISREG(os.lstat(file_path).st_mode)
    except FileNotFoundError:
        return False
    except OSError as error:
        # {slug} 자리에 일반 파일 · 권한 없음 등. done 복구에서는 다시 쓰기 경로로 넘겨 쓰기 실패(409 publish_file_missing)로
        # 끝내고, 판 목록 · 결과의 file_present 에서는 "파일 없음"으로 알린다.
        logger.warning("publish file stat failed: file=%s errno=%s", file_path.name, error.errno)
        return False


def _sync_dirs(published_dir: Path, file_path: Path) -> bool:
    # 지름길도 링크 · 폴더 항목을 디스크에 남긴 뒤에만 done 으로 둔다. 실패하면 다시 쓰기 경로(SAME)로 넘긴다.
    try:
        sync_dataset_dirs(published_dir, file_path)
    except OSError as error:
        logger.warning("publish dir sync failed: file=%s errno=%s", file_path.name, error.errno)
        return False
    return True
