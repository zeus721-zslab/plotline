import pytest

from app.data_core.enums import FieldType
from app.data_core.field_definition import FieldDefinitionError, parse_field_definitions


def _problems_of(raw_fields: object) -> list[str]:
    with pytest.raises(FieldDefinitionError) as caught:
        parse_field_definitions(raw_fields)
    return caught.value.problems


def test_valid_definition_is_parsed_in_order() -> None:
    specs = parse_field_definitions(
        [
            {"name": "symbol", "label": "기호", "type": "text", "key": True, "max_length": 3},
            {"name": "mass", "type": "number", "min": 0, "unit": "u"},
            {"name": "state", "type": "category", "options": ["gas", "solid"]},
        ]
    )

    assert [spec.name for spec in specs] == ["symbol", "mass", "state"]
    assert specs[0].type is FieldType.TEXT
    assert specs[0].key is True
    assert specs[1].unit == "u"
    assert specs[2].options == ("gas", "solid")


@pytest.mark.parametrize("raw_fields", [None, {}, [], "text"])
def test_definition_must_be_non_empty_array(raw_fields: object) -> None:
    assert _problems_of(raw_fields) == ["데이터 구조는 비어 있지 않은 배열이어야 합니다."]


def test_at_least_one_key_is_required() -> None:
    problems = _problems_of([{"name": "title", "type": "text"}])

    assert problems == ["구분 칸('key': true)이 1개 이상 있어야 합니다."]


@pytest.mark.parametrize("bad_name", ["Title", "title-1", "", "제목", 3])
def test_name_must_be_lowercase_snake(bad_name: object) -> None:
    problems = _problems_of([{"name": bad_name, "type": "text", "key": True}])

    assert len(problems) == 1
    assert "'name' 은 영문 소문자" in problems[0]


@pytest.mark.parametrize("reserved_name", ["source_kind", "source_url", "as_of_date"])
def test_reserved_source_name_is_rejected(reserved_name: str) -> None:
    problems = _problems_of(
        [{"name": "code", "type": "text", "key": True}, {"name": reserved_name, "type": "text"}]
    )

    assert len(problems) == 1
    assert problems[0].startswith(f"key '{reserved_name}': 출처 key")


def test_duplicate_name_is_rejected() -> None:
    problems = _problems_of(
        [{"name": "code", "type": "text", "key": True}, {"name": "code", "type": "int"}]
    )

    assert problems == ["key 'code': 'name' 이 데이터 구조 안에서 중복됩니다."]


def test_unknown_type_is_rejected() -> None:
    problems = _problems_of([{"name": "code", "type": "string", "key": True}])

    assert len(problems) == 1
    assert "'type' 은" in problems[0]


@pytest.mark.parametrize(
    ("field_type", "attribute", "value", "type_name"),
    [
        ("text", "min", 1, "글자(text)"),
        ("bool", "max_length", 5, "예/아니오(bool)"),
        ("date", "unit", "일", "날짜(date)"),
        ("int", "options", ["a"], "정수(int)"),
        ("year", "unit", "년", "연도(year)"),
    ],
)
def test_attribute_not_allowed_for_type(field_type: str, attribute: str, value: object, type_name: str) -> None:
    problems = _problems_of(
        [{"name": "code", "type": "text", "key": True}, {"name": "other", "type": field_type, attribute: value}]
    )

    assert problems == [f"key 'other': {type_name} 형식에는 '{attribute}' 를 쓸 수 없습니다."]


def test_category_requires_options() -> None:
    problems = _problems_of([{"name": "state", "type": "category", "key": True}])

    assert problems == ["key 'state': 선택지(category) 형식은 'options' 가 필요합니다."]


def test_min_must_not_exceed_max() -> None:
    problems = _problems_of([{"name": "count", "type": "int", "key": True, "min": 10, "max": 1}])

    assert problems == ["key 'count': 'min' 이 'max' 보다 클 수 없습니다."]


def test_integer_type_bounds_must_be_integers() -> None:
    problems = _problems_of([{"name": "year", "type": "year", "key": True, "min": 1.5}])

    assert problems == ["key 'year': 'min' 는 정수여야 합니다."]


def test_required_if_must_point_to_existing_field() -> None:
    problems = _problems_of(
        [
            {"name": "code", "type": "text", "key": True},
            {"name": "note", "type": "text", "required_if": {"missing": "x"}},
        ]
    )

    assert problems == ["key 'note': 'required_if' 가 데이터 구조에 없는 key 'missing' 를 가리킵니다."]


def test_required_if_cannot_point_to_itself() -> None:
    problems = _problems_of(
        [{"name": "code", "type": "text", "key": True, "required_if": {"code": "x"}}]
    )

    assert problems == ["key 'code': 'required_if' 가 자기 자신을 가리킬 수 없습니다."]


def test_number_cannot_be_key() -> None:
    problems = _problems_of([{"name": "mass", "type": "number", "key": True}])

    assert problems == ["key 'mass': 숫자(number) 형식은 구분 칸('key': true)으로 쓸 수 없습니다."]


def _definition_with_condition(target: dict[str, object], condition_value: object) -> list[dict[str, object]]:
    return [
        {"name": "code", "type": "text", "key": True},
        {"name": "target", **target},
        {"name": "note", "type": "text", "required_if": {"target": condition_value}},
    ]


CATEGORY_TARGET = {"type": "category", "options": ["gas", "solid"]}


@pytest.mark.parametrize(
    ("target", "condition_value", "expected"),
    [
        ({"type": "int"}, "2", "key 'note': 'required_if' 의 'target' 조건 값이 정수(int) 형식과 맞지 않습니다."),
        ({"type": "int"}, True, "key 'note': 'required_if' 의 'target' 조건 값이 정수(int) 형식과 맞지 않습니다."),
        ({"type": "number"}, "1", "key 'note': 'required_if' 의 'target' 조건 값이 숫자(number) 형식과 맞지 않습니다."),
        ({"type": "date"}, "2026-02-30", "key 'note': 'required_if' 의 'target' 조건 값이 날짜(date) 형식과 맞지 않습니다."),
        ({"type": "bool"}, "true", "key 'note': 'required_if' 의 'target' 조건 값이 예/아니오(bool) 형식과 맞지 않습니다."),
        (CATEGORY_TARGET, "liquid", "key 'note': 'required_if' 의 'target' 조건 값은 'options'(gas, solid) 중 하나여야 합니다."),
    ],
)
def test_required_if_value_must_match_target_type(
    target: dict[str, object], condition_value: object, expected: str
) -> None:
    assert _problems_of(_definition_with_condition(target, condition_value)) == [expected]


@pytest.mark.parametrize(
    ("target", "condition_value"),
    [
        ({"type": "int"}, 2),
        ({"type": "bool"}, True),
        (CATEGORY_TARGET, "solid"),
    ],
)
def test_required_if_value_matching_target_type_passes(target: dict[str, object], condition_value: object) -> None:
    specs = parse_field_definitions(_definition_with_condition(target, condition_value))

    assert specs[2].required_if == {"target": condition_value}


def test_all_problems_are_collected_at_once() -> None:
    problems = _problems_of(
        [
            {"name": "code", "type": "text", "key": "yes"},
            {"name": "state", "type": "category"},
        ]
    )

    assert problems == [
        "key 'code': 'key' 는 true/false 여야 합니다.",
        "key 'state': 선택지(category) 형식은 'options' 가 필요합니다.",
    ]
