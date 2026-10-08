"""데이터셋·필드 정의 유스케이스. 함수 1개 = 유스케이스 1개 = commit 1회.

요청 형식(slug 패턴·길이 등)은 라우터의 Pydantic 모델이, 도메인 규칙(중복·존재·정의 검사·변경 여부)은 여기서 판정한다.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.data_core.field_definition import FieldDefinitionError, parse_field_definitions
from app.data_core.models import Dataset, DatasetSchema

FIRST_SCHEMA_VERSION = 1


class DatasetErrorCode(StrEnum):
    DATASET_SLUG_TAKEN = "dataset_slug_taken"
    DATASET_NOT_FOUND = "dataset_not_found"
    INVALID_FIELDS = "invalid_fields"
    SCHEMA_UNCHANGED = "schema_unchanged"
    SCHEMA_VERSION_CONFLICT = "schema_version_conflict"


ERROR_MESSAGES: dict[DatasetErrorCode, str] = {
    DatasetErrorCode.DATASET_SLUG_TAKEN: "이미 사용 중인 slug 입니다.",
    DatasetErrorCode.DATASET_NOT_FOUND: "없는 데이터셋입니다.",
    DatasetErrorCode.INVALID_FIELDS: "필드 정의에 문제가 있습니다.",
    DatasetErrorCode.SCHEMA_UNCHANGED: "최신 정의와 같아 새 버전을 만들지 않았습니다.",
    DatasetErrorCode.SCHEMA_VERSION_CONFLICT: "같은 버전이 동시에 저장되었습니다. 다시 불러온 뒤 저장하세요.",
}


class DatasetServiceError(Exception):
    def __init__(self, code: DatasetErrorCode, problems: list[str] | None = None) -> None:
        super().__init__(code.value)
        self.code = code
        self.message = ERROR_MESSAGES[code]
        self.problems = problems


@dataclass(frozen=True)
class DatasetSummary:
    slug: str
    title: str
    created_at: datetime
    schema_version: int | None


@dataclass(frozen=True)
class SchemaVersion:
    version: int
    fields: list[dict[str, Any]]
    created_at: datetime


@dataclass(frozen=True)
class DatasetDetail:
    slug: str
    title: str
    created_at: datetime
    schema: SchemaVersion | None


def list_datasets(session: Session) -> list[DatasetSummary]:
    """최근 생성 순. 최신 정의 버전은 집계 1회로 함께 읽는다(데이터셋마다 조회하지 않음)."""
    latest_version = func.max(DatasetSchema.version)
    statement = (
        select(Dataset.slug, Dataset.title, Dataset.created_at, latest_version)
        .outerjoin(DatasetSchema, DatasetSchema.dataset_id == Dataset.id)
        .group_by(Dataset.id, Dataset.slug, Dataset.title, Dataset.created_at)
        # created_at 은 초 단위라 같은 초에 만든 데이터셋은 id 로 생성 순서를 정한다.
        .order_by(Dataset.created_at.desc(), Dataset.id.desc())
    )
    return [
        DatasetSummary(slug=slug, title=title, created_at=created_at, schema_version=version)
        for slug, title, created_at, version in session.execute(statement)
    ]


def create_dataset(session: Session, slug: str, title: str) -> DatasetSummary:
    if _find_dataset(session, slug) is not None:
        raise DatasetServiceError(DatasetErrorCode.DATASET_SLUG_TAKEN)

    dataset = Dataset(slug=slug, title=title)
    session.add(dataset)
    try:
        session.commit()
    except IntegrityError as error:
        # 조회와 저장 사이에 같은 slug 가 먼저 저장된 경우. datasets 의 유니크 제약은 slug 하나뿐이다.
        session.rollback()
        raise DatasetServiceError(DatasetErrorCode.DATASET_SLUG_TAKEN) from error
    return DatasetSummary(
        slug=dataset.slug, title=dataset.title, created_at=dataset.created_at, schema_version=None
    )


def get_dataset_detail(session: Session, slug: str) -> DatasetDetail:
    dataset = _require_dataset(session, slug)
    latest = _latest_schema(session, dataset.id)
    return DatasetDetail(
        slug=dataset.slug,
        title=dataset.title,
        created_at=dataset.created_at,
        schema=None if latest is None else _to_schema_version(latest),
    )


def save_schema(session: Session, slug: str, fields: list[dict[str, Any]]) -> SchemaVersion:
    """정의를 검사해 새 버전으로 저장한다. 기존 버전은 고치지 않는다(행·버전이 옛 정의를 참조한다)."""
    dataset = _require_dataset(session, slug)
    try:
        parse_field_definitions(fields)
    except FieldDefinitionError as error:
        raise DatasetServiceError(DatasetErrorCode.INVALID_FIELDS, problems=error.problems) from error

    latest = _latest_schema(session, dataset.id)
    if latest is not None and latest.fields == fields:
        raise DatasetServiceError(DatasetErrorCode.SCHEMA_UNCHANGED)

    next_version = FIRST_SCHEMA_VERSION if latest is None else latest.version + 1
    schema = DatasetSchema(dataset_id=dataset.id, version=next_version, fields=fields)
    session.add(schema)
    try:
        session.commit()
    except IntegrityError as error:
        # 동시에 같은 다음 버전을 저장하면 (dataset_id, version) 유니크 제약이 하나만 받아들인다.
        session.rollback()
        raise DatasetServiceError(DatasetErrorCode.SCHEMA_VERSION_CONFLICT) from error
    return _to_schema_version(schema)


def _find_dataset(session: Session, slug: str) -> Dataset | None:
    dataset = session.scalars(select(Dataset).where(Dataset.slug == slug)).one_or_none()
    # slug 컬럼 collation(utf8mb4_unicode_ci)은 대소문자·끝 공백을 무시하므로, 주소의 slug 와 정확히 같을 때만 같은 데이터셋으로 본다.
    if dataset is None or dataset.slug != slug:
        return None
    return dataset


def _require_dataset(session: Session, slug: str) -> Dataset:
    dataset = _find_dataset(session, slug)
    if dataset is None:
        raise DatasetServiceError(DatasetErrorCode.DATASET_NOT_FOUND)
    return dataset


def _latest_schema(session: Session, dataset_id: int) -> DatasetSchema | None:
    statement = (
        select(DatasetSchema)
        .where(DatasetSchema.dataset_id == dataset_id)
        .order_by(DatasetSchema.version.desc())
        .limit(1)
    )
    return session.scalars(statement).one_or_none()


def _to_schema_version(schema: DatasetSchema) -> SchemaVersion:
    return SchemaVersion(version=schema.version, fields=schema.fields, created_at=schema.created_at)
