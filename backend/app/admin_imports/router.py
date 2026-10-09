"""데이터 묶음 · 붙여넣기 · 줄 검토 · 발행 관리자 API.

보호 의존성을 직접 두지 않는다. main 에서 admin_router 아래에 포함되어 캐시 금지·Origin 검사·세션 확인을
그대로 물려받는다(보호 목록은 admin_auth/router.py 한 곳).
"""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path as FilePath
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import AfterValidator, BaseModel, Field, StringConstraints
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.admin_imports.errors import ImportErrorCode, ImportServiceError
from app.admin_imports.paste import preview_import, save_import
from app.admin_imports.publish import abandon_version, list_versions_with_usage, publish_dataset, retry_publish
from app.admin_imports.schemas import (
    ApproveResponse,
    DatasetDetailResponse,
    DatasetSummaryResponse,
    ImportPreviewResponse,
    ImportSaveResponse,
    NextVersionResponse,
    PublishResponse,
    RowPageResponse,
    RowResponse,
    VersionListResponse,
    to_detail_response,
    to_next_version_response,
    to_preview_response,
    to_publish_response,
    to_row_page_response,
    to_row_response,
    to_save_response,
    to_summary_response,
    to_version_list_response,
)
from app.admin_imports.service import (
    BULK_APPROVABLE_KINDS,
    RowView,
    add_exclusion,
    approve_rows,
    approve_rows_by_kind,
    get_dataset_overview,
    list_dataset_overviews,
    list_rows,
    preview_next_version,
    reject_row,
    remove_exclusion,
)
from app.data_core.enums import ChangeKind, ImportSourceType
from app.config import Settings, get_settings
from app.data_core.models import (
    REJECT_REASON_MAX_LENGTH,
    ROW_KEY_MAX_LENGTH,
    SLUG_MAX_LENGTH,
    SLUG_PATTERN,
    URL_MAX_LENGTH,
)
from app.db import get_db_session

# 관리자 화면에서 받는 입력 경로. api 는 외부 연동 전용이라 이 API 로 받지 않는다.
ACCEPTED_SOURCE_TYPES = frozenset({ImportSourceType.CLAUDE, ImportSourceType.UPLOAD})
HTTP_URL_PATTERN = r"^https?://[^\s/?#]+[^\s]*$"
# BIGINT 상한. 이보다 큰 경로 숫자는 DB 비교 전에 422 로 끝낸다.
MAX_ROW_ID = 2**63 - 1
# 선택 승인 한 번에 받는 줄 id 개수 상한(상태별 줄 조회 한 화면 분량과 같다).
MAX_APPROVE_ROW_IDS = 2000
# MariaDB 잠금 충돌 오류 번호: 1213 ER_LOCK_DEADLOCK · 1205 ER_LOCK_WAIT_TIMEOUT. 다른 요청과 겹친 것이라
# 409 concurrent_change 로 알려 운영자가 다시 확인하게 한다(재시도하지 않음).
LOCK_CONFLICT_ERROR_NUMBERS = frozenset({1213, 1205})

ERROR_STATUS: dict[ImportErrorCode, int] = {
    ImportErrorCode.DATASET_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    ImportErrorCode.DATASET_REQUIRED: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ImportErrorCode.DATASET_MISMATCH: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ImportErrorCode.DATASET_CONFIRMATION_REQUIRED: status.HTTP_409_CONFLICT,
    ImportErrorCode.DATASET_CONFLICT: status.HTTP_409_CONFLICT,
    ImportErrorCode.CONCURRENT_CHANGE: status.HTTP_409_CONFLICT,
    ImportErrorCode.INVALID_BUNDLE: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ImportErrorCode.INVALID_FIELDS: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ImportErrorCode.SCHEMA_MISSING: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ImportErrorCode.SCHEMA_CONFIRMATION_REQUIRED: status.HTTP_409_CONFLICT,
    ImportErrorCode.SCHEMA_VERSION_CONFLICT: status.HTTP_409_CONFLICT,
    ImportErrorCode.ROW_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    ImportErrorCode.ROW_NOT_PENDING: status.HTTP_409_CONFLICT,
    ImportErrorCode.EXCLUSION_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    ImportErrorCode.VERSION_CONFLICT: status.HTTP_409_CONFLICT,
    ImportErrorCode.VERSION_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    ImportErrorCode.PUBLISH_EMPTY: status.HTTP_409_CONFLICT,
    ImportErrorCode.PUBLISH_UNCHANGED: status.HTTP_409_CONFLICT,
    ImportErrorCode.PUBLISH_INCOMPLETE: status.HTTP_409_CONFLICT,
    ImportErrorCode.PUBLISH_CONTENT_INVALID: status.HTTP_409_CONFLICT,
    ImportErrorCode.PUBLISH_FILE_MISSING: status.HTTP_409_CONFLICT,
    ImportErrorCode.CONTENT_CHANGED: status.HTTP_409_CONFLICT,
    ImportErrorCode.VERSION_NOT_ABANDONABLE: status.HTTP_409_CONFLICT,
    ImportErrorCode.VERSION_ABANDONED: status.HTTP_409_CONFLICT,
}

