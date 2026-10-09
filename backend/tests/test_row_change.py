"""붙여넣은 줄 분류(classify_row) 규칙. DB 없음."""

from dataclasses import dataclass, field
from datetime import date

import pytest

from app.data_core.enums import SourceKind
from app.data_core.row_change import RowChange, classify_row

SOURCE_URL = "https://example.org/fe"
AS_OF = date(2026, 10, 1)


@dataclass(frozen=True)
class Values:
    data: dict[str, object] = field(default_factory=lambda: {"symbol": "Fe", "year": 1800})
    source_kind: SourceKind | None = SourceKind.EXTERNAL
    source_url: str | None = SOURCE_URL
    as_of_date: date | None = AS_OF


def test_no_current_row_is_new() -> None:
    assert classify_row(Values(), None, schema_changed=False) is RowChange.NEW


def test_same_values_and_source_is_unchanged() -> None:
    assert classify_row(Values(), Values(), schema_changed=False) is RowChange.UNCHANGED


def test_same_values_under_schema_change_is_changed_not_skipped() -> None:
    assert classify_row(Values(), Values(), schema_changed=True) is RowChange.CHANGED


@pytest.mark.parametrize("schema_changed", [False, True])
def test_only_as_of_date_differs_is_as_of_only(schema_changed: bool) -> None:
    newer = Values(as_of_date=date(2026, 10, 9))

    assert classify_row(newer, Values(), schema_changed=schema_changed) is RowChange.AS_OF_ONLY


@pytest.mark.parametrize(
    "candidate",
    [
        pytest.param(Values(data={"symbol": "Fe", "year": 1801}), id="value"),
        pytest.param(Values(source_url="https://example.org/other"), id="source-url"),
        pytest.param(Values(source_kind=SourceKind.SELF), id="source-kind"),
        pytest.param(Values(data={"symbol": "Fe", "year": 1801}, as_of_date=date(2026, 10, 9)), id="value-and-as-of"),
    ],
)
def test_value_or_source_difference_is_changed(candidate: Values) -> None:
    assert classify_row(candidate, Values(), schema_changed=False) is RowChange.CHANGED


def test_key_order_of_data_does_not_matter() -> None:
    reordered = Values(data={"year": 1800, "symbol": "Fe"})

    assert classify_row(reordered, Values(), schema_changed=False) is RowChange.UNCHANGED
