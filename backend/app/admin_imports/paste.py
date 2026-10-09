"""붙여넣기 확인(미리보기)과 저장(D-28). 함수 1개 = 유스케이스 1개, 저장은 commit 1회.

미리보기와 저장은 같은 계획 함수(_plan_import)의 결과를 쓴다. 대상 · 구조 변화 · 구조 이월 · 줄 분류 규칙은
_plan_import 한 곳에만 있고, 저장(_apply_plan)은 그 결과를 DB 에 옮기기만 한다.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.admin_datasets import service as dataset_service
from app.admin_imports.errors import ImportErrorCode, ImportServiceError
from app.admin_imports.service import lock_dataset
from app.data_core.bundle import Bundle, BundleError, parse_bundle
from app.data_core.enums import ChangeKind, ImportSourceType, RowStatus
from app.data_core.field_definition import FieldDefinitionError, FieldSpec, parse_field_definitions
from app.data_core.models import DataImport, Dataset, DatasetRow, DatasetSchema
from app.data_core.row_change import RowChange, classify_row
from app.data_core.row_validation import RowInput, RowResult, validate_rows, validate_rows_by_source

# 저장하는 분류 → 줄에 남기는 change_kind. 변화 없음(UNCHANGED)은 저장하지 않으므로 없다.
STORED_CHANGE_KINDS: dict[RowChange, ChangeKind] = {
    RowChange.NEW: ChangeKind.NEW,
    RowChange.CHANGED: ChangeKind.CHANGED,
    RowChange.AS_OF_ONLY: ChangeKind.AS_OF_ONLY,
}
# 이전 줄(prev_row_id)을 남기는 분류. 새 줄은 비교 상대가 없다.
CHANGE_KINDS_WITH_PREV = frozenset({ChangeKind.CHANGED, ChangeKind.AS_OF_ONLY})
FIELD_NAME_KEY = "name"


@dataclass(frozen=True)
class TargetPreview:
    slug: str
    # 저장 뒤의 제목. 기존 묶음이면 기존 제목(묶음 제목으로 바꾸지 않는다).
    title: str
    is_new: bool
    # 묶음 머리의 제목이 기존 제목과 다름(기존 제목 유지)
    title_differs: bool
    bundle_title: str | None


@dataclass(frozen=True)
class SchemaPreview:
    changed: bool
    # 지금 구조 번호(없으면 None)
    current_version: int | None
    added: list[str]
    removed: list[str]
    modified: list[str]
    # 구조 이월: 기존 승인 줄 중 새 구조 검사를 통과해 승인으로 이어지는 수 · 오류로 대기가 되는 수
    carry_approved: int
    carry_pending: int
    # 다시 이월: 승인 줄이 없는 구분 칸의 이월 실패 대기 줄을 새 구조로 다시 검사한 결과(승인 · 오류로 대기)
    carry_retry_approved: int
    carry_retry_pending: int
    # 구조가 바뀌면 옛 구조로 들어온 대기 줄(오류 줄 포함)은 모두 대체됨이 된다. 다시 이월하는 원본은 빼고 센다.
    # 구조 변화가 없으면 0.
    old_pending_superseded: int


@dataclass(frozen=True)
class RowSummary:
    new: int
    changed: int
    as_of_only: int
    unchanged: int
    error: int

    @property
    def total(self) -> int:
        return self.new + self.changed + self.as_of_only + self.unchanged + self.error


@dataclass(frozen=True)
class ImportPreview:
    target: TargetPreview
    schema: SchemaPreview
    rows: RowSummary


@dataclass(frozen=True)
class ImportSaveResult:
    # False: 저장할 줄이 없고 구조 변화도 없어 아무것도 저장하지 않음(입력 기록도 만들지 않음)
    saved: bool
    slug: str
    rows: RowSummary
    carry_approved: int
    carry_pending: int
    carry_retry_approved: int
    carry_retry_pending: int
    old_pending_superseded: int


# eq=False: 저장 단계에서 계획 객체 → 새 줄 모델을 객체 자신으로 찾는다(RowResult 는 해시할 수 없음).
@dataclass(frozen=True, eq=False)
class _CarryRow:
    original: DatasetRow
    result: RowResult
    # True: 원본이 이월 실패 대기 줄(다시 이월). False: 원본이 승인 줄.
    retry: bool

    @property
    def passed(self) -> bool:
        return not self.result.errors


@dataclass(frozen=True)
class _PastedRow:
    result: RowResult
    # None: 구분 칸이 없는 오류 줄(비교할 수 없음)
    change: RowChange | None
    compare_to: DatasetRow | _CarryRow | None

    @property
    def has_errors(self) -> bool:
        return bool(self.result.errors)

    @property
    def saved(self) -> bool:
        # 오류 줄은 분류와 관계없이 저장해 운영자가 보게 한다.
        return self.has_errors or self.change is not RowChange.UNCHANGED

    @property
    def change_kind(self) -> ChangeKind | None:
        return None if self.change is None else STORED_CHANGE_KINDS.get(self.change)


@dataclass(frozen=True)
class _ImportPlan:
    # None: 새 묶음(저장할 때 만든다)
    dataset: Dataset | None
    target: TargetPreview
    latest_schema: DatasetSchema | None
    # 구조 변화가 있으면 새 구조로 저장할 fields, 없으면 None
    new_fields: list[dict[str, Any]] | None
    schema_preview: SchemaPreview
    carry: list[_CarryRow]
    rows: list[_PastedRow]
    summary: RowSummary


def preview_import(
    session: Session,
    slug: str | None,
    payload: str,
    source_type: ImportSourceType,
    default_source_url: str | None,
) -> ImportPreview:
    """붙여넣은 묶음을 저장했을 때의 대상 · 구조 변화 · 줄 분류를 계산한다(DB 를 바꾸지 않음)."""
    plan = _plan_import(session, slug, _parse(payload), source_type, default_source_url)
    return ImportPreview(target=plan.target, schema=plan.schema_preview, rows=plan.summary)


def save_import(
    session: Session,
    slug: str | None,
    payload: str,
    source_type: ImportSourceType,
    default_source_url: str | None,
    create_dataset: bool,
    confirm_schema: bool,
) -> ImportSaveResult:
    """미리보기와 같은 계획을 한 트랜잭션으로 저장한다. 중간에 실패하면 새 묶음 · 새 구조까지 모두 되돌린다.

    create_dataset 은 "미리보기에서 새 묶음으로 확인함"이다. 그 사이 같은 주소 이름의 묶음이 생겼으면 확인한 내용과
    다르므로 저장하지 않는다(기존 묶음에 확인하지 않은 구조 변경 · 이월이 적용되지 않게).
    """
    bundle = _parse(payload)
    _lock_target(session, slug, bundle)
    plan = _plan_import(session, slug, bundle, source_type, default_source_url)
    if plan.dataset is None and not create_dataset:
        raise ImportServiceError(ImportErrorCode.DATASET_CONFIRMATION_REQUIRED)
    if plan.dataset is not None and create_dataset:
        raise ImportServiceError(ImportErrorCode.CONCURRENT_CHANGE)
    if plan.new_fields is not None and not confirm_schema:
        raise ImportServiceError(
            ImportErrorCode.SCHEMA_CONFIRMATION_REQUIRED, current_version=plan.schema_preview.current_version
        )

    saved = plan.new_fields is not None or any(row.saved for row in plan.rows)
    if saved:
        try:
            _apply_plan(session, plan, payload, source_type, default_source_url)
            session.commit()
        except Exception:
            # 새 묶음 · 새 구조 · 이월 줄이 이미 flush 되어 있을 수 있다. 일부만 남지 않게 모두 되돌린다.
            session.rollback()
            raise
    return ImportSaveResult(
        saved=saved,
        slug=plan.target.slug,
        rows=plan.summary,
        carry_approved=plan.schema_preview.carry_approved,
        carry_pending=plan.schema_preview.carry_pending,
        carry_retry_approved=plan.schema_preview.carry_retry_approved,
        carry_retry_pending=plan.schema_preview.carry_retry_pending,
        old_pending_superseded=plan.schema_preview.old_pending_superseded,
    )


# --- 계획(DB 를 바꾸지 않음) ---


def _lock_target(session: Session, slug: str | None, bundle: Bundle) -> None:
    """저장 대상 묶음 줄을 잠가(service.lock_dataset) 같은 묶음의 저장 · 승인 · 제외끼리 줄 세운다.

    트랜잭션의 첫 조회여야 한다(잠근 뒤에 계획을 읽어야 앞선 요청이 커밋한 상태를 본다). 새 묶음이면 잠글 줄이 없고,
    만들 때의 유니크 제약이 겹침을 막는다.
    """
    target = slug if slug is not None else (None if bundle.dataset is None else bundle.dataset.slug)
    if target is None:
        return
    lock_dataset(session, target)


def _parse(payload: str) -> Bundle:
    try:
        return parse_bundle(payload)
    except BundleError as error:
        raise ImportServiceError(ImportErrorCode.INVALID_BUNDLE, problems=error.problems) from error


def _plan_import(
    session: Session,
    slug: str | None,
    bundle: Bundle,
    source_type: ImportSourceType,
    default_source_url: str | None,
) -> _ImportPlan:
    """대상 · 구조 · 구조 이월 · 줄 분류를 모두 계산한다. 미리보기와 저장이 함께 쓰는 규칙의 단일 소스."""
    dataset, target = _resolve_target(session, slug, bundle)
    latest = None if dataset is None else dataset_service._latest_schema(session, dataset.id)
    specs, new_fields = _resolve_fields(latest, bundle)
    schema_changed = new_fields is not None

    approved = [] if dataset is None else _approved_rows(session, dataset.id)
    carry = _plan_carry(session, dataset.id, specs, approved) if schema_changed and dataset is not None else []
    targets = _compare_targets(approved, carry, schema_changed)
    results = validate_rows(specs, bundle.rows, source_type, default_source_url)
    rows = [_plan_row(result, targets, schema_changed) for result in results]

    old_fields = [] if latest is None else latest.fields
    added, removed, modified = _schema_diff(old_fields, new_fields) if new_fields is not None else ([], [], [])
    first_carry = [carried for carried in carry if not carried.retry]
    retry_carry = [carried for carried in carry if carried.retry]
    carry_approved = sum(1 for carried in first_carry if carried.passed)
    carry_retry_approved = sum(1 for carried in retry_carry if carried.passed)
    old_pending = _count_pending(session, dataset.id) if schema_changed and dataset is not None else 0
    schema_preview = SchemaPreview(
        changed=schema_changed,
        current_version=None if latest is None else latest.version,
        added=added,
        removed=removed,
        modified=modified,
        carry_approved=carry_approved,
        carry_pending=len(first_carry) - carry_approved,
        carry_retry_approved=carry_retry_approved,
        carry_retry_pending=len(retry_carry) - carry_retry_approved,
        # 다시 이월하는 원본도 지금 대기 줄이지만, 이월 저장(_insert_carried)이 따로 대체하므로 여기서는 뺀다.
        old_pending_superseded=old_pending - len(retry_carry),
    )
    return _ImportPlan(
        dataset=dataset,
        target=target,
        latest_schema=latest,
        new_fields=new_fields,
        schema_preview=schema_preview,
        carry=carry,
        rows=rows,
        summary=_summarize(rows),
    )


def _resolve_target(session: Session, slug: str | None, bundle: Bundle) -> tuple[Dataset | None, TargetPreview]:
    """slug 없음(목록): 묶음 머리로 대상을 정하고 없으면 새 묶음. slug 있음(작업 페이지): 대상 고정."""
    bundle_title = None if bundle.dataset is None else bundle.dataset.title
    if slug is None:
        if bundle.dataset is None:
            raise ImportServiceError(ImportErrorCode.DATASET_REQUIRED)
        dataset = dataset_service._find_dataset(session, bundle.dataset.slug)
        if dataset is None:
            return None, TargetPreview(
                slug=bundle.dataset.slug,
                title=bundle.dataset.title,
                is_new=True,
                title_differs=False,
                bundle_title=bundle_title,
            )
    else:
        dataset = dataset_service._find_dataset(session, slug)
        if dataset is None:
            raise ImportServiceError(ImportErrorCode.DATASET_NOT_FOUND)
        if bundle.dataset is not None and bundle.dataset.slug != slug:
            raise ImportServiceError(ImportErrorCode.DATASET_MISMATCH)
    return dataset, TargetPreview(
        slug=dataset.slug,
        title=dataset.title,
        is_new=False,
        title_differs=bundle_title is not None and bundle_title != dataset.title,
        bundle_title=bundle_title,
    )


def _resolve_fields(
    latest: DatasetSchema | None, bundle: Bundle
) -> tuple[list[FieldSpec], list[dict[str, Any]] | None]:
    """검사에 쓸 구조와, 구조 변화가 있으면 새로 저장할 fields 를 정한다. 같은지는 원문 비교로 본다(D-27)."""
    if not bundle.fields_given or (latest is not None and latest.fields == bundle.fields):
        if latest is None:
            raise ImportServiceError(ImportErrorCode.SCHEMA_MISSING)
        return parse_field_definitions(latest.fields), None
    try:
        specs = parse_field_definitions(bundle.fields)
    except FieldDefinitionError as error:
        raise ImportServiceError(ImportErrorCode.INVALID_FIELDS, problems=error.problems) from error
    # parse_field_definitions 가 통과했으면 fields 는 객체 배열이다(타입 좁히기용 확인).
    assert isinstance(bundle.fields, list)
    return specs, bundle.fields


def _schema_diff(
    old_fields: Sequence[dict[str, Any]], new_fields: Sequence[dict[str, Any]]
) -> tuple[list[str], list[str], list[str]]:
    """필드 이름 기준 (추가, 삭제, 속성 변경). 순서는 각 구조 안의 순서."""
    old_by_name = {str(field.get(FIELD_NAME_KEY)): field for field in old_fields}
    new_by_name = {str(field.get(FIELD_NAME_KEY)): field for field in new_fields}
    added = [name for name in new_by_name if name not in old_by_name]
    removed = [name for name in old_by_name if name not in new_by_name]
    modified = [name for name, field in new_by_name.items() if name in old_by_name and old_by_name[name] != field]
    return added, removed, modified


def _approved_rows(session: Session, dataset_id: int) -> list[DatasetRow]:
    """지금 승인 상태인 줄. id 순(같은 구분 칸이면 뒤가 최신)."""
    statement = (
        select(DatasetRow)
        .where(DatasetRow.dataset_id == dataset_id, DatasetRow.status == RowStatus.APPROVED)
        .order_by(DatasetRow.id)
    )
    return list(session.scalars(statement))


def _newest_approved_by_key(approved: list[DatasetRow]) -> list[DatasetRow]:
    """이월 입력 (a): 구분 칸마다 id 가 가장 큰 승인 줄.

    승인 줄은 오류가 없어 구분 칸이 항상 있다는 전제다. 어긋난 줄이 있어도 저장 전체를 막지 않도록 assert 대신
    건너뛴다(그 줄은 옛 구조 입력의 승인 줄로 남아 기록본 후보에 들지 않는다).
    """
    newest_by_key: dict[str, DatasetRow] = {}
    for row in approved:
        if row.row_key is not None:
            newest_by_key[row.row_key] = row
    return list(newest_by_key.values())


def _carry_failed_pending_rows(session: Session, dataset_id: int, approved_keys: set[str]) -> list[DatasetRow]:
    """이월 입력 (b): 승인 줄이 없는 구분 칸의 이월 실패 대기 줄(change_kind=carried). 구분 칸마다 id 가 가장 큰 1줄."""
    statement = (
        select(DatasetRow)
        .where(
            DatasetRow.dataset_id == dataset_id,
            DatasetRow.status == RowStatus.PENDING,
            DatasetRow.change_kind == ChangeKind.CARRIED,
            DatasetRow.row_key.is_not(None),
        )
        .order_by(DatasetRow.id)
    )
    newest_by_key: dict[str, DatasetRow] = {}
    for row in session.scalars(statement):
        if row.row_key is not None and row.row_key not in approved_keys:
            newest_by_key[row.row_key] = row
    return list(newest_by_key.values())


def _origin_source_types(session: Session, dataset_id: int, row_ids: list[int]) -> dict[int, ImportSourceType]:
    """이월 원본 줄 id(row_ids) → 재검사에 쓸 입력 경로. 이월 줄(carried)은 prev_row_id 를 따라가 이월이 아닌 첫 줄의 입력 경로를 쓴다.

    이월 줄의 입력은 이월을 일으킨 붙여넣기의 경로라, 그대로 쓰면 다음 이월에서 출처 규칙이 원래 경로와 달라진다.
    묶음 줄의 연결을 한 번에 읽어 Python 에서 따라간다(줄마다 조회하지 않음). 사슬이 끊기면(대상 줄 없음) 그 줄 자신의
    입력 경로를 쓴다.
    """
    statement = (
        select(DatasetRow.id, DatasetRow.prev_row_id, DatasetRow.change_kind, DataImport.source_type)
        .join(DataImport, DataImport.id == DatasetRow.import_id)
        .where(DatasetRow.dataset_id == dataset_id)
    )
    links = {row_id: (prev_id, kind, source) for row_id, prev_id, kind, source in session.execute(statement)}
    return {row_id: _follow_carried(row_id, links) for row_id in row_ids}


def _follow_carried(
    row_id: int, links: dict[int, tuple[int | None, ChangeKind | None, ImportSourceType]]
) -> ImportSourceType:
    current = row_id
    visited: set[int] = set()
    while True:
        prev_id, kind, source = links[current]
        if kind is not ChangeKind.CARRIED:
            return source
        # prev_row_id 는 먼저 넣은 줄만 가리켜 순환이 없지만, 어긋난 데이터에서 멈추지 않게 방문 기록으로 끊는다.
        if prev_id is None or prev_id not in links or prev_id in visited:
            return links[row_id][2]
        visited.add(current)
        current = prev_id


def _count_pending(session: Session, dataset_id: int) -> int:
    """지금 대기 줄 수. 구조가 바뀌는 저장 전에는 모든 입력이 새 구조 이전 구조로 들어온 입력이므로 모두 옛 구조 대기 줄이다."""
    statement = select(func.count(DatasetRow.id)).where(
        DatasetRow.dataset_id == dataset_id, DatasetRow.status == RowStatus.PENDING
    )
    return session.scalar(statement) or 0


def _plan_carry(
    session: Session, dataset_id: int, specs: list[FieldSpec], approved: list[DatasetRow]
) -> list[_CarryRow]:
    """구조 이월: (a) 구분 칸마다 최신 승인 줄 + (b) 승인 줄이 없는 구분 칸의 이월 실패 대기 줄을 새 구조로 다시 검사한다.

    (a) 와 (b) 는 구분 칸이 겹치지 않는다. 삭제된 필드 값은 버리고 출처 3칸은 그대로 넘기며, 출처 규칙은 줄의 최초
    입력 경로로 적용한다.
    """
    first = _newest_approved_by_key(approved)
    retry = _carry_failed_pending_rows(session, dataset_id, {row.row_key for row in first if row.row_key is not None})
    originals = [*first, *retry]
    if not originals:
        return []
    origins = _origin_source_types(session, dataset_id, [row.id for row in originals])
    names = {spec.name for spec in specs}
    inputs = [
        (
            RowInput(
                values={name: value for name, value in row.data.items() if name in names},
                source_kind=None if row.source_kind is None else row.source_kind.value,
                source_url=row.source_url,
                as_of_date=None if row.as_of_date is None else row.as_of_date.isoformat(),
            ),
            origins[row.id],
        )
        for row in originals
    ]
    results = validate_rows_by_source(specs, inputs)
    retry_ids = {row.id for row in retry}
    return [
        _CarryRow(original=row, result=result, retry=row.id in retry_ids)
        for row, result in zip(originals, results, strict=True)
    ]


def _compare_targets(
    approved: list[DatasetRow], carry: list[_CarryRow], schema_changed: bool
) -> dict[str, DatasetRow | _CarryRow]:
    """구분 칸 → 비교 상대. 구조 이월이 있으면 이월 결과 줄(새 구조 기준), 없으면 현재 승인 줄. 같은 칸이 여럿이면 뒤(최신)."""
    if schema_changed:
        return {carried.result.row_key: carried for carried in carry if carried.result.row_key is not None}
    return {row.row_key: row for row in approved if row.row_key is not None}


def _plan_row(result: RowResult, targets: dict[str, DatasetRow | _CarryRow], schema_changed: bool) -> _PastedRow:
    if result.row_key is None:
        return _PastedRow(result=result, change=None, compare_to=None)
    compare_to = targets.get(result.row_key)
    current = compare_to.result if isinstance(compare_to, _CarryRow) else compare_to
    change = classify_row(result, current, schema_changed)
    return _PastedRow(result=result, change=change, compare_to=compare_to)


def _summarize(rows: list[_PastedRow]) -> RowSummary:
    """오류 줄은 분류와 관계없이 error 에만 센다(합계가 붙여넣은 줄 수와 같게)."""
    error = sum(1 for row in rows if row.has_errors)
    clean = [row.change for row in rows if not row.has_errors]
    return RowSummary(
        new=clean.count(RowChange.NEW),
        changed=clean.count(RowChange.CHANGED),
        as_of_only=clean.count(RowChange.AS_OF_ONLY),
        unchanged=clean.count(RowChange.UNCHANGED),
        error=error,
    )


# --- 저장(계획을 DB 에 옮김, commit 은 호출자) ---


def _apply_plan(
    session: Session,
    plan: _ImportPlan,
    payload: str,
    source_type: ImportSourceType,
    default_source_url: str | None,
) -> None:
    dataset = plan.dataset if plan.dataset is not None else _add_dataset(session, plan.target)
    schema = plan.latest_schema
    if plan.new_fields is not None:
        try:
            schema = dataset_service.add_schema_version(session, dataset.id, plan.latest_schema, plan.new_fields)
        except IntegrityError as error:
            raise ImportServiceError(ImportErrorCode.SCHEMA_VERSION_CONFLICT) from error
    # 계획 단계에서 구조가 없으면 SCHEMA_MISSING 으로 끝났으므로 여기서는 항상 있다(타입 좁히기용 확인).
    assert schema is not None

    # 이월 줄도 이번 입력의 줄로 둔다(기록본 후보는 최신 구조로 들어온 입력의 승인 줄이다).
    data_import = DataImport(
        dataset_id=dataset.id,
        schema_id=schema.id,
        source_type=source_type,
        raw_payload=payload,
        default_source_url=default_source_url,
    )
    session.add(data_import)
    session.flush()

    if plan.new_fields is not None and plan.dataset is not None:
        retry_ids = [carried.original.id for carried in plan.carry if carried.retry]
        _supersede_old_schema_pending(
            session, dataset.id, schema.id, retry_ids, plan.schema_preview.old_pending_superseded
        )
    carried_models = _insert_carried(session, dataset.id, data_import.id, plan.carry)
    pasted_models = [
        _to_row_model(dataset.id, data_import.id, row.result, row.change_kind, _prev_row_id(row, carried_models))
        for row in plan.rows
        if row.saved
    ]
    session.add_all(pasted_models)
    session.flush()
    _supersede_older_pending(session, dataset.id, [*carried_models.values(), *pasted_models])


def _add_dataset(session: Session, target: TargetPreview) -> Dataset:
    dataset = Dataset(slug=target.slug, title=target.title)
    session.add(dataset)
    try:
        session.flush()
    except IntegrityError as error:
        # 확인과 저장 사이에 같은 slug 가 먼저 저장된 경우. datasets 의 유니크 제약은 slug 하나뿐이다.
        raise ImportServiceError(ImportErrorCode.DATASET_CONFLICT) from error
    return dataset


def _insert_carried(
    session: Session, dataset_id: int, import_id: int, carry: list[_CarryRow]
) -> dict[_CarryRow, DatasetRow]:
    """이월 줄을 넣고 원본(승인 줄 · 다시 이월한 대기 줄)을 대체됨으로 바꾼다. 통과 줄은 바로 승인, 실패 줄은 오류 대기."""
    models: dict[_CarryRow, DatasetRow] = {}
    for carried in carry:
        model = _to_row_model(dataset_id, import_id, carried.result, ChangeKind.CARRIED, carried.original.id)
        if carried.passed:
            model.status = RowStatus.APPROVED
            model.reviewed_at = func.utc_timestamp()
        models[carried] = model
    if not models:
        return models
    session.add_all(models.values())
    # 계획 뒤 다른 요청이 원본 상태를 바꿨으면(승인 줄 대체 · 대기 줄 승인/제외) 저장하지 않는다. 승인 원본이 이미
    # 대체됐는데 이월 줄을 승인으로 넣으면 같은 구분 칸에 승인 줄이 둘이 된다.
    _supersede_originals(session, [carried.original.id for carried in carry if not carried.retry], RowStatus.APPROVED)
    _supersede_originals(session, [carried.original.id for carried in carry if carried.retry], RowStatus.PENDING)
    session.flush()
    return models


def _supersede_originals(session: Session, row_ids: list[int], expected_status: RowStatus) -> None:
    if not row_ids:
        return
    result = session.execute(
        update(DatasetRow)
        .where(DatasetRow.id.in_(row_ids), DatasetRow.status == expected_status)
        .values(status=RowStatus.SUPERSEDED)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != len(row_ids):
        raise ImportServiceError(ImportErrorCode.CONCURRENT_CHANGE)


def _supersede_old_schema_pending(
    session: Session, dataset_id: int, schema_id: int, retry_ids: list[int], expected: int
) -> None:
    """새 구조(schema_id) 이전 구조로 들어온 입력의 대기 줄을 모두 대체됨으로 바꾼다. 구분 칸 유무와 관계없다.

    다시 이월하는 원본(retry_ids)은 빼고, 이월 저장(_insert_carried)이 따로 대체 · 수 확인한다.

    옛 구조 입력 줄은 승인해도 기록본 후보(최신 구조 입력의 승인 줄)에 들지 않으므로, 대기로 남기면 승인이 조용히
    사라진다. 이번 입력의 줄은 아직 넣기 전이고 입력의 schema_id 도 새 구조라 대상이 아니다.
    """
    old_imports = select(DataImport.id).where(DataImport.dataset_id == dataset_id, DataImport.schema_id != schema_id)
    result = session.execute(
        update(DatasetRow)
        .where(
            DatasetRow.dataset_id == dataset_id,
            DatasetRow.status == RowStatus.PENDING,
            DatasetRow.import_id.in_(old_imports),
            DatasetRow.id.not_in(retry_ids),
        )
        .values(status=RowStatus.SUPERSEDED)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != expected:
        # 저장 때 다시 세운 계획의 수와 다르다. 같은 묶음의 쓰기는 묶음 잠금으로 줄 서므로 방어 분기다. 미리보기와 저장
        # 사이의 변화는 이 비교로 막지 않는다(확인한 수를 저장 요청에 묶는 일은 백로그).
        raise ImportServiceError(ImportErrorCode.CONCURRENT_CHANGE)


def _prev_row_id(row: _PastedRow, carried_models: dict[_CarryRow, DatasetRow]) -> int | None:
    if row.change_kind not in CHANGE_KINDS_WITH_PREV or row.compare_to is None:
        return None
    if isinstance(row.compare_to, _CarryRow):
        return carried_models[row.compare_to].id
    return row.compare_to.id


def _supersede_older_pending(session: Session, dataset_id: int, saved: list[DatasetRow]) -> None:
    """이번에 저장한 줄과 같은 구분 칸의 더 오래된 대기 줄(오류 줄 · 이월 실패 줄 포함)을 대체됨으로 바꾼다.

    구분 칸마다 이번에 저장한 줄 중 id 가 가장 큰 줄만 남긴다. 승인 줄은 바꾸지 않는다(승인 때 바뀐다).
    """
    newest_by_key: dict[str, int] = {}
    for model in saved:
        if model.row_key is not None:
            newest_by_key[model.row_key] = max(newest_by_key.get(model.row_key, 0), model.id)
    if not newest_by_key:
        return
    session.execute(
        update(DatasetRow)
        .where(
            DatasetRow.dataset_id == dataset_id,
            DatasetRow.status == RowStatus.PENDING,
            DatasetRow.row_key.in_(list(newest_by_key)),
            DatasetRow.id.not_in(list(newest_by_key.values())),
        )
        .values(status=RowStatus.SUPERSEDED)
        .execution_options(synchronize_session=False)
    )


def _to_row_model(
    dataset_id: int, import_id: int, result: RowResult, change_kind: ChangeKind | None, prev_row_id: int | None
) -> DatasetRow:
    row = DatasetRow(
        dataset_id=dataset_id,
        import_id=import_id,
        row_key=result.row_key,
        data=result.data,
        source_kind=result.source_kind,
        source_url=result.source_url,
        as_of_date=result.as_of_date,
        status=RowStatus.PENDING,
        change_kind=change_kind,
        prev_row_id=prev_row_id,
    )
    # 오류가 없으면 errors 를 설정하지 않아 SQL NULL 로 둔다. None 을 넣으면 JSON 타입이 문자열 'null' 로 저장해
    # "오류 있는 줄" 집계(errors IS NOT NULL)에 잘못 잡힌다.
    if result.errors:
        row.errors = [error.to_dict() for error in result.errors]
    return row
