"""행 검사 엔진(순수 함수, DB 접근 없음).

필드 정의에 따라 원시 행(CSV 문자열 또는 JSON 값)을 변환·검사하고, 출처 규칙(D-18)을 적용한다.
오류가 있어도 행을 버리지 않고 errors 에 담아 돌려준다(관리자가 보고 고치거나 반려하도록).
"""

import math
import re
from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import assert_never
from urllib.parse import urlsplit

from app.data_core.enums import FieldType, ImportSourceType, RowErrorCode, RowStatus, SourceKind
from app.data_core.field_definition import DATE_PATTERN, FieldSpec
from app.data_core.models import ROW_KEY_MAX_LENGTH, URL_MAX_LENGTH

ROW_KEY_SEPARATOR = "|"
INTEGER_PATTERN = re.compile(r"^[+-]?\d+$")
DECIMAL_PATTERN = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")
ALLOWED_URL_SCHEMES = frozenset({"http", "https"})
TRUE_STRINGS = frozenset({"true", "1", "yes"})
FALSE_STRINGS = frozenset({"false", "0", "no"})

type CellValue = str | int | float | bool


@dataclass(frozen=True)
class RowError:
    code: RowErrorCode
    field: str | None
    message: str

    def to_dict(self) -> dict[str, str | None]:
        return {"code": self.code.value, "field": self.field, "message": self.message}


@dataclass(frozen=True)
class RowInput:
    values: Mapping[str, object]
    source_kind: object = None
    source_url: object = None
    as_of_date: object = None


@dataclass
class RowResult:
    data: dict[str, CellValue | None]
    row_key: str | None
    source_kind: SourceKind | None
    source_url: str | None
    as_of_date: date | None
    errors: list[RowError] = field(default_factory=list)


@dataclass(frozen=True)
class _SourceCheck:
    kind: SourceKind | None
    url: str | None
    as_of_date: date | None
    errors: list[RowError]


class _ConversionError(ValueError):
    pass


def validate_rows(
    fields: Sequence[FieldSpec],
    rows: Sequence[RowInput],
    import_source_type: ImportSourceType,
    default_source_url: str | None,
) -> list[RowResult]:
    """행 목록을 검사한다. 결과는 입력과 같은 순서·같은 개수."""
    results = [_validate_row(fields, row, import_source_type, default_source_url) for row in rows]
    _mark_duplicate_keys(results)
    return results


def is_approvable(errors: Sequence[object] | None, status: RowStatus | str) -> bool:
    """승인 가능 판정: 검사 오류가 없고 반려 상태가 아니어야 한다."""
    # != 비교: DB 원시 문자열("rejected")이 넘어와도 StrEnum 과 같게 판정된다.
    return not errors and status != RowStatus.REJECTED


def _validate_row(
    fields: Sequence[FieldSpec],
    row: RowInput,
    import_source_type: ImportSourceType,
    default_source_url: str | None,
) -> RowResult:
    errors: list[RowError] = []
    known_names = {spec.name for spec in fields}
    for name in row.values:
        if name not in known_names:
            errors.append(RowError(RowErrorCode.UNKNOWN_FIELD, name, f"정의에 없는 칸 '{name}' 입니다."))

    data: dict[str, CellValue | None] = {}
    for spec in fields:
        data[spec.name] = _convert_cell(spec, row.values.get(spec.name), errors)
    _check_required(fields, row.values, data, errors)

    row_key = _build_row_key(fields, data, errors)
    source = _check_source(row, import_source_type, default_source_url)
    errors.extend(source.errors)
    return RowResult(
        data=data,
        row_key=row_key,
        source_kind=source.kind,
        source_url=source.url,
        as_of_date=source.as_of_date,
        errors=errors,
    )


def _is_blank(raw: object) -> bool:
    return raw is None or (isinstance(raw, str) and not raw.strip())


def _convert_cell(spec: FieldSpec, raw: object, errors: list[RowError]) -> CellValue | None:
    """값 1개를 타입 변환하고 범위·길이·선택지를 검사한다. 비어 있으면 None(필수 여부는 따로 본다)."""
    if _is_blank(raw):
        return None
    try:
        value = _convert_by_type(spec.type, raw)
    except _ConversionError as error:
        errors.append(RowError(RowErrorCode.TYPE, spec.name, str(error)))
        return None

    constraint_error = _check_constraints(spec, value)
    if constraint_error is not None:
        errors.append(constraint_error)
        return None
    return value


