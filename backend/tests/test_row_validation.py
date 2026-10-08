from datetime import date

import pytest

from app.data_core.enums import ImportSourceType, RowErrorCode, RowStatus, SourceKind
from app.data_core.field_definition import FieldSpec, parse_field_definitions
from app.data_core.row_validation import RowError, RowInput, RowResult, is_approvable, validate_rows

SOURCE_URL = "https://example.org/source"
AS_OF = "2026-01-31"


def _external(values: dict[str, object]) -> RowInput:
    return RowInput(values=values, source_kind="external", source_url=SOURCE_URL, as_of_date=AS_OF)


def _validate_one(
    fields: list[FieldSpec],
    row: RowInput,
    import_source_type: ImportSourceType = ImportSourceType.UPLOAD,
    default_source_url: str | None = None,
) -> RowResult:
    [result] = validate_rows(fields, [row], import_source_type, default_source_url)
    return result


def _codes(result: RowResult) -> list[tuple[RowErrorCode, str | None]]:
    return [(error.code, error.field) for error in result.errors]


def _single_field(definition: dict[str, object]) -> list[FieldSpec]:
    return parse_field_definitions([{"name": "id", "type": "text", "key": True}, definition])


# --- 타입 변환 ---


@pytest.mark.parametrize(
    ("definition", "raw", "expected"),
    [
        ({"type": "text"}, "  수소 ", "수소"),
        ({"type": "int"}, "42", 42),
        ({"type": "int"}, "-7", -7),
        ({"type": "int"}, 5, 5),
        ({"type": "number"}, "1.008", 1.008),
        ({"type": "number"}, "12", 12),
        ({"type": "number"}, "1e3", 1000.0),
        ({"type": "number"}, 2.5, 2.5),
        ({"type": "year"}, "1766", 1766),
        ({"type": "year"}, "-500", -500),
        ({"type": "date"}, "2024-02-29", "2024-02-29"),
        ({"type": "category", "options": ["gas", "solid"]}, "gas", "gas"),
        ({"type": "url"}, "http://example.org/a", "http://example.org/a"),
        ({"type": "bool"}, "TRUE", True),
        ({"type": "bool"}, "0", False),
        ({"type": "bool"}, False, False),
    ],
)
def test_value_is_converted_by_type(definition: dict[str, object], raw: object, expected: object) -> None:
    fields = _single_field({"name": "value", **definition})

    result = _validate_one(fields, _external({"id": "a", "value": raw}))

    assert result.errors == []
    assert result.data["value"] == expected
    assert type(result.data["value"]) is type(expected)


@pytest.mark.parametrize(
    ("definition", "raw"),
    [
        ({"type": "text"}, 3),
        ({"type": "int"}, "1.5"),
        ({"type": "int"}, "1,000"),
        ({"type": "int"}, True),
        ({"type": "number"}, "abc"),
        ({"type": "number"}, "nan"),
        ({"type": "number"}, float("inf")),
        ({"type": "year"}, "1766년"),
        ({"type": "date"}, "2023-02-29"),
        ({"type": "date"}, "2023/01/01"),
        ({"type": "category", "options": ["gas"]}, 1),
        ({"type": "url"}, "ftp://example.org"),
        ({"type": "url"}, "example.org"),
        ({"type": "url"}, "https://exa mple.org"),
        ({"type": "url"}, "http://[abc/x"),
        ({"type": "bool"}, "maybe"),
    ],
)
def test_invalid_value_is_type_error(definition: dict[str, object], raw: object) -> None:
    fields = _single_field({"name": "value", **definition})

    result = _validate_one(fields, _external({"id": "a", "value": raw}))

    assert _codes(result) == [(RowErrorCode.TYPE, "value")]
    assert result.data["value"] is None


