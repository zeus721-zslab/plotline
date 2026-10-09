"""붙여넣기 묶음 해석(순수 함수, DB 접근 없음).

묶음은 {"dataset"?: {...}, "fields"?: [...], "rows": [...]} JSON 하나다. 형식 문제를 모두 모아 BundleError 로 한 번에 돌려준다.
정의(fields) 자체의 검사는 하지 않는다(서비스가 parse_field_definitions 로 한다).
"""

import json
import re
from dataclasses import dataclass

from app.data_core.field_definition import RESERVED_FIELD_NAMES
from app.data_core.models import SLUG_MAX_LENGTH, SLUG_PATTERN, TITLE_MAX_LENGTH
from app.data_core.row_validation import RowInput

MAX_PAYLOAD_LENGTH = 2_000_000
MAX_ROW_COUNT = 2000
# json.loads 의 재귀 한도는 환경(스택 크기)마다 달라 결정적이지 않다. 해석 전에 직접 깊이를 세어 상한을 고정한다.
MAX_JSON_DEPTH = 20
# 객체가 아닌 행 번호를 문제 문장에 몇 개까지 적을지(수천 개가 한 문장에 늘어서지 않게).
MAX_LISTED_POSITIONS = 10
DATASET_KEY = "dataset"
FIELDS_KEY = "fields"
ROWS_KEY = "rows"
ALLOWED_KEYS = frozenset({DATASET_KEY, FIELDS_KEY, ROWS_KEY})
DATASET_SLUG_KEY = "slug"
DATASET_TITLE_KEY = "title"
DATASET_ALLOWED_KEYS = frozenset({DATASET_SLUG_KEY, DATASET_TITLE_KEY})
SLUG_REGEX = re.compile(SLUG_PATTERN)
CODE_FENCE = "```"
# 여는 펜스 뒤에 허용하는 언어 표기. 그 밖의 표기는 펜스로 보지 않고 그대로 JSON 해석에 넘긴다.
FENCE_LANGUAGES = frozenset({"", "json"})
SOURCE_KIND_NAME = "source_kind"
SOURCE_URL_NAME = "source_url"
AS_OF_DATE_NAME = "as_of_date"


@dataclass(frozen=True)
class BundleDataset:
    """묶음 머리의 대상 데이터 묶음. title 은 앞뒤 공백을 지운 값."""

    slug: str
    title: str


@dataclass(frozen=True)
class Bundle:
    # 묶음에 dataset 키가 없으면 None(작업 페이지에서는 대상이 주소로 정해진다).
    dataset: BundleDataset | None
    # fields_given False: 묶음에 fields 키가 없음(최신 정의를 쓴다). 키가 있으면 값(null 포함)을 검사 전 원문 그대로 둔다.
    fields_given: bool
    fields: object
    rows: list[RowInput]


class BundleError(ValueError):
    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def parse_bundle(payload: str) -> Bundle:
    if len(payload) > MAX_PAYLOAD_LENGTH:
        raise BundleError([f"붙여넣은 내용이 {MAX_PAYLOAD_LENGTH:,}자를 넘습니다."])

    text = _strip_code_fence(payload.strip())
    if _json_depth_exceeds(text, MAX_JSON_DEPTH):
        raise BundleError([f"JSON 중첩이 너무 깊습니다(최대 {MAX_JSON_DEPTH}단계)."])
    try:
        document = json.loads(text)
    except json.JSONDecodeError as error:
        raise BundleError([f"JSON 으로 읽을 수 없습니다({error.lineno}번째 줄 {error.colno}번째 글자)."]) from error
    except (ValueError, RecursionError) as error:
        # JSONDecodeError 가 아닌 해석 실패: 정수 자릿수 상한(4300자리) 초과 · 위 깊이 검사를 피한 그 밖의 과도한 중첩(방어).
        raise BundleError(["JSON 으로 읽을 수 없습니다(너무 긴 숫자 또는 너무 깊은 중첩)."]) from error
    if not isinstance(document, dict):
        raise BundleError(['묶음은 {"dataset": {...}, "fields": [...], "rows": [...]} 형태의 JSON 객체여야 합니다.'])

    problems: list[str] = []
    unknown_keys = sorted(key for key in document if key not in ALLOWED_KEYS)
    if unknown_keys:
        listed = ", ".join(f"'{key}'" for key in unknown_keys)
        problems.append(f"허용하지 않는 key 가 있습니다: {listed} ('dataset' · 'fields' · 'rows' 만 허용).")
    dataset = _parse_dataset(document.get(DATASET_KEY), DATASET_KEY in document, problems)
    rows = _parse_rows(document.get(ROWS_KEY), ROWS_KEY in document, problems)
    if problems:
        raise BundleError(problems)
    return Bundle(dataset=dataset, fields_given=FIELDS_KEY in document, fields=document.get(FIELDS_KEY), rows=rows)