def _convert_by_type(field_type: FieldType, raw: object) -> CellValue:
    match field_type:
        case FieldType.TEXT | FieldType.CATEGORY:
            return _require_string(raw, "문자열").strip()
        case FieldType.INT | FieldType.YEAR:
            return _to_integer(raw)
        case FieldType.NUMBER:
            return _to_number(raw)
        case FieldType.DATE:
            return _to_date(_require_string(raw, "YYYY-MM-DD 형식 날짜")).isoformat()
        case FieldType.URL:
            url = _require_string(raw, "http/https URL").strip()
            if not _is_http_url(url):
                raise _ConversionError("http/https URL 이어야 합니다.")
            return url
        case FieldType.BOOL:
            return _to_bool(raw)
        case _:
            assert_never(field_type)


def _require_string(raw: object, expected: str) -> str:
    if not isinstance(raw, str):
        raise _ConversionError(f"{expected}이어야 합니다.")
    return raw


def _to_integer(raw: object) -> int:
    if isinstance(raw, int) and not isinstance(raw, bool):
        return raw
    if isinstance(raw, str) and INTEGER_PATTERN.match(raw.strip()):
        return int(raw.strip())
    raise _ConversionError("정수여야 합니다.")


def _to_number(raw: object) -> int | float:
    if isinstance(raw, int) and not isinstance(raw, bool):
        return raw
    if isinstance(raw, float) and math.isfinite(raw):
        return raw
    if isinstance(raw, str):
        text = raw.strip()
        if INTEGER_PATTERN.match(text):
            return int(text)
        if DECIMAL_PATTERN.match(text):
            number = float(text)
            if math.isfinite(number):
                return number
    raise _ConversionError("숫자여야 합니다.")


def _to_date(raw: str) -> date:
    text = raw.strip()
    if not DATE_PATTERN.match(text):
        raise _ConversionError("YYYY-MM-DD 형식 날짜여야 합니다.")
    try:
        return date.fromisoformat(text)
    except ValueError as error:
        raise _ConversionError("존재하지 않는 날짜입니다.") from error


def _to_bool(raw: object) -> bool:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        text = raw.strip().lower()
        if text in TRUE_STRINGS:
            return True
        if text in FALSE_STRINGS:
            return False
    raise _ConversionError("true/false 여야 합니다.")


def _is_http_url(url: str) -> bool:
    if any(character.isspace() for character in url):
        return False
    try:
        parts = urlsplit(url)
    except ValueError:
        # 짝이 안 맞는 대괄호 등(Invalid IPv6 URL)은 형식 오류일 뿐이므로 행 오류로 처리되게 False 를 돌려준다.
        return False
    return parts.scheme in ALLOWED_URL_SCHEMES and bool(parts.netloc)


def _check_constraints(spec: FieldSpec, value: CellValue) -> RowError | None:
    if isinstance(value, int | float) and not isinstance(value, bool):
        if spec.min is not None and value < spec.min:
            return RowError(RowErrorCode.MIN, spec.name, f"{spec.min} 이상이어야 합니다.")
        if spec.max is not None and value > spec.max:
            return RowError(RowErrorCode.MAX, spec.name, f"{spec.max} 이하여야 합니다.")
    if isinstance(value, str):
        if spec.max_length is not None and len(value) > spec.max_length:
            return RowError(RowErrorCode.MAX_LENGTH, spec.name, f"{spec.max_length}자 이하여야 합니다.")
        if spec.type is FieldType.CATEGORY and value not in spec.options:
            return RowError(RowErrorCode.OPTION, spec.name, f"선택지({', '.join(spec.options)}) 중 하나여야 합니다.")
    return None


def _check_required(
    fields: Sequence[FieldSpec],
    raw_values: Mapping[str, object],
    data: Mapping[str, CellValue | None],
    errors: list[RowError],
) -> None:
    # 변환에 실패한 칸은 이미 type 등 오류가 있으므로, 원래 비어 있던 칸만 필수 검사한다.
    for spec in fields:
        if not _is_blank(raw_values.get(spec.name)):
            continue
        if spec.required or spec.key:
            errors.append(RowError(RowErrorCode.REQUIRED, spec.name, "필수 값입니다."))
        elif spec.required_if and _conditions_match(spec, data):
            errors.append(RowError(RowErrorCode.REQUIRED, spec.name, "조건부 필수 값입니다."))


def _conditions_match(spec: FieldSpec, data: Mapping[str, CellValue | None]) -> bool:
    # 여러 조건은 모두 맞을 때(AND)만 필수가 된다. 비교는 정규화된 값 기준.
    return all(
        data.get(other_name) is not None and data.get(other_name) == expected
        for other_name, expected in spec.required_if.items()
    )


