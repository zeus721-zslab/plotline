"""붙여넣기 확인 · 저장 · 줄 검토 · 공개 제외 · 기록본 관리자 API 의 흐름 · 경계 테스트(실제 MariaDB = db-test).

묶음 형식 규칙은 test_bundle.py, 줄 검사는 test_row_validation.py, 줄 분류는 test_row_change.py(DB 없음)가 맡는다.
"""

import json

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin_imports import paste
from app.data_core.models import DataImport, Dataset, DatasetRow, DatasetSchema
from conftest import ALLOWED_ORIGIN, assert_row_invariant

pytestmark = pytest.mark.db

IMPORTS_PATH = "/api/admin/imports"
DATASETS_PATH = "/api/admin/datasets"
SLUG = "elements"
OTHER_SLUG = "other-set"
TITLE = "원소"
SOURCE_URL = "https://example.org/elements"
AS_OF = "2026-10-01"
LATER = "2026-10-09"

FIELDS: list[dict[str, object]] = [
    {"name": "symbol", "label": "기호", "type": "text", "key": True},
    {"name": "year", "type": "year"},
    {"name": "note", "type": "text"},
]
# FIELDS 에서 note 삭제 · origin(선택) 추가
CHANGED_FIELDS: list[dict[str, object]] = [
    {"name": "symbol", "label": "기호", "type": "text", "key": True},
    {"name": "year", "type": "year"},
    {"name": "origin", "type": "text"},
]


def row(symbol: str, year: object = 1800, as_of: str = AS_OF, **extra: object) -> dict[str, object]:
    return {
        "symbol": symbol,
        "year": year,
        "source_kind": "external",
        "source_url": SOURCE_URL,
        "as_of_date": as_of,
        **extra,
    }


def bundle(
    rows: list[dict[str, object]],
    fields: list[dict[str, object]] | None = None,
    slug: str | None = SLUG,
    title: str = TITLE,
) -> str:
    document: dict[str, object] = {"rows": rows}
    if slug is not None:
        document["dataset"] = {"slug": slug, "title": title}
    if fields is not None:
        document["fields"] = fields
    return json.dumps(document, ensure_ascii=False)


def preview(
    client: TestClient, headers: dict[str, str], payload: str, slug: str | None = None, source_type: str = "upload"
) -> httpx.Response:
    body: dict[str, object] = {"payload": payload, "source_type": source_type}
    if slug is not None:
        body["slug"] = slug
    return client.post(f"{IMPORTS_PATH}/preview", json=body, headers=headers)


def save(
    client: TestClient,
    headers: dict[str, str],
    payload: str,
    slug: str | None = None,
    *,
    create: bool | None = None,
    confirm: bool = True,
    source_type: str = "upload",
) -> httpx.Response:
    """create 를 주지 않으면 화면처럼 미리보기의 새 묶음 여부를 그대로 확정한다."""
    if create is None:
        previewed = preview(client, headers, payload, slug, source_type)
        create = previewed.status_code == 200 and previewed.json()["target"]["is_new"]
    body: dict[str, object] = {
        "payload": payload,
        "source_type": source_type,
        "create_dataset": create,
        "confirm_schema": confirm,
    }
    if slug is not None:
        body["slug"] = slug
    return client.post(IMPORTS_PATH, json=body, headers=headers)


def save_ok(
    client: TestClient, headers: dict[str, str], payload: str, slug: str | None = None, source_type: str = "upload"
) -> dict[str, object]:
    response = save(client, headers, payload, slug, source_type=source_type)
    assert response.status_code == 200, response.text
    return response.json()


