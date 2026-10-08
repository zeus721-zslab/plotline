"""데이터셋·필드 정의 관리자 API.

이 라우터는 보호 의존성을 직접 두지 않는다. main 에서 admin_router 아래에 포함되어
admin_router 의 캐시 금지·Origin 검사·세션 확인을 그대로 물려받는다(보호 목록은 admin_auth/router.py 한 곳).
"""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, JsonValue, StringConstraints
from sqlalchemy.orm import Session

from app.admin_datasets.service import (
    DatasetDetail,
    DatasetErrorCode,
    DatasetServiceError,
    DatasetSummary,
    SchemaVersion,
    create_dataset,
    get_dataset_detail,
    list_datasets,
    save_schema,
)
from app.data_core.models import SLUG_MAX_LENGTH, TITLE_MAX_LENGTH
from app.db import get_db_session

SLUG_PATTERN = r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$"
MIN_FIELD_COUNT = 1
MAX_FIELD_COUNT = 100

ERROR_STATUS: dict[DatasetErrorCode, int] = {
    DatasetErrorCode.DATASET_SLUG_TAKEN: status.HTTP_409_CONFLICT,
    DatasetErrorCode.DATASET_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    DatasetErrorCode.INVALID_FIELDS: status.HTTP_422_UNPROCESSABLE_CONTENT,
    DatasetErrorCode.SCHEMA_UNCHANGED: status.HTTP_409_CONFLICT,
    DatasetErrorCode.SCHEMA_VERSION_CONFLICT: status.HTTP_409_CONFLICT,
}

datasets_router = APIRouter(prefix="/datasets")

DbSession = Annotated[Session, Depends(get_db_session)]


class CreateDatasetRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=SLUG_MAX_LENGTH, pattern=SLUG_PATTERN)
    title: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TITLE_MAX_LENGTH)
    ]


class SaveSchemaRequest(BaseModel):
    # 원소의 속성 규칙은 서비스의 parse_field_definitions 가 판정한다. 여기서는 객체 배열·개수만 본다.
    fields: list[dict[str, JsonValue]] = Field(min_length=MIN_FIELD_COUNT, max_length=MAX_FIELD_COUNT)


class DatasetSummaryResponse(BaseModel):
    slug: str
    title: str
    created_at: str
    schema_version: int | None


class SchemaVersionResponse(BaseModel):
    version: int
    fields: list[dict[str, Any]]
    created_at: str


class DatasetDetailResponse(BaseModel):
    slug: str
    title: str
    created_at: str
    schema_: SchemaVersionResponse | None = Field(serialization_alias="schema")


def to_utc_iso(value: datetime) -> str:
    """DB 는 시간대 없는 UTC 로 저장한다(models.py). 응답에는 UTC 임을 Z 로 밝힌다."""
    return value.replace(tzinfo=UTC).isoformat().replace("+00:00", "Z")


def to_http_error(error: DatasetServiceError) -> HTTPException:
    # HTTPException 으로 바꿔 던져야 admin_router 의 apply_no_store 가 오류 응답에도 no-store 를 붙인다.
    detail: dict[str, object] = {"code": error.code.value, "message": error.message}
    if error.problems is not None:
        detail["problems"] = error.problems
    return HTTPException(status_code=ERROR_STATUS[error.code], detail=detail)


def to_summary_response(summary: DatasetSummary) -> DatasetSummaryResponse:
    return DatasetSummaryResponse(
        slug=summary.slug,
        title=summary.title,
        created_at=to_utc_iso(summary.created_at),
        schema_version=summary.schema_version,
    )


def to_schema_response(schema: SchemaVersion) -> SchemaVersionResponse:
    return SchemaVersionResponse(
        version=schema.version, fields=schema.fields, created_at=to_utc_iso(schema.created_at)
    )


def to_detail_response(detail: DatasetDetail) -> DatasetDetailResponse:
    return DatasetDetailResponse(
        slug=detail.slug,
        title=detail.title,
        created_at=to_utc_iso(detail.created_at),
        schema_=None if detail.schema is None else to_schema_response(detail.schema),
    )


@datasets_router.get("")
def get_datasets(session: DbSession) -> list[DatasetSummaryResponse]:
    return [to_summary_response(summary) for summary in list_datasets(session)]


@datasets_router.post("", status_code=status.HTTP_201_CREATED)
def post_dataset(body: CreateDatasetRequest, session: DbSession) -> DatasetSummaryResponse:
    try:
        summary = create_dataset(session, body.slug, body.title)
    except DatasetServiceError as error:
        raise to_http_error(error) from error
    return to_summary_response(summary)


@datasets_router.get("/{slug}")
def get_dataset(slug: str, session: DbSession) -> DatasetDetailResponse:
    try:
        detail = get_dataset_detail(session, slug)
    except DatasetServiceError as error:
        raise to_http_error(error) from error
    return to_detail_response(detail)


@datasets_router.post("/{slug}/schemas", status_code=status.HTTP_201_CREATED)
def post_schema(slug: str, body: SaveSchemaRequest, session: DbSession) -> SchemaVersionResponse:
    try:
        schema = save_schema(session, slug, body.fields)
    except DatasetServiceError as error:
        raise to_http_error(error) from error
    return to_schema_response(schema)
