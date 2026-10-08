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
    assert _problems_of(raw_fields) == ["필드 정의는 비어 있지 않은 배열이어야 합니다."]


def test_at_least_one_key_is_required() -> None:
    problems = _problems_of([{"name": "title", "type": "text"}])

    assert problems == ["key 필드가 1개 이상 있어야 합니다."]


@pytest.mark.parametrize("bad_name", ["Title", "title-1", "", "제목", 3])
def test_name_must_be_lowercase_snake(bad_name: object) -> None:
    problems = _problems_of([{"name": bad_name, "type": "text", "key": True}])

    assert len(problems) == 1
    assert "name 은 영문 소문자" in problems[0]


def test_duplicate_name_is_rejected() -> None:
    problems = _problems_of(
        [{"name": "code", "type": "text", "key": True}, {"name": "code", "type": "int"}]
    )

    assert problems == ["필드 'code': name 이 정의 안에서 중복됩니다."]


def test_unknown_type_is_rejected() -> None:
    problems = _problems_of([{"name": "code", "type": "string", "key": True}])

    assert len(problems) == 1
    assert "type 은" in problems[0]


@pytest.mark.parametrize(
    ("field_type", "attribute", "value"),
    [
        ("text", "min", 1),
        ("bool", "max_length", 5),
        ("date", "unit", "일"),
        ("int", "options", ["a"]),
        ("year", "unit", "년"),
    ],
)
def test_attribute_not_allowed_for_type(field_type: str, attribute: str, value: object) -> None:
    problems = _problems_of(
        [{"name": "code", "type": "text", "key": True}, {"name": "other", "type": field_type, attribute: value}]
    )

    assert problems == [f"필드 'other': {field_type} 타입에는 '{attribute}' 속성을 쓸 수 없습니다."]


def test_category_requires_options() -> None:
    problems = _problems_of([{"name": "state", "type": "category", "key": True}])

    assert problems == ["필드 'state': category 타입은 options 가 필요합니다."]


def test_min_must_not_exceed_max() -> None:
    problems = _problems_of([{"name": "count", "type": "int", "key": True, "min": 10, "max": 1}])

    assert problems == ["필드 'count': min 이 max 보다 클 수 없습니다."]


def test_integer_type_bounds_must_be_integers() -> None:
    problems = _problems_of([{"name": "year", "type": "year", "key": True, "min": 1.5}])

    assert problems == ["필드 'year': min 는 정수여야 합니다."]


def test_required_if_must_point_to_existing_field() -> None:
    problems = _problems_of(
        [
            {"name": "code", "type": "text", "key": True},
            {"name": "note", "type": "text", "required_if": {"missing": "x"}},
        ]
    )

    assert problems == ["필드 'note': required_if 가 없는 필드 'missing' 를 가리킵니다."]


def test_required_if_cannot_point_to_itself() -> None:
    problems = _problems_of(
        [{"name": "code", "type": "text", "key": True, "required_if": {"code": "x"}}]
    )

    assert problems == ["필드 'code': required_if 가 자기 자신을 가리킬 수 없습니다."]


def test_number_cannot_be_key() -> None:
    problems = _problems_of([{"name": "mass", "type": "number", "key": True}])

    assert problems == ["필드 'mass': number 타입은 key 로 쓸 수 없습니다."]


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
        ({"type": "int"}, "2", "필드 'note': required_if 의 'target' 조건 값이 int 타입과 맞지 않습니다."),
        ({"type": "int"}, True, "필드 'note': required_if 의 'target' 조건 값이 int 타입과 맞지 않습니다."),
        ({"type": "number"}, "1", "필드 'note': required_if 의 'target' 조건 값이 number 타입과 맞지 않습니다."),
        ({"type": "date"}, "2026-02-30", "필드 'note': required_if 의 'target' 조건 값이 date 타입과 맞지 않습니다."),
        ({"type": "bool"}, "true", "필드 'note': required_if 의 'target' 조건 값이 bool 타입과 맞지 않습니다."),
        (CATEGORY_TARGET, "liquid", "필드 'note': required_if 의 'target' 조건 값은 options(gas, solid) 중 하나여야 합니다."),
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
        "필드 'code': key 는 true/false 여야 합니다.",
        "필드 'state': category 타입은 options 가 필요합니다.",
    ]
