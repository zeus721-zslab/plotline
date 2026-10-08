"""데이터셋·필드 정의 관리자 API 의 흐름·경계 테스트(실제 MariaDB = db-test).

정의 형식 규칙 자체는 test_field_definition.py(DB 없음)가 맡고, 여기서는 API 가 그 결과를 어떻게 돌려주는지만 본다.
"""

import re
from datetime import datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.admin_datasets import service as dataset_service
from app.data_core.models import Dataset
from conftest import ALLOWED_ORIGIN

pytestmark = pytest.mark.db

DATASETS_PATH = "/api/admin/datasets"
SLUG_MAX_LENGTH = 64
UTC_ISO_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
ISOLATION_SLUG = "rollback-isolation"

VALID_FIELDS: list[dict[str, object]] = [
    {"name": "symbol", "label": "기호", "type": "text", "key": True, "max_length": 3},
    {"name": "mass", "type": "number", "min": 0, "unit": "u"},
]
OTHER_FIELDS: list[dict[str, object]] = [
    {"name": "symbol", "type": "text", "key": True},
    {"name": "state", "type": "category", "options": ["gas", "solid"], "required": True},
]


def create_dataset(
    client: TestClient, headers: dict[str, str], slug: str, title: str = "원소"
) -> dict[str, object]:
    response = client.post(DATASETS_PATH, json={"slug": slug, "title": title}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def save_schema(
    client: TestClient, headers: dict[str, str], slug: str, fields: list[dict[str, object]]
) -> httpx.Response:
    return client.post(f"{DATASETS_PATH}/{slug}/schemas", json={"fields": fields}, headers=headers)


# --- 인증 ---


@pytest.mark.parametrize(
    ("method", "path"),
    [
        pytest.param("GET", DATASETS_PATH, id="list"),
        pytest.param("POST", DATASETS_PATH, id="create"),
        pytest.param("GET", f"{DATASETS_PATH}/elements", id="detail"),
        pytest.param("POST", f"{DATASETS_PATH}/elements/schemas", id="save-schema"),
    ],
)
def test_routes_require_session(admin_client: TestClient, method: str, path: str) -> None:
    response = admin_client.request(method, path, json={}, headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "path",
    [
        pytest.param(DATASETS_PATH, id="create"),
        pytest.param(f"{DATASETS_PATH}/elements/schemas", id="save-schema"),
    ],
)
def test_post_routes_require_origin(
    admin_client: TestClient, admin_headers: dict[str, str], path: str
) -> None:
    without_origin = {name: value for name, value in admin_headers.items() if name != "Origin"}

    response = admin_client.post(path, json={}, headers=without_origin)

    assert response.status_code == 403


# --- 데이터셋 ---


def test_created_dataset_appears_in_list_and_detail(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    created = create_dataset(admin_client, admin_headers, "elements", title="  원소 발견사  ")

    assert created["slug"] == "elements"
    assert created["title"] == "원소 발견사"
    assert created["schema_version"] is None
    assert UTC_ISO_PATTERN.match(str(created["created_at"]))

    listed = admin_client.get(DATASETS_PATH, headers=admin_headers)
    assert listed.status_code == 200
    assert created in listed.json()

    detail = admin_client.get(f"{DATASETS_PATH}/elements", headers=admin_headers)
    assert detail.status_code == 200
    assert detail.json() == {
        "slug": "elements",
        "title": "원소 발견사",
        "created_at": created["created_at"],
        "schema": None,
    }


def test_list_shows_latest_schema_version_per_dataset(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    create_dataset(admin_client, admin_headers, "first-set")
    create_dataset(admin_client, admin_headers, "second-set")
    assert save_schema(admin_client, admin_headers, "first-set", VALID_FIELDS).status_code == 201
    assert save_schema(admin_client, admin_headers, "first-set", OTHER_FIELDS).status_code == 201

    listed = admin_client.get(DATASETS_PATH, headers=admin_headers).json()

    versions = {item["slug"]: item["schema_version"] for item in listed}
    assert versions["first-set"] == 2
    assert versions["second-set"] is None


def test_list_is_ordered_by_created_at_desc(
    admin_client: TestClient, admin_headers: dict[str, str], db_session: Session
) -> None:
    # 먼저 넣은 행(작은 id)을 더 늦은 시각으로 둔다. id 순서와 시각 순서가 반대여야 created_at 정렬을 실제로 확인한다.
    db_session.add(Dataset(slug="newer", title="나중", created_at=datetime(2026, 2, 1, 0, 0, 0)))
    db_session.flush()
    db_session.add(Dataset(slug="older", title="먼저", created_at=datetime(2026, 1, 1, 0, 0, 0)))
    db_session.commit()

    listed = admin_client.get(DATASETS_PATH, headers=admin_headers).json()

    slugs = [item["slug"] for item in listed]
    assert slugs.index("newer") < slugs.index("older")
    created = {item["slug"]: item["created_at"] for item in listed}
    assert created["newer"] == "2026-02-01T00:00:00Z"


def test_duplicate_slug_returns_409(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    create_dataset(admin_client, admin_headers, "elements")

    response = admin_client.post(
        DATASETS_PATH, json={"slug": "elements", "title": "다른 제목"}, headers=admin_headers
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "dataset_slug_taken"
    assert "problems" not in response.json()["detail"]
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "slug",
    [
        pytest.param("Elements", id="uppercase"),
        pytest.param("my elements", id="space"),
        pytest.param("a" * (SLUG_MAX_LENGTH + 1), id="too-long"),
    ],
)
def test_malformed_slug_returns_422(
    admin_client: TestClient, admin_headers: dict[str, str], slug: str
) -> None:
    response = admin_client.post(
        DATASETS_PATH, json={"slug": slug, "title": "원소"}, headers=admin_headers
    )

    assert response.status_code == 422


def test_unknown_dataset_detail_returns_404(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = admin_client.get(f"{DATASETS_PATH}/missing", headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "dataset_not_found"
    assert response.headers["cache-control"] == "no-store"


# --- 필드 정의 ---


def test_schema_versions_increase_and_detail_returns_latest(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    create_dataset(admin_client, admin_headers, "elements")

    first = save_schema(admin_client, admin_headers, "elements", VALID_FIELDS)
    second = save_schema(admin_client, admin_headers, "elements", OTHER_FIELDS)

    assert first.status_code == 201
    assert first.json()["version"] == 1
    assert first.json()["fields"] == VALID_FIELDS
    assert UTC_ISO_PATTERN.match(first.json()["created_at"])
    assert second.status_code == 201
    assert second.json()["version"] == 2
    detail = admin_client.get(f"{DATASETS_PATH}/elements", headers=admin_headers).json()
    assert detail["schema"] == second.json()


def test_invalid_fields_return_422_with_problems(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    create_dataset(admin_client, admin_headers, "elements")

    response = save_schema(admin_client, admin_headers, "elements", [{"name": "title", "type": "text"}])

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_fields"
    assert detail["problems"] == ["key 필드가 1개 이상 있어야 합니다."]
    assert response.headers["cache-control"] == "no-store"
    # 실패한 저장은 버전을 만들지 않는다.
    assert admin_client.get(f"{DATASETS_PATH}/elements", headers=admin_headers).json()["schema"] is None


def test_reserved_field_name_returns_422(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    create_dataset(admin_client, admin_headers, "elements")

    response = save_schema(
        admin_client,
        admin_headers,
        "elements",
        [*VALID_FIELDS, {"name": "source_url", "type": "url"}],
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_fields"
    assert len(response.json()["detail"]["problems"]) == 1


def test_same_schema_again_returns_409(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    create_dataset(admin_client, admin_headers, "elements")
    assert save_schema(admin_client, admin_headers, "elements", VALID_FIELDS).status_code == 201

    response = save_schema(admin_client, admin_headers, "elements", VALID_FIELDS)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "schema_unchanged"
    detail = admin_client.get(f"{DATASETS_PATH}/elements", headers=admin_headers).json()
    assert detail["schema"]["version"] == 1


def test_schema_for_unknown_dataset_returns_404(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = save_schema(admin_client, admin_headers, "missing", VALID_FIELDS)

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "dataset_not_found"


def test_schema_versions_are_independent_per_dataset(
    admin_client: TestClient, admin_headers: dict[str, str]
) -> None:
    create_dataset(admin_client, admin_headers, "first-set")
    create_dataset(admin_client, admin_headers, "second-set")
    assert save_schema(admin_client, admin_headers, "first-set", VALID_FIELDS).status_code == 201
    assert save_schema(admin_client, admin_headers, "first-set", OTHER_FIELDS).status_code == 201

    response = save_schema(admin_client, admin_headers, "second-set", VALID_FIELDS)

    assert response.status_code == 201
    assert response.json()["version"] == 1


# --- 유니크 제약 충돌(조회 뒤 다른 요청이 먼저 저장한 경우) ---
# 동시 요청 대신 선조회가 "없음"을 돌려주게 바꿔, 저장 시점의 유니크 제약 충돌을 재현한다.


def test_slug_unique_violation_returns_409(
    admin_client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    create_dataset(admin_client, admin_headers, "elements")
    monkeypatch.setattr(dataset_service, "_find_dataset", lambda session, slug: None)

    response = admin_client.post(
        DATASETS_PATH, json={"slug": "elements", "title": "원소"}, headers=admin_headers
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "dataset_slug_taken"


def test_schema_version_unique_violation_returns_409(
    admin_client: TestClient, admin_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    create_dataset(admin_client, admin_headers, "elements")
    assert save_schema(admin_client, admin_headers, "elements", VALID_FIELDS).status_code == 201
    with monkeypatch.context() as patch:
        patch.setattr(dataset_service, "_latest_schema", lambda session, dataset_id: None)
        response = save_schema(admin_client, admin_headers, "elements", OTHER_FIELDS)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "schema_version_conflict"
    # 충돌 뒤에도 같은 세션으로 계속 쓸 수 있고, 기존 버전은 그대로다.
    detail = admin_client.get(f"{DATASETS_PATH}/elements", headers=admin_headers).json()
    assert detail["schema"]["version"] == 1


# --- 롤백 격리 ---
# 두 테스트가 같은 slug 를 만든다. 테스트별 롤백이 안 되면 뒤에 도는 쪽이 409 로 실패한다.


def test_rollback_isolation_first(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    create_dataset(admin_client, admin_headers, ISOLATION_SLUG)


def test_rollback_isolation_second(admin_client: TestClient, admin_headers: dict[str, str]) -> None:
    create_dataset(admin_client, admin_headers, ISOLATION_SLUG)
