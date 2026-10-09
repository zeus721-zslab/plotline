import json
from collections.abc import Callable

import pytest

from app.data_core.bundle import (
    AS_OF_DATE_NAME,
    MAX_PAYLOAD_LENGTH,
    MAX_ROW_COUNT,
    SOURCE_KIND_NAME,
    SOURCE_URL_NAME,
    BundleDataset,
    BundleError,
    parse_bundle,
)
from app.data_core.field_definition import RESERVED_FIELD_NAMES

FIELDS = [{"name": "symbol", "type": "text", "key": True}]
ROW = {
    "symbol": "Fe",
    "source_kind": "external",
    "source_url": "https://example.org/fe",
    "as_of_date": "2026-10-01",
}


def _problems_of(payload: str) -> list[str]:
    with pytest.raises(BundleError) as caught:
        parse_bundle(payload)
    return caught.value.problems


@pytest.mark.parametrize(
    "wrap",
    [
        pytest.param(lambda text: text, id="no-fence"),
        pytest.param(lambda text: f"```json\n{text}\n```", id="json-fence"),
        pytest.param(lambda text: f"  \n```\r\n{text}\r\n```\n\n", id="plain-fence-crlf-spaces"),
    ],
)
def test_bundle_with_or_without_code_fence_is_parsed(wrap: Callable[[str], str]) -> None:
    payload = wrap(json.dumps({"fields": FIELDS, "rows": [ROW]}))

    bundle = parse_bundle(payload)

    assert bundle.fields == FIELDS
    assert len(bundle.rows) == 1


def test_text_around_fence_is_not_cleaned() -> None:
    # 펜스 앞에 설명 문장이 있으면 펜스로 보지 않는다(그 밖의 정리는 하지 않음).
    payload = f"결과입니다.\n```json\n{json.dumps({'rows': [ROW]})}\n```"

    problems = _problems_of(payload)

    assert len(problems) == 1
    assert problems[0].startswith("JSON 으로 읽을 수 없습니다")


def test_fields_may_be_omitted() -> None:
    bundle = parse_bundle(json.dumps({"rows": [ROW]}))

    assert bundle.fields_given is False
    assert bundle.fields is None


def test_explicit_null_fields_is_not_treated_as_omitted() -> None:
    # 키가 있으면 null 이라도 정의로 넘겨 서비스의 정의 검사가 판정하게 한다(조용히 최신 정의를 쓰지 않음).
    bundle = parse_bundle(json.dumps({"fields": None, "rows": [ROW]}))

    assert bundle.fields_given is True
    assert bundle.fields is None


def test_source_columns_are_split_from_values() -> None:
    assert {SOURCE_KIND_NAME, SOURCE_URL_NAME, AS_OF_DATE_NAME} == RESERVED_FIELD_NAMES

    row = parse_bundle(json.dumps({"rows": [ROW]})).rows[0]

    assert dict(row.values) == {"symbol": "Fe"}
    assert row.source_kind == "external"
    assert row.source_url == "https://example.org/fe"
    assert row.as_of_date == "2026-10-01"


def test_missing_source_columns_become_none() -> None:
    row = parse_bundle(json.dumps({"rows": [{"symbol": "Fe"}]})).rows[0]

    assert (row.source_kind, row.source_url, row.as_of_date) == (None, None, None)


def test_unknown_top_level_key_is_rejected() -> None:
    problems = _problems_of(json.dumps({"rows": [ROW], "notes": "x", "meta": {}}))

    assert problems == ["허용하지 않는 key 가 있습니다: 'meta', 'notes' ('dataset' · 'fields' · 'rows' 만 허용)."]


@pytest.mark.parametrize(
    ("document", "expected"),
    [
        pytest.param({"fields": FIELDS}, "'rows' 가 없습니다.", id="missing"),
        pytest.param({"rows": []}, "'rows' 는 비어 있지 않은 배열이어야 합니다.", id="empty"),
        pytest.param({"rows": {"symbol": "Fe"}}, "'rows' 는 비어 있지 않은 배열이어야 합니다.", id="not-array"),
        pytest.param(
            {"rows": [ROW] * (MAX_ROW_COUNT + 1)},
            f"'rows' 는 최대 {MAX_ROW_COUNT}개 항목입니다({MAX_ROW_COUNT + 1}개).",
            id="too-many",
        ),
        pytest.param({"rows": [ROW, "Fe", 3]}, "'rows' 의 항목은 객체여야 합니다(2, 3번째).", id="not-object"),
    ],
)
def test_rows_shape_problems(document: dict[str, object], expected: str) -> None:
    assert _problems_of(json.dumps(document)) == [expected]


