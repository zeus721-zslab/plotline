"""필드 정의(fields JSON) 해석·자체 검사.

정의는 배열이고 원소 1개가 칸 1개다. 형식이 틀린 정의로 행을 검사하면 결과를 믿을 수 없으므로,
문제를 모두 모아 FieldDefinitionError 로 한 번에 돌려준다.
"""

import math
import re
from dataclasses import dataclass, field
from typing import Any

from app.data_core.enums import FieldType

NAME_PATTERN = re.compile(r"^[a-z0-9_]+$")

COMMON_ATTRIBUTES = frozenset({"name", "label", "type", "required", "key", "required_if"})
TYPE_SPECIFIC_ATTRIBUTES: dict[FieldType, frozenset[str]] = {
    FieldType.TEXT: frozenset({"max_length"}),
    FieldType.INT: frozenset({"min", "max", "unit"}),
    FieldType.NUMBER: frozenset({"min", "max", "unit"}),
    FieldType.YEAR: frozenset({"min", "max"}),
    FieldType.DATE: frozenset(),
    FieldType.CATEGORY: frozenset({"options"}),
    FieldType.URL: frozenset({"max_length"}),
    FieldType.BOOL: frozenset(),
}
INTEGER_BOUND_TYPES = frozenset({FieldType.INT, FieldType.YEAR})

type RequiredIfValue = str | int | float | bool


@dataclass(frozen=True)
class FieldSpec:
    name: str
    type: FieldType
    label: str | None = None
    required: bool = False
    key: bool = False
    min: int | float | None = None
    max: int | float | None = None
    max_length: int | None = None
    unit: str | None = None
    options: tuple[str, ...] = ()
    required_if: dict[str, RequiredIfValue] = field(default_factory=dict)


class FieldDefinitionError(ValueError):
    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def parse_field_definitions(raw_fields: object) -> list[FieldSpec]:
    """정의 JSON 을 검사해 FieldSpec 목록으로 바꾼다. 문제가 하나라도 있으면 FieldDefinitionError."""
    if not isinstance(raw_fields, list) or not raw_fields:
        raise FieldDefinitionError(["필드 정의는 비어 있지 않은 배열이어야 합니다."])

    problems: list[str] = []
    specs: list[FieldSpec] = []
    for position, raw_field in enumerate(raw_fields):
        spec = _parse_one_field(raw_field, position, problems)
        if spec is not None:
            specs.append(spec)

    # 개별 필드가 깨진 상태에서 교차 검사를 하면 "없는 필드 참조" 같은 파생 문제가 섞이므로 건너뛴다.
    if not problems:
        problems.extend(_check_across_fields(specs))
    if problems:
        raise FieldDefinitionError(problems)
    return specs


def _parse_one_field(raw_field: object, position: int, problems: list[str]) -> FieldSpec | None:
    where = f"{position + 1}번째 필드"
    if not isinstance(raw_field, dict):
        problems.append(f"{where}: 객체여야 합니다.")
        return None

    name = raw_field.get("name")
    if not isinstance(name, str) or not NAME_PATTERN.match(name):
        problems.append(f"{where}: name 은 영문 소문자·숫자·_ 로 된 문자열이어야 합니다.")
        return None
    where = f"필드 '{name}'"

    raw_type = raw_field.get("type")
    if not isinstance(raw_type, str) or raw_type not in FieldType:
        problems.append(f"{where}: type 은 {', '.join(FieldType)} 중 하나여야 합니다.")
        return None
    field_type = FieldType(raw_type)

    problem_count_before = len(problems)
    allowed = COMMON_ATTRIBUTES | TYPE_SPECIFIC_ATTRIBUTES[field_type]
    for attribute in raw_field:
        if attribute not in allowed:
            problems.append(f"{where}: {field_type} 타입에는 '{attribute}' 속성을 쓸 수 없습니다.")

    label = _optional_string(raw_field, "label", where, problems)
    required = _optional_bool(raw_field, "required", where, problems)
    key = _optional_bool(raw_field, "key", where, problems)
    bound_min = _optional_bound(raw_field, "min", field_type, where, problems)
    bound_max = _optional_bound(raw_field, "max", field_type, where, problems)
    if bound_min is not None and bound_max is not None and bound_min > bound_max:
        problems.append(f"{where}: min 이 max 보다 클 수 없습니다.")
    max_length = _optional_max_length(raw_field, where, problems)
    unit = _optional_string(raw_field, "unit", where, problems)
    options = _options(raw_field, field_type, where, problems)
    required_if = _required_if(raw_field, where, problems)

    if len(problems) > problem_count_before:
        return None
    return FieldSpec(
        name=name,
        type=field_type,
        label=label,
        required=required,
        key=key,
        min=bound_min,
        max=bound_max,
        max_length=max_length,
        unit=unit,
        options=options,
        required_if=required_if,
    )