datasets_router = APIRouter(prefix="/datasets")
paste_router = APIRouter(prefix="/imports")

DbSession = Annotated[Session, Depends(get_db_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]
RecordId = Annotated[int, Path(ge=1, le=MAX_ROW_ID)]
Slug = Annotated[str, StringConstraints(min_length=1, max_length=SLUG_MAX_LENGTH, pattern=SLUG_PATTERN)]
RowKey = Annotated[str, StringConstraints(min_length=1, max_length=ROW_KEY_MAX_LENGTH)]


def _accepted_source_type(value: ImportSourceType) -> ImportSourceType:
    if value not in ACCEPTED_SOURCE_TYPES:
        raise ValueError(f"source_type 은 {', '.join(sorted(ACCEPTED_SOURCE_TYPES))} 중 하나여야 합니다.")
    return value


class PreviewImportRequest(BaseModel):
    # 길이 상한·형식은 서비스의 묶음 해석(parse_bundle)이 문제 목록으로 돌려준다.
    payload: str
    # 없음: 목록의 붙여넣기(대상은 묶음 머리로 정함) · 있음: 작업 페이지(대상 고정)
    slug: Slug | None = None
    source_type: Annotated[ImportSourceType, AfterValidator(_accepted_source_type)] = ImportSourceType.CLAUDE
    default_source_url: Annotated[str, Field(max_length=URL_MAX_LENGTH, pattern=HTTP_URL_PATTERN)] | None = None


class SaveImportRequest(PreviewImportRequest):
    create_dataset: bool = False
    confirm_schema: bool = False


class RejectRowRequest(BaseModel):
    reason: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=REJECT_REASON_MAX_LENGTH)
    ]


class ApproveRowsRequest(BaseModel):
    # 정수만 받는다(strict: "1"·1.0·true 를 id 로 바꾸지 않음). 중복은 서비스가 걸러낸다.
    row_ids: Annotated[
        list[Annotated[int, Field(strict=True, ge=1, le=MAX_ROW_ID)]],
        Field(min_length=1, max_length=MAX_APPROVE_ROW_IDS),
    ]


def _bulk_approvable_kind(value: ChangeKind) -> ChangeKind:
    # 분류 일괄 승인은 새 줄 · 확인일만 갱신 줄만(바뀌는 줄은 하나씩 확인).
    if value not in BULK_APPROVABLE_KINDS:
        raise ValueError(f"change_kind 는 {', '.join(sorted(BULK_APPROVABLE_KINDS))} 중 하나여야 합니다.")
    return value


class ApproveKindRequest(BaseModel):
    change_kind: Annotated[ChangeKind, AfterValidator(_bulk_approvable_kind)]


class ExclusionRequest(BaseModel):
    row_key: RowKey


def to_http_error(error: ImportServiceError) -> HTTPException:
    # HTTPException 으로 바꿔 던져야 admin_router 의 apply_no_store 가 오류 응답에도 no-store 를 붙인다.
    detail: dict[str, object] = {"code": error.code.value, "message": error.message}
    if error.problems is not None:
        detail["problems"] = error.problems
    if error.code is ImportErrorCode.SCHEMA_CONFIRMATION_REQUIRED:
        # 구조가 없으면 null 이므로 값 유무가 아니라 코드로 판단해 항상 싣는다.
        detail["current_version"] = error.current_version
    return HTTPException(status_code=ERROR_STATUS[error.code], detail=detail)


def _is_lock_conflict(error: OperationalError) -> bool:
    # pymysql 은 오류 번호를 원본 예외의 첫 인자로 준다.
    original = error.orig
    return original is not None and bool(original.args) and original.args[0] in LOCK_CONFLICT_ERROR_NUMBERS


@contextmanager
def http_errors() -> Iterator[None]:
    """서비스 도메인 오류와 DB 잠금 충돌(1213 · 1205)을 HTTP 오류로 바꾼다. 그 밖의 OperationalError 는 그대로 올린다."""
    try:
        yield
    except ImportServiceError as error:
        raise to_http_error(error) from error
    except OperationalError as error:
        if not _is_lock_conflict(error):
            raise
        raise to_http_error(ImportServiceError(ImportErrorCode.CONCURRENT_CHANGE)) from error