def test_max_row_count_is_accepted() -> None:
    bundle = parse_bundle(json.dumps({"rows": [ROW] * MAX_ROW_COUNT}))

    assert len(bundle.rows) == MAX_ROW_COUNT


@pytest.mark.parametrize("payload", ["[]", '"rows"', "null"])
def test_top_level_must_be_object(payload: str) -> None:
    assert _problems_of(payload) == ['묶음은 {"dataset": {...}, "fields": [...], "rows": [...]} 형태의 JSON 객체여야 합니다.']


def test_invalid_json_is_reported() -> None:
    problems = _problems_of('{"rows": [}')

    assert len(problems) == 1
    assert problems[0].startswith("JSON 으로 읽을 수 없습니다")


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param('{"rows": [{"year": ' + "1" * 5000 + "}]}", id="too-many-digits"),
        pytest.param("[" * 100_000 + "]" * 100_000, id="too-deep"),
    ],
)
def test_unparseable_json_beyond_decoder_limits_is_reported(payload: str) -> None:
    assert _problems_of(payload) == ["JSON 으로 읽을 수 없습니다(너무 긴 숫자 또는 너무 깊은 중첩)."]


def test_payload_length_limit() -> None:
    problems = _problems_of(" " * (MAX_PAYLOAD_LENGTH + 1))

    assert problems == [f"붙여넣은 내용이 {MAX_PAYLOAD_LENGTH:,}자를 넘습니다."]


def test_multiple_problems_are_reported_together() -> None:
    problems = _problems_of(json.dumps({"rows": [], "extra": 1}))

    assert problems == [
        "허용하지 않는 key 가 있습니다: 'extra' ('dataset' · 'fields' · 'rows' 만 허용).",
        "'rows' 는 비어 있지 않은 배열이어야 합니다.",
    ]


def test_fields_content_is_not_checked_here() -> None:
    # 정의 검사는 서비스(parse_field_definitions)가 한다. 묶음 해석은 원문 그대로 넘긴다.
    bundle = parse_bundle(json.dumps({"fields": "not a list", "rows": [ROW]}))

    assert bundle.fields == "not a list"


# --- dataset 머리 ---

SLUG_PROBLEM = "'dataset' 의 'slug' 는 영문 소문자 · 숫자와 - · _ 로 된 64자 이하 이름이어야 합니다."
TITLE_PROBLEM = "'dataset' 의 'title' 은 1~200자 글자여야 합니다."


def test_dataset_head_is_parsed_with_trimmed_title() -> None:
    bundle = parse_bundle(json.dumps({"dataset": {"slug": "element-discovery", "title": "  원소 발견사 "}, "rows": [ROW]}))

    assert bundle.dataset == BundleDataset(slug="element-discovery", title="원소 발견사")


def test_dataset_head_may_be_omitted() -> None:
    assert parse_bundle(json.dumps({"rows": [ROW]})).dataset is None


@pytest.mark.parametrize(
    ("dataset", "expected"),
    [
        pytest.param({"title": "원소"}, [SLUG_PROBLEM], id="missing-slug"),
        pytest.param({"slug": "elements"}, [TITLE_PROBLEM], id="missing-title"),
        pytest.param({"slug": "elements", "title": "   "}, [TITLE_PROBLEM], id="blank-title"),
        pytest.param({"slug": "Elements", "title": "원소"}, [SLUG_PROBLEM], id="uppercase-slug"),
        pytest.param({"slug": "elements\n", "title": "원소"}, [SLUG_PROBLEM], id="trailing-newline-slug"),
        pytest.param({"slug": "a" * 65, "title": "원소"}, [SLUG_PROBLEM], id="too-long-slug"),
        pytest.param(
            {"slug": "elements", "title": "원소", "note": "x"},
            ["'dataset' 에 허용하지 않는 key 가 있습니다: 'note' ('slug' · 'title' 만 허용)."],
            id="unknown-key",
        ),
        pytest.param(
            "elements", ['\'dataset\' 은 {"slug": ..., "title": ...} 형태의 객체여야 합니다.'], id="not-object"
        ),
    ],
)
def test_dataset_head_problems(dataset: object, expected: list[str]) -> None:
    assert _problems_of(json.dumps({"dataset": dataset, "rows": [ROW]})) == expected


def test_dataset_problems_are_reported_with_other_problems() -> None:
    problems = _problems_of(json.dumps({"dataset": {"slug": "Bad"}, "rows": []}))

    assert problems == [SLUG_PROBLEM, TITLE_PROBLEM, "'rows' 는 비어 있지 않은 배열이어야 합니다."]