@pytest.mark.parametrize(
    ("definition", "raw", "code"),
    [
        ({"type": "int", "min": 1}, "0", RowErrorCode.MIN),
        ({"type": "number", "max": 10}, "10.5", RowErrorCode.MAX),
        ({"type": "year", "min": 1000, "max": 2100}, "2101", RowErrorCode.MAX),
        ({"type": "text", "max_length": 2}, "abc", RowErrorCode.MAX_LENGTH),
        ({"type": "url", "max_length": 15}, "https://example.org", RowErrorCode.MAX_LENGTH),
        ({"type": "category", "options": ["gas", "solid"]}, "liquid", RowErrorCode.OPTION),
    ],
)
def test_constraint_violation(definition: dict[str, object], raw: object, code: RowErrorCode) -> None:
    fields = _single_field({"name": "value", **definition})

    result = _validate_one(fields, _external({"id": "a", "value": raw}))

    assert _codes(result) == [(code, "value")]


def test_boundary_values_pass() -> None:
    fields = _single_field({"name": "value", "type": "int", "min": 1, "max": 3})

    results = validate_rows(
        fields,
        [_external({"id": "a", "value": "1"}), _external({"id": "b", "value": "3"})],
        ImportSourceType.UPLOAD,
        None,
    )

    assert [result.errors for result in results] == [[], []]


# --- 필수·조건부 필수·정의 밖 칸 ---


def test_required_and_key_fields_must_be_present() -> None:
    fields = _single_field({"name": "value", "type": "text", "required": True})

    result = _validate_one(fields, _external({"id": " ", "value": ""}))

    assert _codes(result) == [(RowErrorCode.REQUIRED, "id"), (RowErrorCode.REQUIRED, "value")]
    assert result.row_key is None


def test_optional_blank_value_is_none() -> None:
    fields = _single_field({"name": "value", "type": "int"})

    result = _validate_one(fields, _external({"id": "a"}))

    assert result.errors == []
    assert result.data == {"id": "a", "value": None}


def test_required_if_applies_only_when_condition_matches() -> None:
    fields = parse_field_definitions(
        [
            {"name": "id", "type": "text", "key": True},
            {"name": "is_estimated", "type": "bool"},
            {"name": "method", "type": "text", "required_if": {"is_estimated": True}},
        ]
    )

    results = validate_rows(
        fields,
        [
            _external({"id": "a", "is_estimated": "true"}),
            _external({"id": "b", "is_estimated": "false"}),
            _external({"id": "c"}),
            _external({"id": "d", "is_estimated": "true", "method": "추정"}),
        ],
        ImportSourceType.UPLOAD,
        None,
    )

    assert [_codes(result) for result in results] == [[(RowErrorCode.REQUIRED, "method")], [], [], []]


def test_required_if_with_multiple_conditions_needs_all() -> None:
    fields = parse_field_definitions(
        [
            {"name": "id", "type": "text", "key": True},
            {"name": "kind", "type": "category", "options": ["a", "b"]},
            {"name": "level", "type": "int"},
            {"name": "note", "type": "text", "required_if": {"kind": "a", "level": 2}},
        ]
    )

    results = validate_rows(
        fields,
        [_external({"id": "1", "kind": "a", "level": "2"}), _external({"id": "2", "kind": "a", "level": "3"})],
        ImportSourceType.UPLOAD,
        None,
    )

    assert [_codes(result) for result in results] == [[(RowErrorCode.REQUIRED, "note")], []]


def test_unknown_field_is_error() -> None:
    fields = _single_field({"name": "value", "type": "text"})

    result = _validate_one(fields, _external({"id": "a", "value": "x", "extra": "y"}))

    assert _codes(result) == [(RowErrorCode.UNKNOWN_FIELD, "extra")]
    assert "extra" not in result.data


# --- row_key ---


def test_composite_key_joins_in_definition_order() -> None:
    fields = parse_field_definitions(
        [
            {"name": "year", "type": "year", "key": True},
            {"name": "label", "type": "text"},
            {"name": "region", "type": "text", "key": True},
            {"name": "flag", "type": "bool", "key": True},
        ]
    )

    result = _validate_one(fields, _external({"region": "서울", "flag": "1", "year": "2020", "label": "x"}))

    assert result.errors == []
    assert result.row_key == "2020|서울|true"


