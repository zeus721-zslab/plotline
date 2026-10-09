"""관리자 데이터 묶음 · 붙여넣기 · 검토 · 발행 API 의 응답 모델과 서비스 결과 → 응답 변환.

요청 모델(입력 검증)은 라우터에 두고, 여기에는 응답 형식만 둔다(라우터 파일 크기를 줄이기 위해 분리).
"""

from datetime import UTC, date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.admin_imports.paste import ImportPreview, ImportSaveResult, RowSummary
from app.admin_imports.publish import DatasetUsage, ListedVersion, PublishResult
from app.admin_imports.service import (
    DatasetOverview,
    ListedRow,
    NextVersionPreview,
    RowPage,
)
from app.data_core.enums import ChangeKind, PublishStatus, RowStatus, SourceKind


def to_utc_iso(value: datetime) -> str:
    """DB 는 시간대 없는 UTC 로 저장한다(models.py). 응답에는 UTC 임을 Z 로 밝힌다."""
    return value.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


def _iso_date(value: date | None) -> str | None:
    return None if value is None else value.isoformat()


# --- 데이터 묶음 개요 ---


class DatasetSummaryResponse(BaseModel):
    slug: str
    title: str
    created_at: str
    latest_version_no: int | None
    latest_published_version_no: int | None
    # 검토할 줄(대기 줄 전부, 오류 줄 포함)
    pending_count: int
    has_unpublished_changes: bool


class RowCountsResponse(BaseModel):
    pending: int
    pending_error: int
    pending_carry_failed: int
    pending_new: int
    pending_changed: int
    pending_as_of_only: int
    approved: int
    rejected: int
    superseded: int
    excluded_keys: int


class SchemaVersionResponse(BaseModel):
    version: int
    fields: list[dict[str, Any]]
    created_at: str


class DatasetDetailResponse(BaseModel):
    slug: str
    title: str
    created_at: str
    latest_version_no: int | None
    latest_published_version_no: int | None
    has_unpublished_changes: bool
    schema_: SchemaVersionResponse | None = Field(serialization_alias="schema")
    counts: RowCountsResponse


def to_summary_response(overview: DatasetOverview) -> DatasetSummaryResponse:
    return DatasetSummaryResponse(
        slug=overview.slug,
        title=overview.title,
        created_at=to_utc_iso(overview.created_at),
        latest_version_no=overview.latest_version_no,
        latest_published_version_no=overview.latest_published_version_no,
        pending_count=overview.counts.pending,
        has_unpublished_changes=overview.has_unpublished_changes,
    )


def to_detail_response(overview: DatasetOverview) -> DatasetDetailResponse:
    schema = overview.schema
    return DatasetDetailResponse(
        slug=overview.slug,
        title=overview.title,
        created_at=to_utc_iso(overview.created_at),
        latest_version_no=overview.latest_version_no,
        latest_published_version_no=overview.latest_published_version_no,
        has_unpublished_changes=overview.has_unpublished_changes,
        schema_=None
        if schema is None
        else SchemaVersionResponse(
            version=schema.version, fields=schema.fields, created_at=to_utc_iso(schema.created_at)
        ),
        counts=RowCountsResponse(**vars(overview.counts)),
    )


# --- 붙여넣기 확인 · 저장 ---


class TargetResponse(BaseModel):
    slug: str
    title: str
    is_new: bool
    title_differs: bool
    bundle_title: str | None


class SchemaChangeResponse(BaseModel):
    changed: bool
    current_version: int | None
    added: list[str]
    removed: list[str]
    modified: list[str]
    carry_approved: int
    carry_pending: int
    carry_retry_approved: int
    carry_retry_pending: int
    old_pending_superseded: int


class RowSummaryResponse(BaseModel):
    new: int
    changed: int
    as_of_only: int
    unchanged: int
    error: int
    total: int


class ImportPreviewResponse(BaseModel):
    target: TargetResponse
    schema_: SchemaChangeResponse = Field(serialization_alias="schema")
    rows: RowSummaryResponse


class ImportSaveResponse(BaseModel):
    saved: bool
    slug: str
    rows: RowSummaryResponse
    carry_approved: int
    carry_pending: int
    carry_retry_approved: int
    carry_retry_pending: int
    old_pending_superseded: int


def _row_summary_response(summary: RowSummary) -> RowSummaryResponse:
    return RowSummaryResponse(
        new=summary.new,
        changed=summary.changed,
        as_of_only=summary.as_of_only,
        unchanged=summary.unchanged,
        error=summary.error,
        total=summary.total,
    )


def to_preview_response(preview: ImportPreview) -> ImportPreviewResponse:
    return ImportPreviewResponse(
        target=TargetResponse(**vars(preview.target)),
        schema_=SchemaChangeResponse(**vars(preview.schema)),
        rows=_row_summary_response(preview.rows),
    )


def to_save_response(result: ImportSaveResult) -> ImportSaveResponse:
    return ImportSaveResponse(
        saved=result.saved,
        slug=result.slug,
        rows=_row_summary_response(result.rows),
        carry_approved=result.carry_approved,
        carry_pending=result.carry_pending,
        carry_retry_approved=result.carry_retry_approved,
        carry_retry_pending=result.carry_retry_pending,
        old_pending_superseded=result.old_pending_superseded,
    )