# --- 붙여넣기 확인 · 저장 ---


@paste_router.post("/preview")
def post_import_preview(body: PreviewImportRequest, session: DbSession) -> ImportPreviewResponse:
    with http_errors():
        preview = preview_import(session, body.slug, body.payload, body.source_type, body.default_source_url)
    return to_preview_response(preview)


@paste_router.post("")
def post_import(body: SaveImportRequest, session: DbSession) -> ImportSaveResponse:
    with http_errors():
        result = save_import(
            session,
            body.slug,
            body.payload,
            body.source_type,
            body.default_source_url,
            body.create_dataset,
            body.confirm_schema,
        )
    return to_save_response(result)


# --- 데이터 묶음 ---


@datasets_router.get("")
def get_datasets(session: DbSession) -> list[DatasetSummaryResponse]:
    with http_errors():
        overviews = list_dataset_overviews(session)
    return [to_summary_response(overview) for overview in overviews]


@datasets_router.get("/{slug}")
def get_dataset(slug: str, session: DbSession) -> DatasetDetailResponse:
    with http_errors():
        overview = get_dataset_overview(session, slug)
    return to_detail_response(overview)


# --- 줄 ---


@datasets_router.get("/{slug}/rows")
def get_rows(slug: str, session: DbSession, view: Annotated[RowView, Query(alias="status")]) -> RowPageResponse:
    with http_errors():
        page = list_rows(session, slug, view)
    return to_row_page_response(page)


@datasets_router.post("/{slug}/rows/approve")
def post_approve_rows(slug: str, body: ApproveRowsRequest, session: DbSession) -> ApproveResponse:
    with http_errors():
        approved = approve_rows(session, slug, body.row_ids)
    return ApproveResponse(approved=approved)


@datasets_router.post("/{slug}/rows/approve-kind")
def post_approve_kind(slug: str, body: ApproveKindRequest, session: DbSession) -> ApproveResponse:
    with http_errors():
        approved = approve_rows_by_kind(session, slug, body.change_kind)
    return ApproveResponse(approved=approved)


@datasets_router.post("/{slug}/rows/{row_id}/reject")
def post_reject(slug: str, row_id: RecordId, body: RejectRowRequest, session: DbSession) -> RowResponse:
    with http_errors():
        row = reject_row(session, slug, row_id, body.reason)
    return to_row_response(row)


@datasets_router.post("/{slug}/exclusions", status_code=status.HTTP_204_NO_CONTENT)
def post_exclusion(slug: str, body: ExclusionRequest, session: DbSession) -> None:
    with http_errors():
        add_exclusion(session, slug, body.row_key)


@datasets_router.delete("/{slug}/exclusions", status_code=status.HTTP_204_NO_CONTENT)
def delete_exclusion(slug: str, body: ExclusionRequest, session: DbSession) -> None:
    with http_errors():
        remove_exclusion(session, slug, body.row_key)


# --- 발행(기록본 + 공개 파일, D-29) ---


@datasets_router.post("/{slug}/publish", status_code=status.HTTP_201_CREATED)
def post_publish(slug: str, session: DbSession, settings: AppSettings) -> PublishResponse:
    with http_errors():
        result = publish_dataset(session, slug, FilePath(settings.published_dir))
    return to_publish_response(result)


@datasets_router.post("/{slug}/versions/{version_no}/publish")
def post_retry_publish(slug: str, version_no: RecordId, session: DbSession, settings: AppSettings) -> PublishResponse:
    with http_errors():
        result = retry_publish(session, slug, version_no, FilePath(settings.published_dir))
    return to_publish_response(result)


@datasets_router.post("/{slug}/versions/{version_no}/abandon")
def post_abandon(slug: str, version_no: RecordId, session: DbSession, settings: AppSettings) -> PublishResponse:
    with http_errors():
        result = abandon_version(session, slug, version_no, FilePath(settings.published_dir))
    return to_publish_response(result)


@datasets_router.get("/{slug}/versions/next")
def get_next_version(slug: str, session: DbSession) -> NextVersionResponse:
    with http_errors():
        preview = preview_next_version(session, slug)
    return to_next_version_response(preview)


@datasets_router.get("/{slug}/versions")
def get_versions(slug: str, session: DbSession, settings: AppSettings) -> VersionListResponse:
    with http_errors():
        versions, usage = list_versions_with_usage(session, slug, FilePath(settings.published_dir))
    return to_version_list_response(versions, usage)