def test_duplicate_key_marks_every_occurrence() -> None:
    fields = _single_field({"name": "value", "type": "int"})

    results = validate_rows(
        fields,
        [_external({"id": "a"}), _external({"id": "b"}), _external({"id": " a "})],
        ImportSourceType.UPLOAD,
        None,
    )

    assert [_codes(result) for result in results] == [
        [(RowErrorCode.DUPLICATE_KEY, None)],
        [],
        [(RowErrorCode.DUPLICATE_KEY, None)],
    ]
    assert "1, 3번째" in results[0].errors[0].message


def test_too_long_key_is_error() -> None:
    fields = parse_field_definitions([{"name": "id", "type": "text", "key": True}])

    results = validate_rows(
        fields, [_external({"id": "x" * 191}), _external({"id": "y" * 192})], ImportSourceType.UPLOAD, None
    )

    assert results[0].errors == []
    assert results[0].row_key == "x" * 191
    assert _codes(results[1]) == [(RowErrorCode.KEY_TOO_LONG, None)]
    assert results[1].row_key is None


# --- 출처 규칙(D-18) ---


KEY_ONLY_FIELDS = [{"name": "id", "type": "text", "key": True}]


def test_missing_source_kind_is_error() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(fields, RowInput(values={"id": "a"}, source_url=SOURCE_URL, as_of_date=AS_OF))

    assert _codes(result) == [(RowErrorCode.SOURCE_KIND_MISSING, "source_kind")]
    assert result.source_kind is None


def test_unknown_source_kind_is_error() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(fields, RowInput(values={"id": "a"}, source_kind="internal"))

    assert _codes(result) == [(RowErrorCode.SOURCE_KIND_INVALID, "source_kind")]


def test_external_requires_url_and_as_of_date() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(fields, RowInput(values={"id": "a"}, source_kind="external"))

    assert _codes(result) == [
        (RowErrorCode.SOURCE_URL_MISSING, "source_url"),
        (RowErrorCode.AS_OF_DATE_MISSING, "as_of_date"),
    ]


def test_external_uses_default_source_url_when_row_has_none() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(
        fields,
        RowInput(values={"id": "a"}, source_kind="external", as_of_date=AS_OF),
        default_source_url="https://example.org/default",
    )

    assert result.errors == []
    assert result.source_kind is SourceKind.EXTERNAL
    assert result.source_url == "https://example.org/default"
    assert result.as_of_date == date(2026, 1, 31)


def test_row_source_url_overrides_default() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(fields, _external({"id": "a"}), default_source_url="https://example.org/default")

    assert result.source_url == SOURCE_URL


@pytest.mark.parametrize(
    "bad_url", ["javascript:alert(1)", "example.org", "http://[abc/x", "https://" + "a" * 2048]
)
def test_external_source_url_must_be_http_url(bad_url: str) -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(
        fields, RowInput(values={"id": "a"}, source_kind="external", source_url=bad_url, as_of_date=AS_OF)
    )

    assert _codes(result) == [(RowErrorCode.SOURCE_URL_INVALID, "source_url")]


def test_invalid_default_source_url_is_reported() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(
        fields,
        RowInput(values={"id": "a"}, source_kind="external", as_of_date=AS_OF),
        default_source_url="not a url",
    )

    assert _codes(result) == [(RowErrorCode.SOURCE_URL_INVALID, "source_url")]


def test_external_as_of_date_must_be_valid_date() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(
        fields, RowInput(values={"id": "a"}, source_kind="external", source_url=SOURCE_URL, as_of_date="2026-13-01")
    )

    assert _codes(result) == [(RowErrorCode.AS_OF_DATE_INVALID, "as_of_date")]


def test_self_passes_without_url_and_date_and_ignores_default_url() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(
        fields, RowInput(values={"id": "a"}, source_kind="self"), default_source_url="https://example.org/default"
    )

    assert result.errors == []
    assert result.source_kind is SourceKind.SELF
    assert result.source_url is None
    assert result.as_of_date is None


