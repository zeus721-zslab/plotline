"""데이터 묶음 · 구조(필드 정의) 조회와 구조 버전 추가. 붙여넣기 저장(admin_imports)이 같은 규칙으로 쓴다.

묶음 생성 · 구조 직접 저장 API 는 D-28 에서 붙여넣기 저장으로 대체되어 없다. 여기 남은 함수는 commit 하지 않는다.
"""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data_core.models import Dataset, DatasetSchema

FIRST_SCHEMA_VERSION = 1


def add_schema_version(
    session: Session, dataset_id: int, latest: DatasetSchema | None, fields: list[dict[str, Any]]
) -> DatasetSchema:
    """검사를 마친 정의를 다음 버전으로 세션에 넣는다. commit 은 호출자가 한다(입력 저장과 한 트랜잭션으로 묶기 위해).

    flush 로 id 를 확정하므로 동시 저장 충돌은 여기서 IntegrityError 로 드러난다. 기존 버전은 고치지 않는다(줄 · 기록본이 옛 정의를 참조한다).
    """
    next_version = FIRST_SCHEMA_VERSION if latest is None else latest.version + 1
    schema = DatasetSchema(dataset_id=dataset_id, version=next_version, fields=fields)
    session.add(schema)
    session.flush()
    return schema


def _find_dataset(session: Session, slug: str) -> Dataset | None:
    dataset = session.scalars(select(Dataset).where(Dataset.slug == slug)).one_or_none()
    # slug 컬럼 collation(utf8mb4_unicode_ci)은 대소문자·끝 공백을 무시하므로, 주소의 slug 와 정확히 같을 때만 같은 데이터셋으로 본다.
    if dataset is None or dataset.slug != slug:
        return None
    return dataset


def _latest_schema(session: Session, dataset_id: int) -> DatasetSchema | None:
    statement = (
        select(DatasetSchema)
        .where(DatasetSchema.dataset_id == dataset_id)
        .order_by(DatasetSchema.version.desc())
        .limit(1)
    )
    return session.scalars(statement).one_or_none()
