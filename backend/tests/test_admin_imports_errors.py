"""관리자 데이터 API 의 DB 잠금 충돌 응답 매핑(DB 없음). 서비스 함수를 가짜 OperationalError 를 던지는 함수로 바꿔 본다."""

from collections.abc import Iterator

import httpx
import pymysql
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.admin_auth import service
from app.admin_auth.service import issue_session_token
from app.admin_imports import router
from app.config import get_settings
from app.db import get_db_session
from app.main import app
from conftest import ALLOWED_ORIGIN, TEST_HASH_MEMORY_KIB, make_settings, session_cookie_header

APPROVE_PATH = "/api/admin/datasets/elements/rows/approve"
DEADLOCK = 1213
LOCK_WAIT_TIMEOUT = 1205
# 잠금과 무관한 OperationalError 예: 2006 MySQL server has gone away
SERVER_GONE = 2006


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(service, "MIN_PASSWORD_HASH_MEMORY_KIB", TEST_HASH_MEMORY_KIB)
    settings = make_settings()
    app.dependency_overrides[get_settings] = lambda: settings
    # 서비스 함수를 바꿔 끼우므로 세션은 쓰이지 않는다(DB 에 접속하지 않음).
    app.dependency_overrides[get_db_session] = lambda: None
    # 그대로 올라간 예외가 테스트 예외가 아니라 500 응답이 되게 한다.
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


def raise_operational_error(error_number: int) -> None:
    raise OperationalError("UPDATE dataset_rows ...", {}, pymysql.err.OperationalError(error_number, "fake"))


def approve(client: TestClient) -> httpx.Response:
    headers = {**session_cookie_header(issue_session_token(make_settings())), "Origin": ALLOWED_ORIGIN}
    return client.post(APPROVE_PATH, json={"row_ids": [1]}, headers=headers)


@pytest.mark.parametrize(
    "error_number", [pytest.param(DEADLOCK, id="deadlock"), pytest.param(LOCK_WAIT_TIMEOUT, id="lock-wait")]
)
def test_lock_conflict_returns_409_concurrent_change(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, error_number: int
) -> None:
    monkeypatch.setattr(router, "approve_rows", lambda *arguments: raise_operational_error(error_number))

    response = approve(client)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "concurrent_change"
    assert response.headers["cache-control"] == "no-store"


def test_other_operational_error_is_not_mapped(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(router, "approve_rows", lambda *arguments: raise_operational_error(SERVER_GONE))

    response = approve(client)

    assert response.status_code == 500