def test_claude_import_rejects_self_rows() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(fields, RowInput(values={"id": "a"}, source_kind="self"), ImportSourceType.CLAUDE)

    assert _codes(result) == [(RowErrorCode.SELF_NOT_ALLOWED, "source_kind")]


def test_claude_import_accepts_external_rows_with_source() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(fields, _external({"id": "a"}), ImportSourceType.CLAUDE)

    assert result.errors == []


def test_claude_import_external_without_url_is_rejected() -> None:
    fields = parse_field_definitions(KEY_ONLY_FIELDS)

    result = _validate_one(
        fields, RowInput(values={"id": "a"}, source_kind="external", as_of_date=AS_OF), ImportSourceType.CLAUDE
    )

    assert _codes(result) == [(RowErrorCode.SOURCE_URL_MISSING, "source_url")]


# --- 서로 다른 주제를 같은 엔진으로 ---


def test_two_unrelated_topics_pass_through_same_engine() -> None:
    element_fields = parse_field_definitions(
        [
            {"name": "atomic_number", "label": "원자 번호", "type": "int", "key": True, "min": 1, "max": 118},
            {"name": "symbol", "label": "기호", "type": "text", "required": True, "max_length": 3},
            {"name": "discovered_year", "label": "발견 연도", "type": "year"},
            {"name": "is_ancient", "label": "고대부터 알려짐", "type": "bool", "required": True},
            {"name": "discoverer", "type": "text", "required_if": {"is_ancient": False}},
            {"name": "category", "type": "category", "options": ["metal", "nonmetal", "metalloid"]},
        ]
    )
    population_fields = parse_field_definitions(
        [
            {"name": "year", "type": "year", "key": True, "min": 1900},
            {"name": "region", "label": "시도", "type": "category", "key": True, "options": ["서울", "부산"]},
            {"name": "population", "type": "int", "required": True, "min": 0, "unit": "명"},
            {"name": "density", "type": "number", "unit": "명/km²"},
            {"name": "survey_date", "type": "date"},
        ]
    )

    element_results = validate_rows(
        element_fields,
        [
            _external({"atomic_number": "1", "symbol": "H", "discovered_year": "1766", "is_ancient": "false",
                       "discoverer": "Henry Cavendish", "category": "nonmetal"}),
            RowInput(values={"atomic_number": "79", "symbol": "Au", "is_ancient": "true", "category": "metal"},
                     source_kind="self"),
        ],
        ImportSourceType.UPLOAD,
        None,
    )
    population_results = validate_rows(
        population_fields,
        [
            _external({"year": "2020", "region": "서울", "population": "9586195", "density": "15839.5",
                       "survey_date": "2020-11-01"}),
            _external({"year": "2020", "region": "부산", "population": "3349016"}),
        ],
        ImportSourceType.CLAUDE,
        None,
    )

    assert [result.errors for result in element_results + population_results] == [[], [], [], []]
    assert [result.row_key for result in element_results] == ["1", "79"]
    assert [result.row_key for result in population_results] == ["2020|서울", "2020|부산"]
    assert element_results[0].data["discovered_year"] == 1766
    assert population_results[0].data["density"] == 15839.5


# --- 승인 가능 판정 ---


def test_is_approvable() -> None:
    error = RowError(RowErrorCode.REQUIRED, "id", "필수 값입니다.")

    assert is_approvable([], RowStatus.PENDING) is True
    assert is_approvable(None, RowStatus.APPROVED) is True
    assert is_approvable([], RowStatus.REJECTED) is False
    assert is_approvable([], "rejected") is False
    assert is_approvable([error], RowStatus.PENDING) is False
    assert is_approvable([error.to_dict()], RowStatus.PENDING) is False


def test_row_error_serializes_to_plain_strings() -> None:
    error = RowError(RowErrorCode.DUPLICATE_KEY, None, "겹침")

    assert error.to_dict() == {"code": "duplicate_key", "field": None, "message": "겹침"}