def rows_in(client: TestClient, headers: dict[str, str], status: str, slug: str = SLUG) -> list[dict[str, object]]:
    response = client.get(f"{DATASETS_PATH}/{slug}/rows", params={"status": status}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["rows"]


def by_key(rows: list[dict[str, object]]) -> dict[object, dict[str, object]]:
    return {item["row_key"]: item for item in rows}


def approve_ids(client: TestClient, headers: dict[str, str], row_ids: list[object]) -> httpx.Response:
    return client.post(f"{DATASETS_PATH}/{SLUG}/rows/approve", json={"row_ids": row_ids}, headers=headers)


def approve_kind(client: TestClient, headers: dict[str, str], kind: str) -> httpx.Response:
    return client.post(f"{DATASETS_PATH}/{SLUG}/rows/approve-kind", json={"change_kind": kind}, headers=headers)


def next_version(client: TestClient, headers: dict[str, str]) -> dict[str, object]:
    return client.get(f"{DATASETS_PATH}/{SLUG}/versions/next", headers=headers).json()


def count_of(session: Session, model: type[DataImport] | type[DatasetRow] | type[DatasetSchema] | type[Dataset]) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def start_dataset(client: TestClient, headers: dict[str, str], rows: list[dict[str, object]]) -> None:
    """목록 붙여넣기로 새 묶음(FIELDS)을 만들고 오류 없는 줄을 모두 승인한다."""
    save_ok(client, headers, bundle(rows, fields=FIELDS))
    assert approve_kind(client, headers, "new").status_code == 200


# --- 인증 ---


@pytest.mark.parametrize(
    ("method", "path"),
    [
        pytest.param("POST", f"{IMPORTS_PATH}/preview", id="preview"),
        pytest.param("POST", IMPORTS_PATH, id="save"),
        pytest.param("POST", f"{DATASETS_PATH}/{SLUG}/rows/approve-kind", id="approve-kind"),
        pytest.param("POST", f"{DATASETS_PATH}/{SLUG}/exclusions", id="exclude"),
        pytest.param("DELETE", f"{DATASETS_PATH}/{SLUG}/exclusions", id="restore"),
        pytest.param("GET", f"{DATASETS_PATH}/{SLUG}/rows?status=excluded", id="rows"),
    ],
)
def test_routes_require_session(admin_client: TestClient, method: str, path: str) -> None:
    response = admin_client.request(method, path, json={}, headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("path", [IMPORTS_PATH, f"{IMPORTS_PATH}/preview"])
def test_paste_routes_require_origin(admin_client: TestClient, admin_headers: dict[str, str], path: str) -> None:
    without_origin = {name: value for name, value in admin_headers.items() if name != "Origin"}

    response = admin_client.post(path, json={"payload": bundle([row("Fe")], fields=FIELDS)}, headers=without_origin)

    assert response.status_code == 403


# --- 대상 ---


def test_create_flag_for_existing_dataset_is_refused(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    # 미리보기는 새 묶음이었는데 저장 전에 같은 주소 이름의 묶음이 생긴 경우(확인한 내용과 다름).
    start_dataset(admin_client, admin_headers, [row("Fe")])
    imports_before = count_of(db_session, DataImport)

    response = save(admin_client, admin_headers, bundle([row("Cu")], fields=CHANGED_FIELDS), create=True)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "concurrent_change"
    assert count_of(db_session, DataImport) == imports_before
    assert set(by_key(rows_in(admin_client, admin_headers, "approved"))) == {"Fe"}
    assert_row_invariant(db_session)


def test_new_dataset_preview_then_save_requires_create_flag(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    payload = bundle([row("Fe"), row("Cu")], fields=FIELDS)

    previewed = preview(admin_client, admin_headers, payload)
    refused = save(admin_client, admin_headers, payload, create=False)

    assert previewed.status_code == 200, previewed.text
    assert previewed.json()["target"] == {
        "slug": SLUG, "title": TITLE, "is_new": True, "title_differs": False, "bundle_title": TITLE
    }
    assert previewed.json()["schema"]["changed"] is True
    assert previewed.json()["schema"]["current_version"] is None
    assert previewed.headers["cache-control"] == "no-store"
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "dataset_confirmation_required"
    assert (count_of(db_session, Dataset), count_of(db_session, DatasetSchema), count_of(db_session, DataImport)) == (0, 0, 0)

    saved = save_ok(admin_client, admin_headers, payload)

    assert saved["saved"] is True
    assert saved["slug"] == SLUG
    detail = admin_client.get(f"{DATASETS_PATH}/{SLUG}", headers=admin_headers).json()
    assert detail["title"] == TITLE
    assert detail["schema"]["version"] == 1
    assert detail["counts"]["pending_new"] == 2
    assert_row_invariant(db_session)


def test_schema_change_requires_confirmation(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])

    response = save(admin_client, admin_headers, bundle([row("Fe")], fields=CHANGED_FIELDS), confirm=False)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "schema_confirmation_required"
    assert response.json()["detail"]["current_version"] == 1
    assert_row_invariant(db_session)


def test_list_paste_without_dataset_head_is_rejected(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    response = preview(admin_client, admin_headers, bundle([row("Fe")], fields=FIELDS, slug=None))

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "dataset_required"


def test_work_page_rejects_other_slug_and_accepts_missing_head(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])

    mismatch = preview(admin_client, admin_headers, bundle([row("Cu")], slug=OTHER_SLUG), slug=SLUG)
    headless = preview(admin_client, admin_headers, bundle([row("Cu")], slug=None), slug=SLUG)
    missing = preview(admin_client, admin_headers, bundle([row("Cu")], slug=None), slug="missing")

    assert mismatch.status_code == 422
    assert mismatch.json()["detail"]["code"] == "dataset_mismatch"
    assert headless.status_code == 200, headless.text
    assert headless.json()["target"]["slug"] == SLUG
    assert headless.json()["rows"]["new"] == 1
    assert missing.status_code == 404


def test_existing_dataset_keeps_title_when_bundle_title_differs(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    payload = bundle([row("Cu")], title="다른 제목")

    previewed = preview(admin_client, admin_headers, payload).json()
    save_ok(admin_client, admin_headers, payload)

    assert previewed["target"]["is_new"] is False
    assert previewed["target"]["title_differs"] is True
    assert previewed["target"]["title"] == TITLE
    assert admin_client.get(f"{DATASETS_PATH}/{SLUG}", headers=admin_headers).json()["title"] == TITLE
    assert_row_invariant(db_session)


def test_invalid_bundle_and_fields_return_problems(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    bad_bundle = preview(admin_client, admin_headers, json.dumps({"rows": [], "x": 1}))
    bad_fields = preview(admin_client, admin_headers, bundle([row("Fe")], fields=[{"name": "symbol", "type": "text"}]))
    no_schema = preview(admin_client, admin_headers, bundle([row("Fe")]))

    assert bad_bundle.status_code == 422
    assert bad_bundle.json()["detail"]["code"] == "invalid_bundle"
    assert len(bad_bundle.json()["detail"]["problems"]) == 2
    assert bad_fields.json()["detail"]["code"] == "invalid_fields"
    assert no_schema.json()["detail"]["code"] == "schema_missing"


# --- 줄 분류 · 미리보기와 저장 일치 ---


def test_preview_counts_match_saved_rows(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Cu"), row("Ag"), row("Pb")])
    payload = bundle(
        [
            row("Fe"),  # 변화 없음
            row("Cu", 1801),  # 값 바뀜
            row("Ag", as_of=LATER),  # 확인한 날만
            row("Zn"),  # 새 줄
            {"symbol": "Sn", "year": 1800, "source_kind": "external", "as_of_date": AS_OF},  # 오류(출처 링크 없음)
        ]
    )

    previewed = preview(admin_client, admin_headers, payload).json()
    imports_before = count_of(db_session, DataImport)
    saved = save_ok(admin_client, admin_headers, payload)

    expected = {"new": 1, "changed": 1, "as_of_only": 1, "unchanged": 1, "error": 1, "total": 5}
    assert previewed["rows"] == expected
    assert saved["rows"] == expected
    assert count_of(db_session, DataImport) == imports_before + 1
    pending = by_key(rows_in(admin_client, admin_headers, "pending"))
    assert {key: item["change_kind"] for key, item in pending.items()} == {
        "Cu": "changed", "Ag": "as_of_only", "Zn": "new", "Sn": "new"
    }
    assert pending["Sn"]["errors"] is not None
    # 이전 값은 같은 구분 칸의 승인 줄이다.
    assert pending["Cu"]["prev"]["data"]["year"] == 1800
    assert pending["Ag"]["prev"]["as_of_date"] == AS_OF
    assert pending["Zn"]["prev"] is None
    assert_row_invariant(db_session)


def test_only_unchanged_rows_save_nothing(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Cu")])
    imports_before = count_of(db_session, DataImport)
    rows_before = count_of(db_session, DatasetRow)

    result = save_ok(admin_client, admin_headers, bundle([row("Fe"), row("Cu")], fields=FIELDS))

    assert result["saved"] is False
    assert result["rows"]["unchanged"] == 2
    assert (count_of(db_session, DataImport), count_of(db_session, DatasetRow)) == (imports_before, rows_before)
    assert_row_invariant(db_session)


def test_newer_paste_supersedes_older_pending_and_error_rows(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    save_ok(admin_client, admin_headers, bundle([row("Fe", 1801), row("Cu", "오래전")]))
    first_pending = by_key(rows_in(admin_client, admin_headers, "pending"))

    save_ok(admin_client, admin_headers, bundle([row("Fe", 1802), row("Cu", 1700)]))

    pending = by_key(rows_in(admin_client, admin_headers, "pending"))
    superseded_ids = {item["id"] for item in rows_in(admin_client, admin_headers, "superseded")}
    assert {first_pending["Fe"]["id"], first_pending["Cu"]["id"]} <= superseded_ids
    assert pending["Fe"]["data"]["year"] == 1802
    assert pending["Cu"]["errors"] is None
    assert_row_invariant(db_session)


# --- 승인 · 제외 ---


def test_approving_new_row_supersedes_old_approved_row(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    old_fe = by_key(rows_in(admin_client, admin_headers, "approved"))["Fe"]
    save_ok(admin_client, admin_headers, bundle([row("Fe", 1801)]))
    new_fe = by_key(rows_in(admin_client, admin_headers, "pending"))["Fe"]

    response = approve_ids(admin_client, admin_headers, [new_fe["id"]])

    assert response.json() == {"approved": 1}
    assert [item["id"] for item in rows_in(admin_client, admin_headers, "approved")] == [new_fe["id"]]
    assert old_fe["id"] in {item["id"] for item in rows_in(admin_client, admin_headers, "superseded")}
    assert_row_invariant(db_session)


def test_approve_kind_approves_only_that_kind(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Cu")])
    save_ok(
        admin_client,
        admin_headers,
        bundle([row("Fe", 1801), row("Cu", as_of=LATER), row("Zn"), {"symbol": "Sn", "source_kind": "external"}]),
    )

    as_of_only = approve_kind(admin_client, admin_headers, "as_of_only")
    new = approve_kind(admin_client, admin_headers, "new")
    changed = approve_kind(admin_client, admin_headers, "changed")

    assert as_of_only.json() == {"approved": 1}
    # Sn 은 새 줄이지만 오류가 있어 승인되지 않는다.
    assert new.json() == {"approved": 1}
    assert changed.status_code == 422
    assert set(by_key(rows_in(admin_client, admin_headers, "pending"))) == {"Fe", "Sn"}
    approved = by_key(rows_in(admin_client, admin_headers, "approved"))
    assert approved["Cu"]["as_of_date"] == LATER
    assert set(approved) == {"Fe", "Cu", "Zn"}
    assert approved["Fe"]["data"]["year"] == 1800
    assert_row_invariant(db_session)


def test_other_dataset_rows_are_not_touched(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    save_ok(admin_client, admin_headers, bundle([row("Zn")], fields=FIELDS, slug=OTHER_SLUG))
    zn = by_key(rows_in(admin_client, admin_headers, "pending", slug=OTHER_SLUG))["Zn"]
    fe = by_key(rows_in(admin_client, admin_headers, "approved"))["Fe"]

    approved = approve_ids(admin_client, admin_headers, [zn["id"]])
    rejected = admin_client.post(f"{DATASETS_PATH}/{SLUG}/rows/{zn['id']}/reject", json={"reason": "x"}, headers=admin_headers)
    excluded = admin_client.post(
        f"{DATASETS_PATH}/{OTHER_SLUG}/exclusions", json={"row_key": fe["row_key"]}, headers=admin_headers
    )

    assert approved.json() == {"approved": 0}
    assert rejected.status_code == 404
    assert excluded.status_code == 404
    assert by_key(rows_in(admin_client, admin_headers, "pending", slug=OTHER_SLUG))["Zn"]["status"] == "pending"
    assert_row_invariant(db_session)


def test_reject_only_pending_with_reason(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    save_ok(admin_client, admin_headers, bundle([row("Cu")]))
    cu = by_key(rows_in(admin_client, admin_headers, "pending"))["Cu"]
    fe = by_key(rows_in(admin_client, admin_headers, "approved"))["Fe"]
    path = f"{DATASETS_PATH}/{SLUG}/rows"

    blank = admin_client.post(f"{path}/{cu['id']}/reject", json={"reason": "   "}, headers=admin_headers)
    rejected = admin_client.post(f"{path}/{cu['id']}/reject", json={"reason": "  출처 확인 불가 "}, headers=admin_headers)
    approved_row = admin_client.post(f"{path}/{fe['id']}/reject", json={"reason": "x"}, headers=admin_headers)

    assert blank.status_code == 422
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["reject_reason"] == "출처 확인 불가"
    assert approved_row.status_code == 409
    assert approved_row.json()["detail"]["code"] == "row_not_pending"
    assert_row_invariant(db_session)


def test_invariant_holds_across_repeated_pastes_and_approvals(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Cu")])
    for year in (1801, 1802, 1803):
        save_ok(admin_client, admin_headers, bundle([row("Fe", year), row("Cu", year), row("Ag", year)]))
        assert_row_invariant(db_session)
        pending_ids = [item["id"] for item in rows_in(admin_client, admin_headers, "pending")]
        approve_ids(admin_client, admin_headers, pending_ids[:2])
        assert_row_invariant(db_session)

    approved = by_key(rows_in(admin_client, admin_headers, "approved"))
    pending = by_key(rows_in(admin_client, admin_headers, "pending"))
    # Ag 는 승인하지 않아 매번 새 대기 줄이 옛 대기 줄을 대체한다.
    assert {key: item["data"]["year"] for key, item in approved.items()} == {"Fe": 1803, "Cu": 1803}
    assert {key: item["data"]["year"] for key, item in pending.items()} == {"Ag": 1803}


# --- 구조 이월 ---


def test_schema_change_carries_approved_rows(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe", note="철"), row("Cu"), row("Ag")])
    originals = by_key(rows_in(admin_client, admin_headers, "approved"))
    # year 를 필수로 바꾸고 Ag 줄의 year 를 비우면 이월 검사에서 걸린다.
    strict_fields = [dict(field) for field in CHANGED_FIELDS]
    strict_fields[1] = {"name": "year", "type": "year", "required": True}
    db_session.execute(
        DatasetRow.__table__.update().where(DatasetRow.id == originals["Ag"]["id"]).values(data={"symbol": "Ag", "year": None, "note": None})
    )
    payload = bundle([row("Zn")], fields=strict_fields)

    previewed = preview(admin_client, admin_headers, payload).json()
    saved = save_ok(admin_client, admin_headers, payload)

    assert previewed["schema"]["added"] == ["origin"]
    assert previewed["schema"]["removed"] == ["note"]
    assert previewed["schema"]["modified"] == ["year"]
    assert (previewed["schema"]["carry_approved"], previewed["schema"]["carry_pending"]) == (2, 1)
    assert (saved["carry_approved"], saved["carry_pending"]) == (2, 1)
    approved = by_key(rows_in(admin_client, admin_headers, "approved"))
    assert set(approved) == {"Fe", "Cu"}
    # 삭제된 필드 값은 버리고 새 필드는 비운다. 출처는 그대로.
    assert approved["Fe"]["data"] == {"symbol": "Fe", "year": 1800, "origin": None}
    assert approved["Fe"]["change_kind"] == "carried"
    assert approved["Fe"]["source_url"] == SOURCE_URL
    assert approved["Fe"]["prev"]["data"]["note"] == "철"
    pending = by_key(rows_in(admin_client, admin_headers, "pending"))
    assert pending["Ag"]["change_kind"] == "carried"
    assert pending["Ag"]["errors"] is not None
    assert pending["Zn"]["change_kind"] == "new"
    superseded_ids = {item["id"] for item in rows_in(admin_client, admin_headers, "superseded")}
    assert {item["id"] for item in originals.values()} <= superseded_ids
    detail = admin_client.get(f"{DATASETS_PATH}/{SLUG}", headers=admin_headers).json()
    assert (detail["counts"]["pending_error"], detail["counts"]["pending_carry_failed"]) == (1, 1)
    # 이월 줄은 이번 입력(새 구조)의 줄이라 기록본 후보에 그대로 든다.
    assert next_version(admin_client, admin_headers)["row_count"] == 2
    assert_row_invariant(db_session)


def test_paste_under_schema_change_compares_with_carried_row(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Cu")])

    saved = save_ok(admin_client, admin_headers, bundle([row("Fe")], fields=CHANGED_FIELDS))

    # 값이 같아도 구조가 바뀐 입력이라 건너뛰지 않는다. 비교 상대는 이월 결과 줄이다.
    assert saved["rows"]["changed"] == 1
    pending_fe = by_key(rows_in(admin_client, admin_headers, "pending"))["Fe"]
    approved_fe = by_key(rows_in(admin_client, admin_headers, "approved"))["Fe"]
    assert approved_fe["change_kind"] == "carried"
    assert pending_fe["prev"]["data"] == approved_fe["data"]
    assert_row_invariant(db_session)


def test_carry_refuses_when_original_was_superseded_after_planning(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    real_plan = paste._plan_import

    def plan_then_supersede(*arguments: object) -> object:
        # 계획과 저장 사이에 다른 승인이 원본 승인 줄을 대체한 상황을 재현한다.
        plan = real_plan(*arguments)
        db_session.execute(DatasetRow.__table__.update().where(DatasetRow.row_key == "Fe").values(status="superseded"))
        return plan

    monkeypatch.setattr(paste, "_plan_import", plan_then_supersede)

    response = save(admin_client, admin_headers, bundle([row("Cu")], fields=CHANGED_FIELDS), create=False)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "concurrent_change"
    assert count_of(db_session, DatasetSchema) == 1
    assert_row_invariant(db_session)


def test_schema_change_supersedes_old_schema_pending_rows(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    # 승인 줄 없는 구분 칸의 대기 줄(Cu) · 구분 칸 없는 오류 줄 · 승인 줄 있는 구분 칸의 대기 줄(Fe)
    save_ok(admin_client, admin_headers, bundle([row("Cu"), {"year": 1700, "source_kind": "external"}, row("Fe", 1801)]))
    old_pending_ids = {item["id"] for item in rows_in(admin_client, admin_headers, "pending")}
    assert len(old_pending_ids) == 3
    payload = bundle([row("Zn")], fields=CHANGED_FIELDS)

    previewed = preview(admin_client, admin_headers, payload).json()
    saved = save_ok(admin_client, admin_headers, payload)

    assert previewed["schema"]["old_pending_superseded"] == 3
    assert saved["old_pending_superseded"] == 3
    superseded_ids = {item["id"] for item in rows_in(admin_client, admin_headers, "superseded")}
    assert old_pending_ids <= superseded_ids
    # 이번 입력의 줄(새 줄 Zn)만 대기로 남는다. Fe 는 이월 결과 줄이 승인으로 남는다.
    pending = rows_in(admin_client, admin_headers, "pending")
    assert [item["row_key"] for item in pending] == ["Zn"]
    assert set(by_key(rows_in(admin_client, admin_headers, "approved"))) == {"Fe"}
    assert_row_invariant(db_session)


def test_schema_change_keeps_this_paste_carry_failed_rows_pending(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Ag")])
    ag_id = by_key(rows_in(admin_client, admin_headers, "approved"))["Ag"]["id"]
    db_session.execute(
        DatasetRow.__table__.update().where(DatasetRow.id == ag_id).values(data={"symbol": "Ag", "year": None, "note": None})
    )
    save_ok(admin_client, admin_headers, bundle([row("Cu")]))
    strict_fields = [dict(field) for field in CHANGED_FIELDS]
    strict_fields[1] = {"name": "year", "type": "year", "required": True}

    saved = save_ok(admin_client, admin_headers, bundle([row("Zn", "오래전")], fields=strict_fields))

    # 옛 구조 대기 줄(Cu)만 대체된다. 이번 입력의 이월 실패 줄(Ag) · 오류 줄(Zn)은 대기로 남는다.
    assert saved["old_pending_superseded"] == 1
    assert "Cu" in by_key(rows_in(admin_client, admin_headers, "superseded"))
    pending = by_key(rows_in(admin_client, admin_headers, "pending"))
    assert set(pending) == {"Ag", "Zn"}
    assert pending["Ag"]["change_kind"] == "carried"
    assert_row_invariant(db_session)


def test_paste_without_schema_change_keeps_other_pending_rows(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    save_ok(admin_client, admin_headers, bundle([row("Cu"), {"year": 1700, "source_kind": "external"}]))
    old_pending_ids = {item["id"] for item in rows_in(admin_client, admin_headers, "pending")}
    payload = bundle([row("Zn")])

    previewed = preview(admin_client, admin_headers, payload).json()
    saved = save_ok(admin_client, admin_headers, payload)

    assert previewed["schema"]["old_pending_superseded"] == 0
    assert saved["old_pending_superseded"] == 0
    pending_ids = {item["id"] for item in rows_in(admin_client, admin_headers, "pending")}
    assert old_pending_ids < pending_ids
    assert_row_invariant(db_session)


def test_schema_change_refuses_when_old_pending_changed_after_planning(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    save_ok(admin_client, admin_headers, bundle([row("Cu")]))
    real_plan = paste._plan_import

    def plan_then_reject(*arguments: object) -> object:
        # 계획과 저장 사이에 다른 요청이 옛 구조 대기 줄을 제외한 상황을 재현한다. 같은 세션 안의 변경이라
        # InnoDB 스냅샷 · 현재 읽기 차이는 재현하지 않고, rowcount 불일치 → 거절 분기만 확인한다.
        plan = real_plan(*arguments)
        db_session.execute(DatasetRow.__table__.update().where(DatasetRow.row_key == "Cu").values(status="rejected"))
        return plan

    monkeypatch.setattr(paste, "_plan_import", plan_then_reject)

    response = save(admin_client, admin_headers, bundle([row("Zn")], fields=CHANGED_FIELDS), create=False)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "concurrent_change"
    assert count_of(db_session, DatasetSchema) == 1
    assert count_of(db_session, DataImport) == 2
    assert by_key(rows_in(admin_client, admin_headers, "pending"))["Cu"]["status"] == "pending"
    assert_row_invariant(db_session)


def test_approval_skips_rows_from_old_schema_imports(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])
    save_ok(admin_client, admin_headers, bundle([row("Cu")]))
    cu_id = by_key(rows_in(admin_client, admin_headers, "pending"))["Cu"]["id"]
    save_ok(admin_client, admin_headers, bundle([row("Fe")], fields=CHANGED_FIELDS))
    # 구조 변경 저장이 대체한 옛 구조 대기 줄을 직접 대기로 되돌려 남겨 둔다.
    db_session.execute(DatasetRow.__table__.update().where(DatasetRow.id == cu_id).values(status="pending"))

    by_id = approve_ids(admin_client, admin_headers, [cu_id])
    by_kind = approve_kind(admin_client, admin_headers, "new")

    assert by_id.json() == {"approved": 0}
    assert by_kind.json() == {"approved": 0}
    assert by_key(rows_in(admin_client, admin_headers, "pending"))["Cu"]["id"] == cu_id
    assert "Cu" not in by_key(rows_in(admin_client, admin_headers, "approved"))
    assert_row_invariant(db_session)


# CHANGED_FIELDS 에서 year 를 필수로(이월 실패 재현용) · 거기에 선택 필드 하나를 더한 구조(구조 변화를 한 번 더 만들 때)
STRICT_FIELDS: list[dict[str, object]] = [
    CHANGED_FIELDS[0],
    {"name": "year", "type": "year", "required": True},
    CHANGED_FIELDS[2],
]
STRICT_EXTRA_FIELDS: list[dict[str, object]] = [*STRICT_FIELDS, {"name": "extra", "type": "text"}]
EXTRA_FIELDS: list[dict[str, object]] = [*CHANGED_FIELDS, {"name": "extra", "type": "text"}]


def clear_year(session: Session, row_id: object) -> None:
    session.execute(DatasetRow.__table__.update().where(DatasetRow.id == row_id).values(data={"symbol": "Ag", "year": None}))


def schema_counts(response: dict[str, object]) -> tuple[object, ...]:
    keys = ("carry_approved", "carry_pending", "carry_retry_approved", "carry_retry_pending", "old_pending_superseded")
    return tuple(response[key] for key in keys)


def test_schema_change_retries_carry_failed_rows(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Ag")])
    clear_year(db_session, by_key(rows_in(admin_client, admin_headers, "approved"))["Ag"]["id"])
    # 1차 구조 변화: Ag 는 year 필수에 걸려 이월 실패(오류 대기)가 된다.
    first = save_ok(admin_client, admin_headers, bundle([row("Zn")], fields=STRICT_FIELDS))
    failed_ag = by_key(rows_in(admin_client, admin_headers, "pending"))["Ag"]
    # 2차 구조 변화(여전히 year 필수): 승인 줄 없는 구분 칸의 이월 실패 줄을 다시 이월해 또 오류 대기가 된다.
    second_payload = bundle([row("Zn")], fields=STRICT_EXTRA_FIELDS)
    second_preview = preview(admin_client, admin_headers, second_payload).json()["schema"]
    second = save_ok(admin_client, admin_headers, second_payload)
    retried_ag = by_key(rows_in(admin_client, admin_headers, "pending"))["Ag"]
    assert_row_invariant(db_session)
    # 3차 구조 변화(year 선택): 다시 이월한 줄이 통과해 승인으로 이어진다.
    third_payload = bundle([row("Zn")], fields=EXTRA_FIELDS)
    third_preview = preview(admin_client, admin_headers, third_payload).json()["schema"]
    third = save_ok(admin_client, admin_headers, third_payload)

    assert schema_counts(first) == (1, 1, 0, 0, 0)
    # 옛 구조 대기 줄 대체 수에는 다시 이월하는 원본(Ag)이 빠지고 Zn 만 센다.
    assert schema_counts(second_preview) == schema_counts(second) == (1, 0, 0, 1, 1)
    assert schema_counts(third_preview) == schema_counts(third) == (1, 0, 1, 0, 1)
    assert retried_ag["change_kind"] == "carried"
    assert retried_ag["errors"] is not None
    assert retried_ag["id"] != failed_ag["id"]
    approved = by_key(rows_in(admin_client, admin_headers, "approved"))
    assert set(approved) == {"Fe", "Ag"}
    assert approved["Ag"]["change_kind"] == "carried"
    # 다시 이월한 승인 줄의 이전 줄은 그 이월 실패 대기 줄이다.
    assert approved["Ag"]["prev"]["data"] == retried_ag["data"]
    superseded_ids = {item["id"] for item in rows_in(admin_client, admin_headers, "superseded")}
    assert {failed_ag["id"], retried_ag["id"]} <= superseded_ids
    assert set(by_key(rows_in(admin_client, admin_headers, "pending"))) == {"Zn"}
    assert_row_invariant(db_session)


def test_carry_retry_refuses_when_original_changed_after_planning(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Ag")])
    clear_year(db_session, by_key(rows_in(admin_client, admin_headers, "approved"))["Ag"]["id"])
    save_ok(admin_client, admin_headers, bundle([row("Fe")], fields=STRICT_FIELDS))
    failed_ag = by_key(rows_in(admin_client, admin_headers, "pending"))["Ag"]
    real_plan = paste._plan_import

    def plan_then_reject(*arguments: object) -> object:
        # 계획과 저장 사이에 다른 요청이 다시 이월할 원본(이월 실패 대기 줄)을 제외한 상황을 재현한다.
        plan = real_plan(*arguments)
        db_session.execute(DatasetRow.__table__.update().where(DatasetRow.id == failed_ag["id"]).values(status="rejected"))
        return plan

    monkeypatch.setattr(paste, "_plan_import", plan_then_reject)

    response = save(admin_client, admin_headers, bundle([row("Zn")], fields=STRICT_EXTRA_FIELDS), create=False)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "concurrent_change"
    assert count_of(db_session, DatasetSchema) == 2
    assert by_key(rows_in(admin_client, admin_headers, "pending"))["Ag"]["id"] == failed_ag["id"]
    assert_row_invariant(db_session)


def test_second_carry_uses_original_claude_rules(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    save_ok(admin_client, admin_headers, bundle([row("Fe")], fields=FIELDS), source_type="claude")
    approve_kind(admin_client, admin_headers, "new")
    # 1차 이월은 upload 붙여넣기로 일으킨다(이월 줄의 입력 경로가 upload 가 된다).
    save_ok(admin_client, admin_headers, bundle([row("Zn")], fields=CHANGED_FIELDS))
    carried_fe = by_key(rows_in(admin_client, admin_headers, "approved"))["Fe"]
    # 직접 작성 출처는 claude 경로에서만 막힌다. 원래 경로(claude)로 검사하면 2차 이월에서 걸려야 한다.
    db_session.execute(DatasetRow.__table__.update().where(DatasetRow.id == carried_fe["id"]).values(source_kind="self"))

    saved = save_ok(admin_client, admin_headers, bundle([row("Zn")], fields=EXTRA_FIELDS), source_type="claude")

    assert (saved["carry_approved"], saved["carry_pending"]) == (0, 1)
    fe = by_key(rows_in(admin_client, admin_headers, "pending"))["Fe"]
    assert fe["change_kind"] == "carried"
    assert [error["code"] for error in fe["errors"]] == ["self_not_allowed"]
    assert_row_invariant(db_session)


def test_second_carry_keeps_upload_self_rows(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    self_fe = {"symbol": "Fe", "year": 1800, "source_kind": "self"}
    start_dataset(admin_client, admin_headers, [self_fe])

    first = save_ok(admin_client, admin_headers, bundle([row("Zn")], fields=CHANGED_FIELDS), source_type="claude")
    second = save_ok(admin_client, admin_headers, bundle([row("Zn")], fields=EXTRA_FIELDS), source_type="claude")

    # 이월 줄의 입력 경로(claude)가 아니라 최초 입력 경로(upload)로 검사해 직접 작성 줄이 계속 통과한다.
    assert (first["carry_approved"], first["carry_pending"]) == (1, 0)
    assert (second["carry_approved"], second["carry_pending"]) == (1, 0)
    fe = by_key(rows_in(admin_client, admin_headers, "approved"))["Fe"]
    assert (fe["change_kind"], fe["source_kind"]) == ("carried", "self")
    assert_row_invariant(db_session)


def test_key_value_with_trailing_space_is_same_row_key(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])

    saved = save_ok(admin_client, admin_headers, bundle([row("Fe ", 1801)]))

    # 행 검사가 key 값을 strip 해 "Fe " 와 "Fe" 가 같은 구분 칸이 된다(새 줄이 아니라 바뀌는 줄).
    assert (saved["rows"]["new"], saved["rows"]["changed"]) == (0, 1)
    pending = rows_in(admin_client, admin_headers, "pending")
    assert [(item["row_key"], item["change_kind"]) for item in pending] == [("Fe", "changed")]
    assert_row_invariant(db_session)


class InjectedFailure(RuntimeError):
    pass


def test_failure_mid_save_rolls_back_new_dataset_and_schema(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail_after_rows_flush(*arguments: object) -> None:
        # 이 시점에 새 묶음 · 구조 · 입력 · 줄은 flush 되어 세션 안에 있다.
        assert count_of(db_session, Dataset) == 1
        raise InjectedFailure

    monkeypatch.setattr(paste, "_supersede_older_pending", fail_after_rows_flush)

    with pytest.raises(InjectedFailure):
        save(admin_client, admin_headers, bundle([row("Fe")], fields=FIELDS))

    assert (
        count_of(db_session, Dataset),
        count_of(db_session, DatasetSchema),
        count_of(db_session, DataImport),
        count_of(db_session, DatasetRow),
    ) == (0, 0, 0, 0)


# --- 공개 제외 ---


def exclusion(client: TestClient, headers: dict[str, str], method: str, row_key: str) -> httpx.Response:
    return client.request(method, f"{DATASETS_PATH}/{SLUG}/exclusions", json={"row_key": row_key}, headers=headers)


def test_exclusion_removes_key_from_version_plan_and_restore_returns_it(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Cu")])
    before = next_version(admin_client, admin_headers)["row_count"]

    added = exclusion(admin_client, admin_headers, "POST", "Fe")
    again = exclusion(admin_client, admin_headers, "POST", "Fe")
    excluded_plan = next_version(admin_client, admin_headers)["row_count"]
    excluded_rows = rows_in(admin_client, admin_headers, "excluded")
    approved = by_key(rows_in(admin_client, admin_headers, "approved"))
    detail = admin_client.get(f"{DATASETS_PATH}/{SLUG}", headers=admin_headers).json()
    restored = exclusion(admin_client, admin_headers, "DELETE", "Fe")
    restored_again = exclusion(admin_client, admin_headers, "DELETE", "Fe")

    assert (before, excluded_plan) == (2, 1)
    assert (added.status_code, again.status_code) == (204, 204)
    assert [item["row_key"] for item in excluded_rows] == ["Fe"]
    assert (approved["Fe"]["excluded"], approved["Cu"]["excluded"]) == (True, False)
    assert detail["counts"]["excluded_keys"] == 1
    assert restored.status_code == 204
    assert restored_again.status_code == 404
    assert restored_again.json()["detail"]["code"] == "exclusion_not_found"
    assert next_version(admin_client, admin_headers)["row_count"] == 2
    assert rows_in(admin_client, admin_headers, "excluded") == []
    assert_row_invariant(db_session)


def test_exclusion_needs_approved_key_and_paste_still_works(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])

    unknown = exclusion(admin_client, admin_headers, "POST", "Zz")
    exclusion(admin_client, admin_headers, "POST", "Fe")
    save_ok(admin_client, admin_headers, bundle([row("Fe", 1801)]))
    approve_ids(admin_client, admin_headers, [by_key(rows_in(admin_client, admin_headers, "pending"))["Fe"]["id"]])

    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "row_not_found"
    # 공개 제외 중에도 붙여넣기 · 승인은 평소대로이고, 새 승인 줄도 공개 제외 탭에 보인다.
    excluded = rows_in(admin_client, admin_headers, "excluded")
    assert [(item["row_key"], item["data"]["year"]) for item in excluded] == [("Fe", 1801)]
    assert next_version(admin_client, admin_headers)["row_count"] == 0
    assert_row_invariant(db_session)


# --- 줄 목록 · 기록본 ---


def test_rows_view_requires_known_status(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe")])

    missing = admin_client.get(f"{DATASETS_PATH}/{SLUG}/rows", headers=admin_headers)
    unknown = admin_client.get(f"{DATASETS_PATH}/{SLUG}/rows", params={"status": "replaced"}, headers=admin_headers)

    assert (missing.status_code, unknown.status_code) == (422, 422)


def test_rows_view_truncates_at_limit(
    admin_client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.admin_imports import service as imports_service

    save_ok(admin_client, admin_headers, bundle([row("Fe"), row("Cu"), row("Ag")], fields=FIELDS))
    # 2000줄을 실제로 넣지 않고 상한만 줄여 잘림 규칙을 확인한다.
    monkeypatch.setattr(imports_service, "ROWS_PAGE_LIMIT", 2)
    truncated = admin_client.get(f"{DATASETS_PATH}/{SLUG}/rows", params={"status": "pending"}, headers=admin_headers).json()
    monkeypatch.setattr(imports_service, "ROWS_PAGE_LIMIT", 3)
    exact = admin_client.get(f"{DATASETS_PATH}/{SLUG}/rows", params={"status": "pending"}, headers=admin_headers).json()

    assert (len(truncated["rows"]), truncated["truncated"]) == (2, True)
    assert (len(exact["rows"]), exact["truncated"]) == (3, False)


def test_version_preview_matches_created_version(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    start_dataset(admin_client, admin_headers, [row("Fe"), row("Cu")])
    versions_path = f"{DATASETS_PATH}/{SLUG}/versions"

    first = admin_client.post(versions_path, json={"note": "  첫 기록본 "}, headers=admin_headers)
    unchanged = admin_client.post(versions_path, json={}, headers=admin_headers)
    save_ok(admin_client, admin_headers, bundle([row("Fe", 1801), row("Ag")]))
    approve_ids(admin_client, admin_headers, [item["id"] for item in rows_in(admin_client, admin_headers, "pending")])
    previewed = next_version(admin_client, admin_headers)
    second = admin_client.post(versions_path, json={}, headers=admin_headers)

    assert first.status_code == 201, first.text
    assert (first.json()["version_no"], first.json()["row_count"], first.json()["note"]) == (1, 2, "첫 기록본")
    assert unchanged.json()["detail"]["code"] == "version_unchanged"
    # v1 = {Fe, Cu}. 다음 = {Fe(1801), Cu, Ag}: Cu 이어짐 · Fe·Ag 새로 · 옛 Fe 대체.
    assert previewed == {
        "next_version_no": 2, "row_count": 3, "carried": 1, "added": 2, "replaced": 1, "excluded": 0, "unchanged": False
    }
    assert (second.json()["version_no"], second.json()["row_count"]) == (2, 3)
    listed = admin_client.get(versions_path, headers=admin_headers).json()
    assert [(item["version_no"], item["row_count"]) for item in listed] == [(2, 3), (1, 2)]
    assert_row_invariant(db_session)


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param("GET", f"{DATASETS_PATH}/missing/rows?status=pending", None, id="rows"),
        pytest.param("POST", f"{DATASETS_PATH}/missing/rows/approve", {"row_ids": [1]}, id="approve"),
        pytest.param("POST", f"{DATASETS_PATH}/missing/rows/approve-kind", {"change_kind": "new"}, id="approve-kind"),
        pytest.param("POST", f"{DATASETS_PATH}/missing/exclusions", {"row_key": "Fe"}, id="exclude"),
        pytest.param("GET", f"{DATASETS_PATH}/missing/versions/next", None, id="next-version"),
    ],
)
def test_unknown_dataset_returns_404(
    admin_client: TestClient, admin_headers: dict[str, str], method: str, path: str, body: object
) -> None:
    response = admin_client.request(method, path, json=body, headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "dataset_not_found"
