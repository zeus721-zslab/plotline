"""붙여넣은 줄을 같은 구분 칸의 현재 승인 줄과 비교해 분류한다(순수 함수, DB 접근 없음, D-28)."""

from collections.abc import Mapping
from datetime import date
from enum import StrEnum
from typing import Protocol

from app.data_core.enums import SourceKind


class RowChange(StrEnum):
    NEW = "new"
    CHANGED = "changed"
    AS_OF_ONLY = "as_of_only"
    # 값 · 출처가 모두 같아 저장하지 않는 줄
    UNCHANGED = "unchanged"


class RowValues(Protocol):
    """비교에 쓰는 칸. 검사 결과(RowResult)와 저장된 줄(DatasetRow) 모두 이 모양이다."""

    @property
    def data(self) -> Mapping[str, object]: ...

    @property
    def source_kind(self) -> SourceKind | None: ...

    @property
    def source_url(self) -> str | None: ...

    @property
    def as_of_date(self) -> date | None: ...


def classify_row(candidate: RowValues, current: RowValues | None, schema_changed: bool) -> RowChange:
    """current 는 같은 구분 칸의 비교 상대(현재 승인 줄 또는 구조 이월 결과 줄). 없으면 새 줄이다.

    구조가 바뀐 입력에서는 값이 같아도 건너뛰지 않고 바뀌는 줄로 본다(새 구조로 들어온 줄로 다시 검토하게).
    """
    if current is None:
        return RowChange.NEW
    same_values = (
        dict(candidate.data) == dict(current.data)
        and candidate.source_kind == current.source_kind
        and candidate.source_url == current.source_url
    )
    if not same_values:
        return RowChange.CHANGED
    if candidate.as_of_date != current.as_of_date:
        return RowChange.AS_OF_ONLY
    return RowChange.CHANGED if schema_changed else RowChange.UNCHANGED