def _optional_string(raw_field: dict[str, Any], attribute: str, where: str, problems: list[str]) -> str | None:
    value = raw_field.get(attribute)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        problems.append(f"{where}: {attribute} 는 비어 있지 않은 문자열이어야 합니다.")
        return None
    return value


def _optional_bool(raw_field: dict[str, Any], attribute: str, where: str, problems: list[str]) -> bool:
    value = raw_field.get(attribute, False)
    if not isinstance(value, bool):
        problems.append(f"{where}: {attribute} 는 true/false 여야 합니다.")
        return False
    return value


def _optional_bound(
    raw_field: dict[str, Any], attribute: str, field_type: FieldType, where: str, problems: list[str]
) -> int | float | None:
    value = raw_field.get(attribute)
    if value is None:
        return None
    if field_type in INTEGER_BOUND_TYPES:
        if isinstance(value, bool) or not isinstance(value, int):
            problems.append(f"{where}: {attribute} 는 정수여야 합니다.")
            return None
        return value
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        problems.append(f"{where}: {attribute} 는 숫자여야 합니다.")
        return None
    return value


def _optional_max_length(raw_field: dict[str, Any], where: str, problems: list[str]) -> int | None:
    value = raw_field.get("max_length")
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        problems.append(f"{where}: max_length 는 1 이상의 정수여야 합니다.")
        return None
    return value


def _options(raw_field: dict[str, Any], field_type: FieldType, where: str, problems: list[str]) -> tuple[str, ...]:
    if field_type is not FieldType.CATEGORY:
        return ()
    value = raw_field.get("options")
    if value is None:
        problems.append(f"{where}: category 타입은 options 가 필요합니다.")
        return ()
    if (
        not isinstance(value, list)
        or not value
        or not all(isinstance(option, str) and option.strip() for option in value)
    ):
        problems.append(f"{where}: options 는 비어 있지 않은 문자열 배열이어야 합니다.")
        return ()
    if len(set(value)) != len(value):
        problems.append(f"{where}: options 에 중복 값이 있습니다.")
        return ()
    return tuple(value)


def _required_if(
    raw_field: dict[str, Any], where: str, problems: list[str]
) -> dict[str, RequiredIfValue]:
    value = raw_field.get("required_if")
    if value is None:
        return {}
    if not isinstance(value, dict) or not value:
        problems.append(f"{where}: required_if 는 {{\"다른필드\": 값}} 형태의 비어 있지 않은 객체여야 합니다.")
        return {}
    for condition_value in value.values():
        if not isinstance(condition_value, str | int | float | bool):
            problems.append(f"{where}: required_if 의 값은 문자열·숫자·true/false 여야 합니다.")
            return {}
    return dict(value)


def _check_across_fields(specs: list[FieldSpec]) -> list[str]:
    problems: list[str] = []
    names = [spec.name for spec in specs]
    duplicated = sorted({name for name in names if names.count(name) > 1})
    for name in duplicated:
        problems.append(f"필드 '{name}': name 이 정의 안에서 중복됩니다.")

    known_names = set(names)
    for spec in specs:
        for referenced in spec.required_if:
            if referenced == spec.name:
                problems.append(f"필드 '{spec.name}': required_if 가 자기 자신을 가리킬 수 없습니다.")
            elif referenced not in known_names:
                problems.append(f"필드 '{spec.name}': required_if 가 없는 필드 '{referenced}' 를 가리킵니다.")

    if not any(spec.key for spec in specs):
        problems.append("key 필드가 1개 이상 있어야 합니다.")
    return problems