def _json_depth_exceeds(text: str, limit: int) -> bool:
    """문자열 리터럴 안의 { [ } ] 는 세지 않고 중첩 깊이의 최대값이 limit 을 넘는지만 본다."""
    depth = 0
    in_string = False
    escaped = False
    for character in text:
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character in "{[":
            depth += 1
            if depth > limit:
                return True
        elif character in "}]":
            depth -= 1
    return False


def _strip_code_fence(text: str) -> str:
    """전체가 코드 펜스 1개로 감싸여 있을 때만 벗긴다. 그 밖의 정리는 하지 않는다."""
    lines = text.split("\n")
    if len(lines) < 2:
        return text
    first = lines[0].strip()
    last = lines[-1].strip()
    if not first.startswith(CODE_FENCE) or last != CODE_FENCE:
        return text
    if first.removeprefix(CODE_FENCE).strip().lower() not in FENCE_LANGUAGES:
        return text
    return "\n".join(lines[1:-1])


def _parse_dataset(raw_dataset: object, present: bool, problems: list[str]) -> BundleDataset | None:
    """dataset 머리 형식 검사. 문제는 problems 에 모으고 None 을 돌려준다(다른 형식 문제와 함께 알리기 위해)."""
    if not present:
        return None
    if not isinstance(raw_dataset, dict):
        problems.append('\'dataset\' 은 {"slug": ..., "title": ...} 형태의 객체여야 합니다.')
        return None

    problem_count = len(problems)
    unknown_keys = sorted(key for key in raw_dataset if key not in DATASET_ALLOWED_KEYS)
    if unknown_keys:
        listed = ", ".join(f"'{key}'" for key in unknown_keys)
        problems.append(f"'dataset' 에 허용하지 않는 key 가 있습니다: {listed} ('slug' · 'title' 만 허용).")

    slug = raw_dataset.get(DATASET_SLUG_KEY)
    if not isinstance(slug, str) or len(slug) > SLUG_MAX_LENGTH or SLUG_REGEX.fullmatch(slug) is None:
        problems.append(
            f"'dataset' 의 'slug' 는 영문 소문자 · 숫자와 - · _ 로 된 {SLUG_MAX_LENGTH}자 이하 이름이어야 합니다."
        )
    raw_title = raw_dataset.get(DATASET_TITLE_KEY)
    title = raw_title.strip() if isinstance(raw_title, str) else ""
    if not title or len(title) > TITLE_MAX_LENGTH:
        problems.append(f"'dataset' 의 'title' 은 1~{TITLE_MAX_LENGTH}자 글자여야 합니다.")

    if len(problems) > problem_count or not isinstance(slug, str):
        return None
    return BundleDataset(slug=slug, title=title)


def _parse_rows(raw_rows: object, present: bool, problems: list[str]) -> list[RowInput]:
    if not present:
        problems.append("'rows' 가 없습니다.")
        return []
    if not isinstance(raw_rows, list) or not raw_rows:
        problems.append("'rows' 는 비어 있지 않은 배열이어야 합니다.")
        return []
    if len(raw_rows) > MAX_ROW_COUNT:
        problems.append(f"'rows' 는 최대 {MAX_ROW_COUNT}개 항목입니다({len(raw_rows)}개).")
        return []

    non_object_positions = [str(position + 1) for position, row in enumerate(raw_rows) if not isinstance(row, dict)]
    if non_object_positions:
        shown = ", ".join(non_object_positions[:MAX_LISTED_POSITIONS])
        more = "" if len(non_object_positions) <= MAX_LISTED_POSITIONS else f" 외 {len(non_object_positions) - MAX_LISTED_POSITIONS}개"
        problems.append(f"'rows' 의 항목은 객체여야 합니다({shown}번째{more}).")
        return []
    return [_to_row_input(row) for row in raw_rows]


def _to_row_input(raw_row: dict[str, object]) -> RowInput:
    values = {name: value for name, value in raw_row.items() if name not in RESERVED_FIELD_NAMES}
    return RowInput(
        values=values,
        source_kind=raw_row.get(SOURCE_KIND_NAME),
        source_url=raw_row.get(SOURCE_URL_NAME),
        as_of_date=raw_row.get(AS_OF_DATE_NAME),
    )
