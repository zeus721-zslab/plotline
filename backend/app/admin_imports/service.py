"""데이터 묶음 개요 · 줄 검토(승인 · 제외 · 공개 제외) · 기록본 조회 유스케이스. 함수 1개 = 유스케이스 1개 = commit 1회.

붙여넣기 확인 · 저장은 paste.py, 발행(기록본 생성 + 공개 파일)은 publish.py 가 맡는다. 요청 형식은 라우터의 Pydantic 모델이, 상태 전이 · 기록본 구성 규칙은 여기서 판정한다.
"""

from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, case, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.admin_datasets import service as dataset_service
from app.admin_imports.errors import ImportErrorCode, ImportServiceError
from app.data_core.enums import ChangeKind, PublishStatus, RowStatus, SourceKind
from app.data_core.models import (
    DataImport,
    Dataset,
    DatasetKeyExclusion,
    DatasetRow,
    DatasetSchema,
    DatasetVersion,
    DatasetVersionRow,
)
from app.data_core.row_validation import is_approvable
from app.publishing.dataset_file import public_path

FIRST_VERSION_NO = 1
# 상태별 줄 조회 한 번에 돌려주는 최대 줄 수. 넘으면 앞부분만 주고 잘렸다고 알린다.
ROWS_PAGE_LIMIT = 2000
# 분류 일괄 승인에 쓸 수 있는 분류. 바뀌는 줄은 하나씩 확인하고 고른 줄만 승인한다.
BULK_APPROVABLE_KINDS = frozenset({ChangeKind.NEW, ChangeKind.AS_OF_ONLY})