def _build_row_key(
    fields: Sequence[FieldSpec], data: Mapping[str, CellValue | None], errors: list[RowError]
) -> str | None:
    parts: list[str] = []
    has_unusable_part = False
    for spec in fields:
        if not spec.key:
            continue
        value = data[spec.name]
        if value is None:
            has_unusable_part = True
            continue
        part = _key_part(value)
        # 구분자가 값 안에 있으면 ("a|b", "c") 와 ("a", "b|c") 가 같은 row_key 가 되어 서로 다른 행이 겹친다.
        if ROW_KEY_SEPARATOR in part:
            errors.append(
                RowError(RowErrorCode.KEY_SEPARATOR, spec.name, f"key 값에는 '{ROW_KEY_SEPARATOR}' 를 쓸 수 없습니다.")
            )
            has_unusable_part = True
            continue
        parts.append(part)

    # key 오류 행도 저장되며(row_key NULL), 관리자가 보고 반려한다.
    if has_unusable_part:
        return None
    row_key = ROW_KEY_SEPARATOR.join(parts)
    if len(row_key) > ROW_KEY_MAX_LENGTH:
        errors.append(
            RowError(RowErrorCode.KEY_TOO_LONG, None, f"key 값을 합친 길이가 {ROW_KEY_MAX_LENGTH}자를 넘습니다.")
        )
        return None
    return row_key


def _key_part(value: CellValue) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _check_source(
    row: RowInput, import_source_type: ImportSourceType, default_source_url: str | None
) -> _SourceCheck:
    errors: list[RowError] = []
    kind = _parse_source_kind(row.source_kind, errors)
    if kind is SourceKind.SELF and import_source_type is ImportSourceType.CLAUDE:
        errors.append(
            RowError(RowErrorCode.SELF_NOT_ALLOWED, "source_kind", "Claude 데이터화 행은 external 만 허용됩니다.")
        )

    # 기본 출처 URL 은 외부 출처 행에만 채운다(직접 작성 행에 외부 URL 이 붙지 않게).
    raw_url = row.source_url
    if _is_blank(raw_url) and kind is SourceKind.EXTERNAL:
        raw_url = default_source_url
    url = _parse_source_url(raw_url, kind, errors)
    as_of_date = _parse_as_of_date(row.as_of_date, kind, errors)
    return _SourceCheck(kind=kind, url=url, as_of_date=as_of_date, errors=errors)


def _parse_source_kind(raw: object, errors: list[RowError]) -> SourceKind | None:
    if _is_blank(raw):
        errors.append(RowError(RowErrorCode.SOURCE_KIND_MISSING, "source_kind", "출처 유형이 없습니다."))
        return None
    text = raw.strip() if isinstance(raw, str) else raw
    if not isinstance(text, str) or text not in SourceKind:
        errors.append(
            RowError(RowErrorCode.SOURCE_KIND_INVALID, "source_kind", "출처 유형은 external 또는 self 여야 합니다.")
        )
        return None
    return SourceKind(text)


def _parse_source_url(raw: object, kind: SourceKind | None, errors: list[RowError]) -> str | None:
    if _is_blank(raw):
        if kind is SourceKind.EXTERNAL:
            errors.append(RowError(RowErrorCode.SOURCE_URL_MISSING, "source_url", "외부 출처는 URL 이 필요합니다."))
        return None
    url = raw.strip() if isinstance(raw, str) else ""
    if not _is_http_url(url) or len(url) > URL_MAX_LENGTH:
        errors.append(
            RowError(
                RowErrorCode.SOURCE_URL_INVALID,
                "source_url",
                f"출처 URL 은 {URL_MAX_LENGTH}자 이하의 http/https URL 이어야 합니다.",
            )
        )
        return None
    return url


def _parse_as_of_date(raw: object, kind: SourceKind | None, errors: list[RowError]) -> date | None:
    if _is_blank(raw):
        if kind is SourceKind.EXTERNAL:
            errors.append(
                RowError(RowErrorCode.AS_OF_DATE_MISSING, "as_of_date", "외부 출처는 기준 날짜가 필요합니다.")
            )
        return None
    try:
        return _to_date(_require_string(raw, "YYYY-MM-DD 형식 날짜"))
    except _ConversionError as error:
        errors.append(RowError(RowErrorCode.AS_OF_DATE_INVALID, "as_of_date", str(error)))
        return None


def _mark_duplicate_keys(results: list[RowResult]) -> None:
    # 같은 입력 안에서 key 가 겹치면 어느 쪽이 맞는지 엔진이 정할 수 없으므로 겹친 행 모두에 오류를 단다.
    positions_by_key: dict[str, list[int]] = defaultdict(list)
    for position, result in enumerate(results):
        if result.row_key is not None:
            positions_by_key[result.row_key].append(position)

    for row_key, positions in positions_by_key.items():
        if len(positions) < 2:
            continue
        row_numbers = ", ".join(str(position + 1) for position in positions)
        for position in positions:
            results[position].errors.append(
                RowError(RowErrorCode.DUPLICATE_KEY, None, f"key '{row_key}' 가 {row_numbers}번째 행에서 겹칩니다.")
            )