# --- 줄 ---


class PrevValuesResponse(BaseModel):
    data: dict[str, Any]
    source_kind: SourceKind | None
    source_url: str | None
    as_of_date: str | None


class RowResponse(BaseModel):
    id: int
    import_id: int
    row_key: str | None
    data: dict[str, Any]
    source_kind: SourceKind | None
    source_url: str | None
    as_of_date: str | None
    status: RowStatus
    errors: list[dict[str, str | None]] | None
    reject_reason: str | None
    reviewed_at: str | None
    change_kind: ChangeKind | None
    prev: PrevValuesResponse | None
    excluded: bool


class RowPageResponse(BaseModel):
    rows: list[RowResponse]
    truncated: bool


class ApproveResponse(BaseModel):
    approved: int


def to_row_response(row: ListedRow) -> RowResponse:
    prev = row.prev
    return RowResponse(
        id=row.id,
        import_id=row.import_id,
        row_key=row.row_key,
        data=row.data,
        source_kind=row.source_kind,
        source_url=row.source_url,
        as_of_date=_iso_date(row.as_of_date),
        status=row.status,
        errors=row.errors,
        reject_reason=row.reject_reason,
        reviewed_at=None if row.reviewed_at is None else to_utc_iso(row.reviewed_at),
        change_kind=row.change_kind,
        prev=None
        if prev is None
        else PrevValuesResponse(
            data=prev.data,
            source_kind=prev.source_kind,
            source_url=prev.source_url,
            as_of_date=_iso_date(prev.as_of_date),
        ),
        excluded=row.excluded,
    )


def to_row_page_response(page: RowPage) -> RowPageResponse:
    return RowPageResponse(rows=[to_row_response(row) for row in page.rows], truncated=page.truncated)


# --- 기록본 ---


class NextVersionResponse(BaseModel):
    next_version_no: int
    row_count: int
    carried: int
    added: int
    replaced: int
    excluded: int
    removed: int
    unchanged: bool


class VersionResponse(BaseModel):
    version_no: int
    schema_version: int
    row_count: int
    note: str | None
    created_at: str
    status: PublishStatus
    path: str
    published_at: str | None
    # 실패 오류 코드(file_write_failed · file_conflict · content_invalid · content_changed). 화면은 쉬운 문장으로 바꿔 보인다.
    publish_error: str | None
    # 조회 시점에 공개 파일이 일반 파일로 있는가(저장하지 않음). 폐기 판의 남은 파일 · 공개 판의 사라진 파일을 알린다.
    file_present: bool


class StoryReferenceResponse(BaseModel):
    story: str
    title: str
    version: int
    # 가리키는 판의 발행 상태(조회 시점). 이 묶음에 없는 판이면 missing
    version_status: PublishStatus | Literal["missing"]


class VersionListResponse(BaseModel):
    versions: list[VersionResponse]
    # 이 묶음을 쓰는 이야기(발행 폴더 stories/*.json 기준)
    used_by: list[StoryReferenceResponse]
    # 일반 파일 아님 · 크기 초과 · 해석 실패 · 형식 불일치로 건너뛴 이야기 파일 수
    skipped_story_files: int
    # path 의 판 번호가 version 과 어긋나 건너뛴 이 묶음 항목 수
    skipped_references: int


class PublishResponse(BaseModel):
    version_no: int
    status: PublishStatus
    path: str
    row_count: int
    published_at: str | None
    publish_error: str | None
    file_present: bool
    used_by: list[StoryReferenceResponse]


def _optional_utc_iso(value: datetime | None) -> str | None:
    return None if value is None else to_utc_iso(value)


def _story_references(usage: DatasetUsage) -> list[StoryReferenceResponse]:
    return [
        StoryReferenceResponse(
            story=use.story, title=use.title, version=use.version, version_status=use.version_status
        )
        for use in usage.used_by
    ]


def to_version_response(listed: ListedVersion) -> VersionResponse:
    version = listed.summary
    return VersionResponse(
        version_no=version.version_no,
        schema_version=version.schema_version,
        row_count=version.row_count,
        note=version.note,
        created_at=to_utc_iso(version.created_at),
        status=version.publish_status,
        path=version.path,
        published_at=_optional_utc_iso(version.published_at),
        publish_error=version.publish_error,
        file_present=listed.file_present,
    )


def to_version_list_response(versions: list[ListedVersion], usage: DatasetUsage) -> VersionListResponse:
    return VersionListResponse(
        versions=[to_version_response(version) for version in versions],
        used_by=_story_references(usage),
        skipped_story_files=usage.skipped_story_files,
        skipped_references=usage.skipped_references,
    )


def to_publish_response(result: PublishResult) -> PublishResponse:
    return PublishResponse(
        version_no=result.version_no,
        status=result.status,
        path=result.path,
        row_count=result.row_count,
        published_at=_optional_utc_iso(result.published_at),
        publish_error=result.publish_error,
        file_present=result.file_present,
        used_by=_story_references(result.usage),
    )


def to_next_version_response(preview: NextVersionPreview) -> NextVersionResponse:
    return NextVersionResponse(**vars(preview))
