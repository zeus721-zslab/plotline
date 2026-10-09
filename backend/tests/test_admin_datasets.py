"""데이터 묶음 목록 · 상세 관리자 API 의 흐름 · 경계 테스트(실제 MariaDB = db-test).

묶음 만들기는 붙여넣기 저장(test_admin_imports.py)이 맡는다. 여기서는 목록 · 상세가 줄 상태를 어떻게 세는지만 본다.
"""

import json
import re
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.data_core.models import Dataset
from conftest import ALLOWED_ORIGIN, assert_row_invariant

pytestmark = pytest.mark.db

DATASETS_PATH = "/api/admin/datasets"
IMPORTS_PATH = "/api/admin/imports"
UTC_ISO_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
ISOLATION_SLUG = "rollback-isolation"
FIELDS: list[dict[str, object]] = [
    {"name": "symbol", "type": "text", "key": True},
    {"name": "year", "type": "year"},
]


def self_row(symbol: str, year: object = 1800) -> dict[str, object]:
    return {"symbol": symbol, "year": year, "source_kind": "self"}


def paste(
    client: TestClient, headers: dict[str, str], slug: str, rows: list[dict[str, object]], *, create: bool = True
) -> None:
    payload = json.dumps({"dataset": {"slug": slug, "title": "원소"}, "fields": FIELDS, "rows": rows})
    response = client.post(
        IMPORTS_PATH,
        json={"payload": payload, "source_type": "upload", "create_dataset": create, "confirm_schema": True},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def approve_new(client: TestClient, headers: dict[str, str], slug: str) -> None:
    response = client.post(f"{DATASETS_PATH}/{slug}/rows/approve-kind", json={"change_kind": "new"}, headers=headers)
    assert response.status_code == 200, response.text


# --- 인증 ---


@pytest.mark.parametrize(
    "path",
    [pytest.param(DATASETS_PATH, id="list"), pytest.param(f"{DATASETS_PATH}/elements", id="detail")],
)
def test_routes_require_session(admin_client: TestClient, path: str) -> None:
    response = admin_client.get(path, headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        pytest.param("POST", DATASETS_PATH, id="create-dataset"),
        pytest.param("POST", f"{DATASETS_PATH}/elements/schemas", id="save-schema"),
        pytest.param("POST", f"{DATASETS_PATH}/elements/imports", id="create-import"),
        pytest.param("GET", f"{DATASETS_PATH}/elements/imports", id="list-imports"),
    ],
)
def test_removed_routes_are_gone(
    admin_client: TestClient, admin_headers: dict[str, str], method: str, path: str
) -> None:
    # D-28 에서 붙여넣기 저장으로 대체된 경로. 같은 경로의 GET 상세가 있으면 405, 없으면 404 다.
    response = admin_client.request(method, path, json={}, headers=admin_headers)

    assert response.status_code in {404, 405}


# --- 목록 · 상세 ---


def test_list_and_detail_show_review_and_publish_state(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    paste(admin_client, admin_headers, "progress-set", [self_row("Fe"), self_row("Cu")])
    paste(admin_client, admin_headers, "empty-set", [self_row("Fe")])
    approve_new(admin_client, admin_headers, "progress-set")
    approved_state = {item["slug"]: item for item in admin_client.get(DATASETS_PATH, headers=admin_headers).json()}
    assert admin_client.post(f"{DATASETS_PATH}/progress-set/versions", json={}, headers=admin_headers).status_code == 201
    paste(admin_client, admin_headers, "progress-set", [self_row("Fe", 1801), self_row("Ag", "오래전")], create=False)

    listed = {item["slug"]: item for item in admin_client.get(DATASETS_PATH, headers=admin_headers).json()}
    detail = admin_client.get(f"{DATASETS_PATH}/progress-set", headers=admin_headers).json()

    # 승인 줄이 있고 기록본이 없으면 공개 안 된 변경이 있다.
    assert approved_state["progress-set"]["has_unpublished_changes"] is True
    assert approved_state["empty-set"]["has_unpublished_changes"] is False
    progress = listed["progress-set"]
    assert (progress["latest_version_no"], progress["pending_count"], progress["has_unpublished_changes"]) == (1, 2, False)
    assert UTC_ISO_PATTERN.match(progress["created_at"])
    assert detail["schema"]["version"] == 1
    assert detail["schema"]["fields"] == FIELDS
    assert detail["counts"] == {
        "pending": 2,
        "pending_error": 1,
        "pending_carry_failed": 0,
        "pending_new": 0,
        "pending_changed": 1,
        "pending_as_of_only": 0,
        "approved": 2,
        "rejected": 0,
        "superseded": 0,
        "excluded_keys": 0,
    }
    assert_row_invariant(db_session)


def test_list_is_ordered_by_created_at_desc(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    # 먼저 넣은 줄(작은 id)을 더 늦은 시각으로 둔다. id 순서와 시각 순서가 반대여야 created_at 정렬을 실제로 확인한다.
    db_session.add(Dataset(slug="newer", title="나중", created_at=datetime(2026, 2, 1, 0, 0, 0)))
    db_session.flush()
    db_session.add(Dataset(slug="older", title="먼저", created_at=datetime(2026, 1, 1, 0, 0, 0)))
    db_session.commit()

    listed = admin_client.get(DATASETS_PATH, headers=admin_headers).json()

    slugs = [item["slug"] for item in listed]
    assert slugs.index("newer") < slugs.index("older")
    created = {item["slug"]: item["created_at"] for item in listed}
    assert created["newer"] == "2026-02-01T00:00:00Z"
    newer = next(item for item in listed if item["slug"] == "newer")
    assert (newer["latest_version_no"], newer["pending_count"], newer["has_unpublished_changes"]) == (None, 0, False)


def test_unknown_dataset_detail_returns_404(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    response = admin_client.get(f"{DATASETS_PATH}/missing", headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "dataset_not_found"
    assert response.headers["cache-control"] == "no-store"


# --- 롤백 격리 ---
# 두 테스트가 같은 slug 를 만든다. 테스트별 롤백이 안 되면 뒤에 도는 쪽은 새 묶음이 아니라 기존 묶음이 된다.


def _isolated_dataset_is_new(client: TestClient, headers: dict[str, str]) -> bool:
    payload = json.dumps({"dataset": {"slug": ISOLATION_SLUG, "title": "격리"}, "fields": FIELDS, "rows": [self_row("Fe")]})
    previewed = client.post(f"{IMPORTS_PATH}/preview", json={"payload": payload, "source_type": "upload"}, headers=headers)
    paste(client, headers, ISOLATION_SLUG, [self_row("Fe")])
    return previewed.json()["target"]["is_new"]


def test_rollback_isolation_first(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    assert _isolated_dataset_is_new(admin_client, admin_headers)
    assert_row_invariant(db_session)


def test_rollback_isolation_second(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    assert _isolated_dataset_is_new(admin_client, admin_headers)
    assert_row_invariant(db_session)
