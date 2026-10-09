"""관리자 데이터 묶음 · 붙여넣기 · 검토 · 기록본 API 의 응답 모델과 서비스 결과 → 응답 변환.

요청 모델(입력 검증)은 라우터에 두고, 여기에는 응답 형식만 둔다(라우터 파일 크기를 줄이기 위해 분리).
"""

from datetime import UTC, date, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.admin_imports.paste import ImportPreview, ImportSaveResult, RowSummary
from app.admin_imports.service import (
    DatasetOverview,
    ListedRow,
    NextVersionPreview,
    RowPage,
    VersionSummary,
)
from app.data_core.enums import ChangeKind, RowStatus, SourceKind


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
    has_unpublished_changes: bool
    schema_: SchemaVersionResponse | None = Field(serialization_alias="schema")
    counts: RowCountsResponse


def to_summary_response(overview: DatasetOverview) -> DatasetSummaryResponse:
    return DatasetSummaryResponse(
        slug=overview.slug,
        title=overview.title,
        created_at=to_utc_iso(overview.created_at),
        latest_version_no=overview.latest_version_no,
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
    unchanged: bool


class VersionResponse(BaseModel):
    version_no: int
    schema_version: int
    row_count: int
    note: str | None
    created_at: str


def to_version_response(version: VersionSummary) -> VersionResponse:
    return VersionResponse(
        version_no=version.version_no,
        schema_version=version.schema_version,
        row_count=version.row_count,
        note=version.note,
        created_at=to_utc_iso(version.created_at),
    )


def to_next_version_response(preview: NextVersionPreview) -> NextVersionResponse:
    return NextVersionResponse(**vars(preview))