class RowView(StrEnum):
    """줄 목록 탭. excluded 는 상태가 아니라 "공개 제외 구분 칸의 승인 줄" 보기다."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"
    EXCLUDED = "excluded"


@dataclass(frozen=True)
class RowCounts:
    """탭별 줄 수. pending = pending_error + pending_new + pending_changed + pending_as_of_only.

    pending_error 는 오류 있는 대기 줄 전부이고 pending_carry_failed 는 그중 구조 이월 실패 줄이다.
    pending_changed 는 분류 없는(이 규칙 이전 입력) 오류 없는 대기 줄도 포함한다(하나씩 확인).
    """

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


@dataclass(frozen=True)
class SchemaVersion:
    version: int
    fields: list[dict[str, Any]]
    created_at: datetime


@dataclass(frozen=True)
class DatasetOverview:
    slug: str
    title: str
    created_at: datetime
    latest_version_no: int | None
    # 파일 쓰기까지 끝난(done) 기록본 중 가장 큰 판 번호
    latest_published_version_no: int | None
    # 기록본 후보가 있고 최신 기록본과 구성이 다름(_plan_version 기준)
    has_unpublished_changes: bool
    counts: RowCounts
    # 상세에서만 채운다(목록은 None)
    schema: SchemaVersion | None


@dataclass(frozen=True)
class PrevValues:
    """비교 상대였던 줄의 값 · 출처(이전값 → 새값 표시용)."""

    data: dict[str, Any]
    source_kind: SourceKind | None
    source_url: str | None
    as_of_date: date | None


@dataclass(frozen=True)
class ListedRow:
    id: int
    import_id: int
    row_key: str | None
    data: dict[str, Any]
    source_kind: SourceKind | None
    source_url: str | None
    as_of_date: date | None
    status: RowStatus
    errors: list[dict[str, str | None]] | None
    reject_reason: str | None
    reviewed_at: datetime | None
    change_kind: ChangeKind | None
    prev: PrevValues | None
    # 이 줄의 구분 칸이 공개 제외 중인지
    excluded: bool


@dataclass(frozen=True)
class RowPage:
    rows: list[ListedRow]
    truncated: bool


@dataclass(frozen=True)
class VersionSummary:
    version_no: int
    schema_version: int
    row_count: int
    note: str | None
    created_at: datetime
    publish_status: PublishStatus
    # 공개 경로(/data/datasets/{slug}/v{n}.json)
    path: str
    published_at: datetime | None
    # 실패 · 폐기 전 실패의 오류 코드(화면은 코드 대신 쉬운 문장으로 바꿔 보인다)
    publish_error: str | None


@dataclass(frozen=True)
class NextVersionPreview:
    """다음 기록본을 지금 만들면 생길 구성. 발행(publish.publish_dataset)과 같은 선택 규칙(_plan_version)으로 계산한다.

    아래 "최신 기록본"은 마지막 공개본(done)이다(D-30).
    """

    next_version_no: int
    row_count: int
    # 최신 기록본에도 있던 줄
    carried: int
    # 최신 기록본에 없던 줄
    added: int
    # 최신 기록본에 있었지만 같은 구분 칸의 더 최근 승인 줄로 바뀌는 줄
    replaced: int
    # 최신 구조가 아닌 구조로 들어온 입력의 승인 줄(기록본에 들어가지 않음)
    excluded: int
    # 최신 기록본에 있었지만 다음 기록본에서 빠지는 줄(바뀌는 줄 제외: 공개 제외 · 구조 변경 등)
    removed: int
    # 최신 기록본과 구조 · 줄 구성이 같아 만들 것이 없음
    unchanged: bool


@dataclass(frozen=True)
class _VersionPlan:
    schema: DatasetSchema | None
    # row_key → 그 구분 칸의 후보 줄 id
    candidates: dict[str, int]
    # 마지막 공개본(done 중 가장 큰 번호)에 든 줄 id → row_key. 아래 "최신 기록본"은 모두 이 공개본을 뜻한다(D-30).
    latest_rows: dict[int, str | None]
    # 마지막 공개본이 최신 구조를 따르는지(공개본이 없으면 False)
    latest_same_schema: bool
    next_version_no: int
    unchanged: bool


# --- 데이터 묶음 개요 ---


def list_dataset_overviews(session: Session) -> list[DatasetOverview]:
    """최근 생성 순. 줄 수 · 최신 기록본은 집계 1회로 읽는다.

    공개 안 된 변경 여부는 기록본 구성 규칙(_plan_version)을 묶음마다 계산한다. 단일 운영자의 묶음 수(수십 개 이하)를
    전제로 한 묶음당 조회이며, 규칙을 SQL 로 따로 옮기면 기록본 생성과 판정이 어긋날 수 있어 같은 함수를 쓴다.
    """
    statement = _overview_statement(None).order_by(
        # created_at 은 초 단위라 같은 초에 만든 묶음은 id 로 생성 순서를 정한다.
        Dataset.created_at.desc(),
        Dataset.id.desc(),
    )
    return [_to_overview(session, row, schema=None) for row in session.execute(statement)]


def get_dataset_overview(session: Session, slug: str) -> DatasetOverview:
    dataset = _require_dataset(session, slug)
    latest = dataset_service._latest_schema(session, dataset.id)
    row = session.execute(_overview_statement(dataset.id)).one()
    schema = None if latest is None else SchemaVersion(latest.version, latest.fields, latest.created_at)
    return _to_overview(session, row, schema=schema)


# --- 줄 목록 ---


def list_rows(session: Session, slug: str, view: RowView) -> RowPage:
    """한 탭의 줄을 id 순으로 최대 ROWS_PAGE_LIMIT 줄 돌려준다. 이전 줄 · 공개 제외 여부는 같은 조회에서 함께 읽는다."""
    dataset = _require_dataset(session, slug)
    prev = aliased(DatasetRow)
    statement = (
        select(DatasetRow, prev, DatasetKeyExclusion.row_key)
        .outerjoin(prev, prev.id == DatasetRow.prev_row_id)
        .outerjoin(
            DatasetKeyExclusion,
            and_(
                DatasetKeyExclusion.dataset_id == DatasetRow.dataset_id,
                DatasetKeyExclusion.row_key == DatasetRow.row_key,
            ),
        )
        .where(DatasetRow.dataset_id == dataset.id)
    )
    if view is RowView.EXCLUDED:
        statement = statement.where(
            DatasetRow.status == RowStatus.APPROVED, DatasetKeyExclusion.row_key.is_not(None)
        )
    else:
        statement = statement.where(DatasetRow.status == RowStatus(view.value))
    # 한 줄 더 읽어 잘렸는지 판단한다(전체 개수를 따로 세지 않음).
    found = session.execute(statement.order_by(DatasetRow.id).limit(ROWS_PAGE_LIMIT + 1)).all()
    rows = [_to_listed_row(row, prev_row, excluded_key is not None) for row, prev_row, excluded_key in found]
    return RowPage(rows=rows[:ROWS_PAGE_LIMIT], truncated=len(rows) > ROWS_PAGE_LIMIT)


# --- 승인 · 제외 ---


def approve_rows(session: Session, slug: str, row_ids: list[int]) -> int:
    """고른 줄 중 그 묶음의 승인 가능한 대기 줄만 승인한다. 다른 묶음 줄 · 없는 id 는 오류 없이 건너뛴다."""
    _lock_existing_dataset(session, slug)
    dataset = _require_dataset(session, slug)
    unique_ids = sorted(set(row_ids))
    return _approve_pending(session, dataset.id, DatasetRow.id.in_(unique_ids))


def approve_rows_by_kind(session: Session, slug: str, change_kind: ChangeKind) -> int:
    """분류 일괄 승인: 그 분류(new · as_of_only)의 승인 가능한 대기 줄을 모두 승인한다."""
    if change_kind not in BULK_APPROVABLE_KINDS:
        # 요청 검증이 먼저 거르므로 여기 오면 호출 쪽 버그다.
        raise ValueError(f"bulk approval is not allowed for {change_kind}")
    _lock_existing_dataset(session, slug)
    dataset = _require_dataset(session, slug)
    return _approve_pending(session, dataset.id, DatasetRow.change_kind == change_kind)


def reject_row(session: Session, slug: str, row_id: int, reason: str) -> ListedRow:
    _lock_existing_dataset(session, slug)
    dataset = _require_dataset(session, slug)
    row = session.scalars(
        select(DatasetRow).where(DatasetRow.id == row_id, DatasetRow.dataset_id == dataset.id)
    ).one_or_none()
    if row is None:
        raise ImportServiceError(ImportErrorCode.ROW_NOT_FOUND)

    result = session.execute(
        update(DatasetRow)
        .where(DatasetRow.id == row_id, DatasetRow.status == RowStatus.PENDING)
        .values(status=RowStatus.REJECTED, reject_reason=reason, reviewed_at=func.utc_timestamp())
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        session.rollback()
        raise ImportServiceError(ImportErrorCode.ROW_NOT_PENDING)
    session.commit()
    session.refresh(row)
    # 제외 탭 응답은 이전 줄 · 공개 제외 표시가 필요 없어 비워 둔다(화면은 제외 뒤 목록을 다시 읽는다).
    return _to_listed_row(row, None, excluded=False)


# --- 공개 제외 ---


def add_exclusion(session: Session, slug: str, row_key: str) -> None:
    """구분 칸을 공개 제외한다. 승인 줄이 있는 구분 칸만 받는다. 이미 제외 중이면 그대로 둔다."""
    _lock_existing_dataset(session, slug)
    dataset = _require_dataset(session, slug)
    approved_exists = session.scalar(
        select(func.count(DatasetRow.id)).where(
            DatasetRow.dataset_id == dataset.id,
            DatasetRow.row_key == row_key,
            DatasetRow.status == RowStatus.APPROVED,
        )
    )
    if not approved_exists:
        raise ImportServiceError(ImportErrorCode.ROW_NOT_FOUND)
    if _find_exclusion(session, dataset.id, row_key) is not None:
        return
    session.add(DatasetKeyExclusion(dataset_id=dataset.id, row_key=row_key))
    try:
        session.commit()
    except IntegrityError:
        # 조회와 저장 사이에 같은 구분 칸이 먼저 제외된 경우. 결과(제외 중)는 같다.
        session.rollback()


def remove_exclusion(session: Session, slug: str, row_key: str) -> None:
    """공개 제외를 풀어(복원) 다음 기록본 후보로 되돌린다."""
    _lock_existing_dataset(session, slug)
    dataset = _require_dataset(session, slug)
    exclusion = _find_exclusion(session, dataset.id, row_key)
    if exclusion is None:
        raise ImportServiceError(ImportErrorCode.EXCLUSION_NOT_FOUND)
    session.delete(exclusion)
    session.commit()


# --- 기록본 ---


def preview_next_version(session: Session, slug: str) -> NextVersionPreview:
    """지금 기록본을 만들면 생길 구성을 계산한다(저장하지 않음). 줄이 없거나 변화가 없어도 오류가 아니라 값으로 알린다."""
    dataset = _require_dataset(session, slug)
    plan = _plan_version(session, dataset.id)
    candidate_ids = set(plan.candidates.values())
    carried = len(candidate_ids & plan.latest_rows.keys())
    # 최신 기록본이 옛 구조를 따르면 그 줄은 모두 "빠지는 줄"(옛 구조 입력의 승인 줄)에 들므로 대체로 세지 않는다.
    replaced = 0
    if plan.latest_same_schema:
        replaced = sum(
            1
            for row_id, row_key in plan.latest_rows.items()
            if row_id not in candidate_ids and row_key is not None and row_key in plan.candidates
        )
    excluded = 0
    if plan.schema is not None:
        excluded = session.scalar(
            select(func.count(DatasetRow.id))
            .join(DataImport, DataImport.id == DatasetRow.import_id)
            .where(
                DatasetRow.dataset_id == dataset.id,
                DatasetRow.status == RowStatus.APPROVED,
                DataImport.schema_id != plan.schema.id,
            )
        ) or 0
    return NextVersionPreview(
        next_version_no=plan.next_version_no,
        row_count=len(candidate_ids),
        carried=carried,
        added=len(candidate_ids) - carried,
        replaced=replaced,
        excluded=excluded,
        removed=len(plan.latest_rows) - carried - replaced,
        unchanged=plan.unchanged,
    )


def list_versions(session: Session, slug: str) -> list[VersionSummary]:
    """최근 순. 줄 수 · 구조 번호는 집계 1회로 함께 읽는다(기록본마다 조회하지 않음)."""
    dataset = _require_dataset(session, slug)
    row_count = func.count(DatasetVersionRow.row_id)
    statement = (
        select(
            DatasetVersion.version_no,
            DatasetSchema.version,
            row_count,
            DatasetVersion.note,
            DatasetVersion.created_at,
            DatasetVersion.publish_status,
            DatasetVersion.published_at,
            DatasetVersion.publish_error,
        )
        .join(DatasetSchema, DatasetSchema.id == DatasetVersion.schema_id)
        .outerjoin(DatasetVersionRow, DatasetVersionRow.version_id == DatasetVersion.id)
        .where(DatasetVersion.dataset_id == dataset.id)
        .group_by(
            DatasetVersion.id,
            DatasetVersion.version_no,
            DatasetSchema.version,
            DatasetVersion.note,
            DatasetVersion.created_at,
            DatasetVersion.publish_status,
            DatasetVersion.published_at,
            DatasetVersion.publish_error,
        )
        .order_by(DatasetVersion.version_no.desc())
    )
    return [
        VersionSummary(
            version_no=version_no,
            schema_version=schema_version,
            row_count=count,
            note=note,
            created_at=created_at,
            publish_status=publish_status,
            path=public_path(dataset.slug, version_no),
            published_at=published_at,
            publish_error=publish_error,
        )
        for (
            version_no,
            schema_version,
            count,
            note,
            created_at,
            publish_status,
            published_at,
            publish_error,
        ) in session.execute(statement)
    ]


# --- 내부 ---


def lock_dataset(session: Session, slug: str) -> int | None:
    """묶음 줄을 잠가(SELECT datasets.id … FOR UPDATE) 같은 묶음의 줄 상태를 바꾸는 요청끼리 줄 세운다. 없으면 None.

    트랜잭션의 첫 조회여야 한다. InnoDB 의 일관된 읽기 시점은 첫 일반 조회에서 정해지므로, 잠근 뒤에 읽어야 앞선
    요청이 커밋한 상태를 본다. 붙여넣기 저장(paste._lock_target)과 승인 · 제외 · 공개 제외 · 발행이 함께 쓴다.
    """
    return session.scalar(select(Dataset.id).where(Dataset.slug == slug).with_for_update())


def _lock_existing_dataset(session: Session, slug: str) -> None:
    # 잠금 조회가 묶음 존재 확인을 겸한다. slug 정확히 일치 확인은 뒤의 _require_dataset 이 한다(collation 차이).
    if lock_dataset(session, slug) is None:
        raise ImportServiceError(ImportErrorCode.DATASET_NOT_FOUND)


def _require_dataset(session: Session, slug: str) -> Dataset:
    # 묶음 조회 규칙(slug 정확히 일치)은 admin_datasets 와 같은 함수를 쓴다.
    dataset = dataset_service._find_dataset(session, slug)
    if dataset is None:
        raise ImportServiceError(ImportErrorCode.DATASET_NOT_FOUND)
    return dataset


def _find_exclusion(session: Session, dataset_id: int, row_key: str) -> DatasetKeyExclusion | None:
    return session.get(DatasetKeyExclusion, (dataset_id, row_key))


def _approve_pending(session: Session, dataset_id: int, scope: ColumnElement[bool]) -> int:
    """scope 안의 대기 줄 중 승인 가능한 줄을 승인하고, 같은 트랜잭션에서 같은 구분 칸의 기존 승인 줄을 대체됨으로 바꾼다.

    구분 칸마다 승인 줄이 1개를 넘지 않게 하는 불변식(D-28)의 한쪽이다. 승인한 줄 수를 돌려준다.
    최신 구조로 들어온 입력의 줄만 승인한다. 옛 구조 입력 줄은 승인해도 기록본 후보에 들지 않아 승인이 조용히
    사라지므로, 승인 가능하지 않은 줄처럼 건너뛴다(오류 아님).
    """
    latest = dataset_service._latest_schema(session, dataset_id)
    if latest is None:
        session.commit()
        return 0
    latest_imports = select(DataImport.id).where(
        DataImport.dataset_id == dataset_id, DataImport.schema_id == latest.id
    )
    pending = session.execute(
        select(DatasetRow.id, DatasetRow.errors, DatasetRow.status).where(
            DatasetRow.dataset_id == dataset_id,
            scope,
            DatasetRow.status == RowStatus.PENDING,
            DatasetRow.import_id.in_(latest_imports),
        )
    ).all()
    approvable_ids = [row_id for row_id, errors, row_status in pending if is_approvable(errors, row_status)]
    if not approvable_ids:
        session.commit()
        return 0

    # 조회와 갱신 사이에 다른 요청이 제외 · 승인 · 대체한 줄은 status 조건에 걸러져 바뀌지 않는다.
    result = session.execute(
        update(DatasetRow)
        .where(DatasetRow.id.in_(approvable_ids), DatasetRow.status == RowStatus.PENDING)
        .values(status=RowStatus.APPROVED, reviewed_at=func.utc_timestamp())
        .execution_options(synchronize_session=False)
    )
    # 이번에 승인한 줄이 그 구분 칸의 승인 줄로 남는다(같은 칸을 둘 이상 승인했으면 id 가 큰 줄).
    kept_by_key: dict[str, int] = {}
    for row_id, row_key in session.execute(
        select(DatasetRow.id, DatasetRow.row_key).where(
            DatasetRow.id.in_(approvable_ids), DatasetRow.status == RowStatus.APPROVED
        )
    ):
        if row_key is not None:
            kept_by_key[row_key] = max(kept_by_key.get(row_key, 0), row_id)
    if kept_by_key:
        session.execute(
            update(DatasetRow)
            .where(
                DatasetRow.dataset_id == dataset_id,
                DatasetRow.status == RowStatus.APPROVED,
                DatasetRow.row_key.in_(list(kept_by_key)),
                DatasetRow.id.not_in(list(kept_by_key.values())),
            )
            .values(status=RowStatus.SUPERSEDED)
            .execution_options(synchronize_session=False)
        )
    session.commit()
    return result.rowcount


def _count_where(condition: ColumnElement[bool]) -> ColumnElement[int]:
    # 줄이 하나도 없는 묶음(outer join 결과 NULL)도 0 으로 돌려준다.
    return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)


def _overview_statement(dataset_id: int | None) -> Select[Any]:
    """묶음과 탭별 줄 수 · 공개 제외 구분 칸 수 · 최신 기록본 번호를 한 번에 읽는 조회. dataset_id 가 있으면 그 묶음만.

    표마다 묶음 단위로 먼저 집계한 하위 조회를 outer join 한다(한 번에 join 하면 행 수가 곱해져 집계가 부푼다).
    """
    pending = DatasetRow.status == RowStatus.PENDING
    has_errors = DatasetRow.errors.is_not(None)
    carried = DatasetRow.change_kind == ChangeKind.CARRIED
    clean_pending = pending & DatasetRow.errors.is_(None)
    row_counts = select(
        DatasetRow.dataset_id,
        _count_where(pending).label("pending"),
        _count_where(pending & has_errors).label("pending_error"),
        _count_where(pending & has_errors & carried).label("pending_carry_failed"),
        _count_where(clean_pending & (DatasetRow.change_kind == ChangeKind.NEW)).label("pending_new"),
        _count_where(
            clean_pending
            & or_(
                DatasetRow.change_kind.is_(None),
                DatasetRow.change_kind.not_in([ChangeKind.NEW, ChangeKind.AS_OF_ONLY]),
            )
        ).label("pending_changed"),
        _count_where(clean_pending & (DatasetRow.change_kind == ChangeKind.AS_OF_ONLY)).label("pending_as_of_only"),
        _count_where(DatasetRow.status == RowStatus.APPROVED).label("approved"),
        _count_where(DatasetRow.status == RowStatus.REJECTED).label("rejected"),
        _count_where(DatasetRow.status == RowStatus.SUPERSEDED).label("superseded"),
    )
    exclusions = select(
        DatasetKeyExclusion.dataset_id, func.count(DatasetKeyExclusion.row_key).label("excluded_keys")
    )
    versions = select(
        DatasetVersion.dataset_id,
        func.max(DatasetVersion.version_no).label("latest_version_no"),
        func.max(
            case((DatasetVersion.publish_status == PublishStatus.DONE, DatasetVersion.version_no), else_=None)
        ).label("latest_published_version_no"),
    )
    if dataset_id is not None:
        row_counts = row_counts.where(DatasetRow.dataset_id == dataset_id)
        exclusions = exclusions.where(DatasetKeyExclusion.dataset_id == dataset_id)
        versions = versions.where(DatasetVersion.dataset_id == dataset_id)
    rows = row_counts.group_by(DatasetRow.dataset_id).subquery()
    excluded = exclusions.group_by(DatasetKeyExclusion.dataset_id).subquery()
    latest = versions.group_by(DatasetVersion.dataset_id).subquery()
    count_columns = [
        func.coalesce(rows.c[name], 0).label(name)
        for name in (
            "pending",
            "pending_error",
            "pending_carry_failed",
            "pending_new",
            "pending_changed",
            "pending_as_of_only",
            "approved",
            "rejected",
            "superseded",
        )
    ]
    statement = (
        select(
            Dataset,
            *count_columns,
            func.coalesce(excluded.c.excluded_keys, 0).label("excluded_keys"),
            latest.c.latest_version_no,
            latest.c.latest_published_version_no,
        )
        .outerjoin(rows, rows.c.dataset_id == Dataset.id)
        .outerjoin(excluded, excluded.c.dataset_id == Dataset.id)
        .outerjoin(latest, latest.c.dataset_id == Dataset.id)
    )
    return statement if dataset_id is None else statement.where(Dataset.id == dataset_id)


def _to_overview(session: Session, row: Any, schema: SchemaVersion | None) -> DatasetOverview:
    """row 는 _overview_statement 결과 1행이다. SUM 결과는 드라이버가 Decimal 로 줄 수 있어 int 로 맞춘다."""
    dataset: Dataset = row.Dataset
    plan = _plan_version(session, dataset.id)
    counts = RowCounts(
        pending=int(row.pending),
        pending_error=int(row.pending_error),
        pending_carry_failed=int(row.pending_carry_failed),
        pending_new=int(row.pending_new),
        pending_changed=int(row.pending_changed),
        pending_as_of_only=int(row.pending_as_of_only),
        approved=int(row.approved),
        rejected=int(row.rejected),
        superseded=int(row.superseded),
        excluded_keys=int(row.excluded_keys),
    )
    return DatasetOverview(
        slug=dataset.slug,
        title=dataset.title,
        created_at=dataset.created_at,
        latest_version_no=row.latest_version_no,
        latest_published_version_no=row.latest_published_version_no,
        has_unpublished_changes=bool(plan.candidates) and not plan.unchanged,
        counts=counts,
        schema=schema,
    )


def _plan_version(session: Session, dataset_id: int) -> _VersionPlan:
    """기록본 구성 규칙의 단일 소스. 발행(publish.publish_dataset) · preview_next_version · 개요의 공개 안 된 변경 판정이 함께 쓴다."""
    schema = dataset_service._latest_schema(session, dataset_id)
    candidates = {} if schema is None else _version_candidates(session, dataset_id, schema.id)
    # 비교 기준은 마지막 공개본(done)이다. 폐기 · 실패 · 미완료 기록본은 공개된 적이 없어 기준이 되지 않는다(D-30).
    latest_version = session.scalars(
        select(DatasetVersion)
        .where(DatasetVersion.dataset_id == dataset_id, DatasetVersion.publish_status == PublishStatus.DONE)
        .order_by(DatasetVersion.version_no.desc())
        .limit(1)
    ).one_or_none()
    # 번호는 상태와 관계없이 쓴 적 있는 가장 큰 번호 다음이다(폐기한 번호도 소진, 다시 쓰지 않음).
    highest_version_no = session.scalar(
        select(func.max(DatasetVersion.version_no)).where(DatasetVersion.dataset_id == dataset_id)
    )
    latest_rows: dict[int, str | None] = {}
    if latest_version is not None:
        latest_rows = {
            row_id: row_key
            for row_id, row_key in session.execute(
                select(DatasetRow.id, DatasetRow.row_key)
                .join(DatasetVersionRow, DatasetVersionRow.row_id == DatasetRow.id)
                .where(DatasetVersionRow.version_id == latest_version.id)
            )
        }
    latest_same_schema = schema is not None and latest_version is not None and latest_version.schema_id == schema.id
    # 구조가 같고 줄 구성이 같으면 새 기록본을 만들지 않는다(구조만 바뀐 경우는 새 기록본).
    unchanged = latest_same_schema and bool(candidates) and set(latest_rows) == set(candidates.values())
    next_version_no = FIRST_VERSION_NO if highest_version_no is None else highest_version_no + 1
    return _VersionPlan(
        schema=schema,
        candidates=candidates,
        latest_rows=latest_rows,
        latest_same_schema=latest_same_schema,
        next_version_no=next_version_no,
        unchanged=unchanged,
    )


def _version_candidates(session: Session, dataset_id: int, schema_id: int) -> dict[str, int]:
    """최신 구조(schema_id)로 들어온 승인 줄 중 구분 칸마다 id 가 가장 큰 줄. 공개 제외 구분 칸은 뺀다. row_key → 줄 id."""
    excluded_keys = select(DatasetKeyExclusion.row_key).where(DatasetKeyExclusion.dataset_id == dataset_id)
    statement = (
        select(DatasetRow.row_key, func.max(DatasetRow.id))
        .join(DataImport, DataImport.id == DatasetRow.import_id)
        .where(
            DatasetRow.dataset_id == dataset_id,
            DatasetRow.status == RowStatus.APPROVED,
            DatasetRow.row_key.is_not(None),
            DataImport.schema_id == schema_id,
            DatasetRow.row_key.not_in(excluded_keys),
        )
        .group_by(DatasetRow.row_key)
    )
    return {row_key: row_id for row_key, row_id in session.execute(statement) if row_key is not None}


def _to_listed_row(row: DatasetRow, prev_row: DatasetRow | None, excluded: bool) -> ListedRow:
    prev = None
    if prev_row is not None:
        prev = PrevValues(
            data=prev_row.data,
            source_kind=prev_row.source_kind,
            source_url=prev_row.source_url,
            as_of_date=prev_row.as_of_date,
        )
    return ListedRow(
        id=row.id,
        import_id=row.import_id,
        row_key=row.row_key,
        data=row.data,
        source_kind=row.source_kind,
        source_url=row.source_url,
        as_of_date=row.as_of_date,
        status=row.status,
        errors=row.errors,
        reject_reason=row.reject_reason,
        reviewed_at=row.reviewed_at,
        change_kind=row.change_kind,
        prev=prev,
        excluded=excluded,
    )
