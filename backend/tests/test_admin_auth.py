"""관리자 인증(D-20) API 테스트. DB 없이 설정 의존성만 교체해 실행한다."""

import base64
import hashlib
import json
import logging
import re
from collections.abc import Callable, Iterator, Sequence

import httpx
import pytest
from argon2 import PasswordHasher, Type
from fastapi import APIRouter, FastAPI, WebSocket
from fastapi.routing import APIRoute, iter_route_contexts
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner
from pydantic import SecretStr
from starlette.routing import BaseRoute, WebSocketRoute
from starlette.staticfiles import StaticFiles

from app.admin_auth import hash_password, service
from app.admin_auth.dependencies import (
    apply_no_store,
    require_admin,
    require_admin_auth_enabled,
    require_allowed_origin,
)
from app.admin_auth.router import (
    ADMIN_PREFIX,
    MAX_PASSWORD_LENGTH,
    MAX_USERNAME_LENGTH,
    admin_router,
    login_router,
)
from app.admin_auth.service import (
    SESSION_COOKIE_NAME,
    SESSION_MAX_AGE_SECONDS,
    is_admin_auth_enabled,
    issue_session_token,
)
from app.config import Settings, get_settings
from app.main import app
from conftest import (
    ADMIN_PASSWORD,
    ADMIN_USERNAME,
    ALLOWED_ORIGIN,
    TEST_HASH_MEMORY_KIB,
    TEST_PASSWORD_HASH,
    make_settings,
    session_cookie_header,
)

OTHER_ORIGIN = "https://evil.test"
OTHER_VALID_SECRET = "o" * 48
SHORT_SECRET = "s" * 31
# TEST_PASSWORD_HASH 는 운영 하한보다 낮은 비용이므로 allow_low_cost_test_hash 픽스처가 하한을 그 값으로 낮춘다.
TEST_ARGON2I_HASH = PasswordHasher(
    time_cost=1, memory_cost=TEST_HASH_MEMORY_KIB, parallelism=1, type=Type.I
).hash(ADMIN_PASSWORD)
OTHER_PASSWORD_HASH = PasswordHasher(
    time_cost=1, memory_cost=TEST_HASH_MEMORY_KIB, parallelism=1
).hash("another password")
# 픽스처가 하한을 낮추기 전, 모듈에 정의된 운영 하한
PRODUCTION_MIN_PASSWORD_HASH_MEMORY_KIB = service.MIN_PASSWORD_HASH_MEMORY_KIB
SECONDS_BEFORE_EXPIRY_MARGIN = 60
LOGIN_PATH = f"{ADMIN_PREFIX}/login"

ClientFactory = Callable[[Settings], TestClient]


@pytest.fixture(autouse=True)
def allow_low_cost_test_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "MIN_PASSWORD_HASH_MEMORY_KIB", TEST_HASH_MEMORY_KIB)


def hash_with_memory_cost(memory_kib: int) -> str:
    # extract_parameters 는 문자열만 해석하므로, 비용 값만 바꾼 해시로 범위 검사를 계산 없이 재현한다.
    original = f"m={TEST_HASH_MEMORY_KIB},"
    assert original in TEST_PASSWORD_HASH
    return TEST_PASSWORD_HASH.replace(original, f"m={memory_kib},", 1)


@pytest.fixture
def make_client() -> Iterator[ClientFactory]:
    def factory(settings: Settings) -> TestClient:
        app.dependency_overrides[get_settings] = lambda: settings
        return TestClient(app)

    yield factory
    app.dependency_overrides.clear()


@pytest.fixture
def client(make_client: ClientFactory) -> TestClient:
    return make_client(make_settings())


def login(
    client: TestClient, username: str = ADMIN_USERNAME, password: str = ADMIN_PASSWORD
) -> httpx.Response:
    return client.post(
        "/api/admin/login",
        json={"username": username, "password": password},
        headers={"Origin": ALLOWED_ORIGIN},
    )


def token_from_response(response: httpx.Response) -> str:
    set_cookie = response.headers["set-cookie"]
    first_part = set_cookie.split(";", 1)[0]
    name, value = first_part.split("=", 1)
    assert name == SESSION_COOKIE_NAME
    return value


def cookie_attributes(response: httpx.Response) -> list[str]:
    return [part.strip().lower() for part in response.headers["set-cookie"].split(";")[1:]]


# --- 로그인 ---


def test_login_success_sets_session_cookie_with_security_attributes(client: TestClient) -> None:
    response = login(client)

    assert response.status_code == 204
    attributes = cookie_attributes(response)
    assert "httponly" in attributes
    assert "samesite=strict" in attributes
    assert "path=/api/admin" in attributes
    assert f"max-age={SESSION_MAX_AGE_SECONDS}" in attributes
    assert "secure" in attributes
    me = client.get("/api/admin/me", headers=session_cookie_header(token_from_response(response)))
    assert me.status_code == 200
    assert me.json() == {"username": ADMIN_USERNAME}


def test_login_cookie_secure_follows_setting(make_client: ClientFactory) -> None:
    client = make_client(make_settings(session_cookie_secure=False))

    response = login(client)

    assert response.status_code == 204
    assert "secure" not in cookie_attributes(response)


def test_login_wrong_password_returns_401(client: TestClient) -> None:
    response = login(client, password="wrong password")

    assert response.status_code == 401
    assert "set-cookie" not in response.headers


def test_login_wrong_username_returns_same_401_message(client: TestClient) -> None:
    wrong_password = login(client, password="wrong password")
    wrong_username = login(client, username="someone")

    assert wrong_username.status_code == 401
    assert wrong_username.json() == wrong_password.json()
    assert "set-cookie" not in wrong_username.headers


def test_login_wrong_username_still_verifies_hash_once(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    verify_calls: list[str] = []
    real_hasher = PasswordHasher()

    class CountingHasher:
        def verify(self, password_hash: str, password: str) -> bool:
            verify_calls.append(password_hash)
            return real_hasher.verify(password_hash, password)

    monkeypatch.setattr(service, "_password_hasher", CountingHasher())

    response = login(client, username="someone")

    assert response.status_code == 401
    assert verify_calls == [TEST_PASSWORD_HASH]


def test_login_returns_429_without_waiting_when_verification_slot_busy(
    client: TestClient,
) -> None:
    # 실제 동시 요청 대신 슬롯을 미리 점유해 앞선 검증이 진행 중인 상태를 재현한다.
    assert service._password_verification_slots.acquire(blocking=False)
    try:
        busy = login(client)
    finally:
        service._password_verification_slots.release()

    assert busy.status_code == 429
    assert busy.headers["retry-after"] == "1"
    assert busy.headers["cache-control"] == "no-store"
    assert "set-cookie" not in busy.headers
    # 슬롯이 풀리면 같은 요청이 성공한다(429 경로가 슬롯을 남기지 않음).
    assert login(client).status_code == 204


def test_login_with_padded_username_setting_accepts_trimmed_username(
    make_client: ClientFactory,
) -> None:
    client = make_client(make_settings(admin_username=f"  {ADMIN_USERNAME}  "))

    response = login(client, username=ADMIN_USERNAME)

    assert response.status_code == 204
    me = client.get("/api/admin/me", headers=session_cookie_header(token_from_response(response)))
    assert me.json() == {"username": ADMIN_USERNAME}


@pytest.mark.parametrize(
    ("field", "max_length"),
    [
        pytest.param("username", MAX_USERNAME_LENGTH, id="username"),
        pytest.param("password", MAX_PASSWORD_LENGTH, id="password"),
    ],
)
def test_login_input_longer_than_limit_returns_422(
    client: TestClient, field: str, max_length: int
) -> None:
    credentials = {"username": "someone", "password": "wrong password"}

    at_limit = client.post(
        LOGIN_PATH,
        json={**credentials, field: "x" * max_length},
        headers={"Origin": ALLOWED_ORIGIN},
    )
    over_limit = client.post(
        LOGIN_PATH,
        json={**credentials, field: "x" * (max_length + 1)},
        headers={"Origin": ALLOWED_ORIGIN},
    )

    assert at_limit.status_code == 401
    assert over_limit.status_code == 422


SENT_SECRET_MARKER = "sent-secret-marker-7f3a"


@pytest.mark.parametrize(
    "body",
    [
        pytest.param(
            {
                "username": ADMIN_USERNAME,
                "password": SENT_SECRET_MARKER.ljust(MAX_PASSWORD_LENGTH + 1, "x"),
            },
            id="password-too-long",
        ),
        pytest.param({"password": SENT_SECRET_MARKER}, id="username-missing"),
        pytest.param(
            {"username": ADMIN_USERNAME, "password": [SENT_SECRET_MARKER]}, id="password-wrong-type"
        ),
    ],
)
def test_validation_error_response_omits_sent_values(
    client: TestClient, body: dict[str, object]
) -> None:
    response = client.post(LOGIN_PATH, json=body, headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 422
    assert response.headers["cache-control"] == "no-store"
    # 기본 처리기는 input 에 보낸 값을 실어 비밀번호가 응답으로 되돌아간다(R2-04).
    assert SENT_SECRET_MARKER not in response.text
    errors = response.json()["detail"]
    assert errors
    for error in errors:
        assert "input" not in error
        assert {"type", "loc", "msg"} <= error.keys()


# --- 설정 비활성(fail closed) ---


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"admin_username": ""}, id="username-empty"),
        pytest.param({"admin_username": "   "}, id="username-blank"),
        pytest.param({"admin_password_hash": SecretStr("")}, id="hash-empty"),
        pytest.param({"session_secret": SecretStr("")}, id="secret-empty"),
        pytest.param({"session_secret": SecretStr(SHORT_SECRET)}, id="secret-short"),
        pytest.param({"admin_password_hash": SecretStr("not-an-argon2-hash")}, id="hash-invalid"),
        pytest.param({"admin_password_hash": SecretStr(TEST_ARGON2I_HASH)}, id="hash-not-argon2id"),
    ],
)
def test_disabled_settings_block_login_but_keep_health(
    make_client: ClientFactory, overrides: dict[str, object]
) -> None:
    enabled_token = issue_session_token(make_settings())
    client = make_client(make_settings(**overrides))

    disabled = login(client)
    assert disabled.status_code == 503
    assert disabled.headers["cache-control"] == "no-store"
    # 비활성 전에 발급된 세션도 받지 않는다(fail closed).
    me = client.get("/api/admin/me", headers=session_cookie_header(enabled_token))
    assert me.status_code == 401
    assert client.get("/api/admin/me").status_code == 401
    assert client.get("/api/health").status_code == 200


@pytest.mark.parametrize(
    "allowed_origins",
    [
        pytest.param("", id="empty"),
        pytest.param(" , ", id="only-separators"),
        pytest.param(f"{ALLOWED_ORIGIN}/", id="trailing-slash"),
        pytest.param(f"{ALLOWED_ORIGIN}/admin", id="with-path"),
        pytest.param("https://Plotline.test", id="uppercase-host"),
        pytest.param("ftp://plotline.test", id="wrong-scheme"),
        pytest.param(f"{ALLOWED_ORIGIN}?next=1", id="with-query"),
        pytest.param("https://user@plotline.test", id="with-userinfo"),
        pytest.param(f"{ALLOWED_ORIGIN}, {ALLOWED_ORIGIN}/", id="one-bad-among-good"),
    ],
)
def test_malformed_allowed_origins_disable_admin_auth(
    make_client: ClientFactory, allowed_origins: str, caplog: pytest.LogCaptureFixture
) -> None:
    enabled_token = issue_session_token(make_settings())
    disabled_settings = make_settings(admin_allowed_origins=allowed_origins)
    client = make_client(disabled_settings)

    assert login(client).status_code == 503
    # 설정 문제는 요청 경로가 아니라 기동 시 검사에서 기록된다(R2-03).
    with caplog.at_level(logging.ERROR, logger=service.__name__):
        service.log_admin_auth_settings(disabled_settings)
    assert any(
        "ADMIN_ALLOWED_ORIGINS" in record.getMessage()
        for record in admin_auth_records(caplog, logging.ERROR)
    )
    me = client.get("/api/admin/me", headers=session_cookie_header(enabled_token))
    assert me.status_code == 401


def test_https_origin_with_insecure_cookie_warns_but_stays_enabled(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    insecure = make_settings(session_cookie_secure=False)

    with caplog.at_level(logging.WARNING, logger=service.__name__):
        service.warn_insecure_cookie_with_https_origin(insecure)
        service.warn_insecure_cookie_with_https_origin(make_settings(session_cookie_secure=True))

    warnings = [record for record in caplog.records if record.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert "SESSION_COOKIE_SECURE" in warnings[0].getMessage()
    assert is_admin_auth_enabled(insecure)
    assert login(make_client(insecure)).status_code == 204


@pytest.mark.parametrize(
    "memory_kib",
    [
        pytest.param(TEST_HASH_MEMORY_KIB - 1, id="below-min"),
        pytest.param(service.MAX_PASSWORD_HASH_MEMORY_KIB + 1, id="above-max"),
    ],
)
def test_hash_memory_cost_out_of_range_disables_admin_auth(
    make_client: ClientFactory, memory_kib: int, caplog: pytest.LogCaptureFixture
) -> None:
    enabled_token = issue_session_token(make_settings())
    disabled_settings = make_settings(
        admin_password_hash=SecretStr(hash_with_memory_cost(memory_kib))
    )
    client = make_client(disabled_settings)

    assert login(client).status_code == 503
    # 설정 문제는 요청 경로가 아니라 기동 시 검사에서 기록된다(R2-03).
    with caplog.at_level(logging.ERROR, logger=service.__name__):
        service.log_admin_auth_settings(disabled_settings)
    assert any("memory_cost" in record.getMessage() for record in caplog.records)
    me = client.get("/api/admin/me", headers=session_cookie_header(enabled_token))
    assert me.status_code == 401


@pytest.mark.parametrize(
    "memory_kib",
    [
        pytest.param(TEST_HASH_MEMORY_KIB, id="at-min"),
        pytest.param(service.MAX_PASSWORD_HASH_MEMORY_KIB, id="at-max"),
    ],
)
def test_hash_memory_cost_at_bounds_keeps_admin_auth_enabled(memory_kib: int) -> None:
    settings = make_settings(admin_password_hash=SecretStr(hash_with_memory_cost(memory_kib)))

    assert is_admin_auth_enabled(settings)


def test_production_hash_memory_bounds() -> None:
    assert PRODUCTION_MIN_PASSWORD_HASH_MEMORY_KIB == 19456
    assert service.MAX_PASSWORD_HASH_MEMORY_KIB == 131072


ADMIN_AUTH_LOGGER_PREFIX = "app.admin_auth"
REPEATED_LOGIN_ATTEMPTS = 3


def admin_auth_records(
    caplog: pytest.LogCaptureFixture, min_level: int = logging.DEBUG
) -> list[logging.LogRecord]:
    return [
        record
        for record in caplog.records
        if record.name.startswith(ADMIN_AUTH_LOGGER_PREFIX) and record.levelno >= min_level
    ]


def test_disabled_settings_do_not_log_on_requests(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    disabled_settings = make_settings(admin_password_hash=SecretStr(""))
    client = make_client(disabled_settings)

    with caplog.at_level(logging.DEBUG):
        responses = [login(client) for _ in range(REPEATED_LOGIN_ATTEMPTS)]
        outcome = service.authenticate(disabled_settings, ADMIN_USERNAME, ADMIN_PASSWORD)

    assert [response.status_code for response in responses] == [503] * REPEATED_LOGIN_ATTEMPTS
    assert outcome is service.LoginOutcome.DISABLED
    # 요청으로 설정 오류 로그를 늘릴 수 없다(R2-03). 설정 상태 로그는 기동 시 검사만 남긴다.
    assert admin_auth_records(caplog) == []


def test_startup_settings_check_logs_once(caplog: pytest.LogCaptureFixture) -> None:
    disabled_settings = make_settings(admin_password_hash=SecretStr(""))

    with caplog.at_level(logging.DEBUG):
        service.log_admin_auth_settings(disabled_settings)

    errors = admin_auth_records(caplog, logging.ERROR)
    assert len(errors) == 1
    assert "ADMIN_PASSWORD_HASH" in errors[0].getMessage()


def test_startup_settings_check_is_silent_for_valid_settings(
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.DEBUG):
        service.log_admin_auth_settings(make_settings())

    assert admin_auth_records(caplog) == []


# --- 세션 확인 ---


def test_me_without_cookie_returns_401(client: TestClient) -> None:
    assert client.get("/api/admin/me").status_code == 401


def test_me_with_tampered_payload_returns_401(client: TestClient) -> None:
    token = issue_session_token(make_settings())
    _, timestamp, signature = token.split(".")
    forged_payload = (
        base64.urlsafe_b64encode(json.dumps({"username": "attacker"}).encode()).decode().rstrip("=")
    )
    tampered = ".".join([forged_payload, timestamp, signature])

    assert client.get("/api/admin/me", headers=session_cookie_header(tampered)).status_code == 401


def test_me_with_tampered_signature_returns_401(client: TestClient) -> None:
    payload, timestamp, signature = issue_session_token(make_settings()).split(".")
    # 마지막 base64 문자는 쓰이지 않는 비트를 담을 수 있어 첫 문자를 바꾼다.
    flipped_first = "A" if signature[0] != "A" else "B"
    tampered = ".".join([payload, timestamp, flipped_first + signature[1:]])

    assert client.get("/api/admin/me", headers=session_cookie_header(tampered)).status_code == 401


def test_me_with_cookie_signed_by_other_secret_returns_401(client: TestClient) -> None:
    token = issue_session_token(make_settings(session_secret=SecretStr(OTHER_VALID_SECRET)))

    assert client.get("/api/admin/me", headers=session_cookie_header(token)).status_code == 401


def test_me_with_cookie_for_previous_username_returns_401(client: TestClient) -> None:
    token = issue_session_token(make_settings(admin_username="previous-admin"))

    assert client.get("/api/admin/me", headers=session_cookie_header(token)).status_code == 401


def test_me_with_cookie_issued_before_password_change_returns_401(
    make_client: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    token = issue_session_token(make_settings())
    client = make_client(make_settings(admin_password_hash=SecretStr(OTHER_PASSWORD_HASH)))

    with caplog.at_level(logging.DEBUG):
        me = client.get("/api/admin/me", headers=session_cookie_header(token))

    assert me.status_code == 401
    # 해시 원문·지문은 로그에 남기지 않는다.
    for password_hash in (TEST_PASSWORD_HASH, OTHER_PASSWORD_HASH):
        fingerprint = hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[
            : service.PASSWORD_FINGERPRINT_HEX_LENGTH
        ]
        assert password_hash not in caplog.text
        assert fingerprint not in caplog.text


def issue_token_at(monkeypatch: pytest.MonkeyPatch, issued_at: int) -> str:
    # 발급 시각만 과거로 고정한다. 검증 시에는 실제 현재 시각을 쓴다(sleep 없이 만료 재현).
    with monkeypatch.context() as patch:
        patch.setattr(TimestampSigner, "get_timestamp", lambda self: issued_at)
        return issue_session_token(make_settings())


def test_me_with_expired_cookie_returns_401(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = TimestampSigner("unused-secret-for-clock").get_timestamp()
    expired = issue_token_at(monkeypatch, now - SESSION_MAX_AGE_SECONDS - SECONDS_BEFORE_EXPIRY_MARGIN)

    assert client.get("/api/admin/me", headers=session_cookie_header(expired)).status_code == 401


def test_me_with_cookie_just_before_expiry_returns_200(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    now = TimestampSigner("unused-secret-for-clock").get_timestamp()
    almost_expired = issue_token_at(
        monkeypatch, now - SESSION_MAX_AGE_SECONDS + SECONDS_BEFORE_EXPIRY_MARGIN
    )

    response = client.get("/api/admin/me", headers=session_cookie_header(almost_expired))
    assert response.status_code == 200


def test_me_with_trailing_slash_returns_404_without_redirect(client: TestClient) -> None:
    token = issue_session_token(make_settings())

    response = client.get(
        "/api/admin/me/", headers=session_cookie_header(token), follow_redirects=False
    )

    assert response.status_code == 404
    assert "location" not in response.headers


def test_admin_responses_are_not_stored(client: TestClient) -> None:
    login_failure = login(client, password="wrong password")
    login_success = login(client)
    me_anonymous = client.get("/api/admin/me")
    me_authenticated = client.get(
        "/api/admin/me", headers=session_cookie_header(token_from_response(login_success))
    )

    assert [
        login_failure.status_code,
        login_success.status_code,
        me_anonymous.status_code,
        me_authenticated.status_code,
    ] == [401, 204, 401, 200]
    for response in (login_failure, login_success, me_anonymous, me_authenticated):
        assert response.headers["cache-control"] == "no-store"


# --- 로그아웃 ---


def test_logout_deletes_cookie(client: TestClient) -> None:
    token = token_from_response(login(client))

    response = client.post(
        "/api/admin/logout",
        headers={**session_cookie_header(token), "Origin": ALLOWED_ORIGIN},
    )

    assert response.status_code == 204
    assert response.headers["set-cookie"].startswith(f'{SESSION_COOKIE_NAME}=""')
    attributes = cookie_attributes(response)
    assert "max-age=0" in attributes
    assert "path=/api/admin" in attributes
    assert "httponly" in attributes
    assert "samesite=strict" in attributes
    assert "secure" in attributes


def test_logout_without_session_returns_401(client: TestClient) -> None:
    response = client.post("/api/admin/logout", headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 401


# --- Origin 검사(CSRF) ---


@pytest.mark.parametrize(
    "origin_headers",
    [pytest.param({}, id="origin-missing"), pytest.param({"Origin": OTHER_ORIGIN}, id="origin-other")],
)
def test_login_rejects_disallowed_origin(
    client: TestClient, origin_headers: dict[str, str]
) -> None:
    response = client.post(
        "/api/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        headers=origin_headers,
    )

    assert response.status_code == 403
    assert "set-cookie" not in response.headers
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "origin_headers",
    [pytest.param({}, id="origin-missing"), pytest.param({"Origin": OTHER_ORIGIN}, id="origin-other")],
)
def test_logout_rejects_disallowed_origin_even_with_session(
    client: TestClient, origin_headers: dict[str, str]
) -> None:
    token = issue_session_token(make_settings())

    response = client.post(
        "/api/admin/logout", headers={**session_cookie_header(token), **origin_headers}
    )

    assert response.status_code == 403
    assert "set-cookie" not in response.headers


def test_second_allowed_origin_is_accepted(client: TestClient) -> None:
    response = client.post(
        "/api/admin/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        headers={"Origin": "http://127.0.0.1:5173"},
    )

    assert response.status_code == 204


def test_get_request_does_not_require_origin(client: TestClient) -> None:
    token = issue_session_token(make_settings())

    assert client.get("/api/admin/me", headers=session_cookie_header(token)).status_code == 200


# --- 기본 보호 구조 ---


PROBE_PATH = "/__structure_probe"


def test_route_added_to_admin_router_requires_session() -> None:
    def probe() -> dict[str, str]:
        return {"status": "ok"}

    admin_router.add_api_route(PROBE_PATH, probe, methods=["GET"])
    try:
        probe_app = FastAPI()
        probe_app.include_router(admin_router)
        probe_app.dependency_overrides[get_settings] = lambda: make_settings()
        probe_client = TestClient(probe_app)

        assert probe_client.get(f"/api/admin{PROBE_PATH}").status_code == 401
        token = issue_session_token(make_settings())
        authorized = probe_client.get(
            f"/api/admin{PROBE_PATH}", headers=session_cookie_header(token)
        )
        assert authorized.status_code == 200
    finally:
        admin_router.routes[:] = [
            route
            for route in admin_router.routes
            if not (isinstance(route, APIRoute) and route.path.endswith(PROBE_PATH))
        ]


LOGIN_ROUTE_LABEL = f"POST {LOGIN_PATH}"
LOGIN_REQUIRED_DEPENDENCIES = frozenset(
    {apply_no_store, require_admin_auth_enabled, require_allowed_origin}
)
SESSION_REQUIRED_DEPENDENCIES = frozenset({apply_no_store, require_allowed_origin, require_admin})


API_PREFIX = "/api"
DYNAMIC_SEGMENT_MARKER = "{"
WEBSOCKET_FORBIDDEN_MESSAGE = "WebSocket 라우트 추가 시 관리자 보호 검사를 WebSocket까지 확장할 것"


def route_label(methods: set[str] | None, path: str) -> str:
    return f"{','.join(sorted(methods)) if methods else '*'} {path}"


def inspect_admin_routes(routes: Sequence[BaseRoute]) -> tuple[list[str], list[str]]:
    """앱 전체 라우트를 검사해 (검사한 관리자 라우트, 위반 라우트)를 돌려준다.

    보장 범위: HTTP 라우트(앱 직접·포함·중첩 포함)와 Mount를 정적으로 검사하고, 관리자 URL을 가로챌 수 있는
    /api 동적 경로를 금지한다. WebSocket은 존재 자체를 금지한다. 실제 매칭 결과는 역검증 테스트로 보완한다.

    FastAPI 0.142 는 include_router 결과를 app.routes 에 _IncludedRouter 하나로 두므로 iter_route_contexts 로
    펼쳐, prefix 가 붙은 실제 경로와 include 단계 의존성까지 합친 dependant 를 본다. app 에 직접 붙은 라우트는
    그대로 나온다. Mount 처럼 dependant 가 없는 라우트는 의존성으로 보호할 수 없으므로 위반이다.
    /api/admin 밖의 /api 경로에 동적 세그먼트가 있으면 등록 순서에 따라 관리자 URL 을 먼저 매칭할 수 있어 위반이다.
    """
    checked: list[str] = []
    violations: list[str] = []
    for route_context in iter_route_contexts(routes):
        path = route_context.path
        if path is None:
            continue
        methods = route_context.methods
        label = route_label(methods, path)
        if not path.startswith(ADMIN_PREFIX):
            if path.startswith(API_PREFIX) and DYNAMIC_SEGMENT_MARKER in path:
                violations.append(label)
            continue
        checked.append(label)
        dependant = getattr(route_context, "dependant", None)
        if dependant is None:
            violations.append(label)
            continue
        calls = {dependency.call for dependency in dependant.dependencies}
        required = (
            LOGIN_REQUIRED_DEPENDENCIES
            if label == LOGIN_ROUTE_LABEL
            else SESSION_REQUIRED_DEPENDENCIES
        )
        if not required <= calls:
            violations.append(label)
    return checked, violations


def test_every_admin_route_except_login_requires_session() -> None:
    checked, violations = inspect_admin_routes(app.routes)

    # 순회가 include_router 로 붙은 라우트를 실제로 보고 있는지(0건 통과 방지) 알려진 라우트로 확인한다.
    assert {
        LOGIN_ROUTE_LABEL,
        "POST /api/admin/logout",
        "GET /api/admin/me",
        "GET /api/admin/datasets",
        "GET /api/admin/datasets/{slug}",
        "POST /api/admin/imports/preview",
        "POST /api/admin/imports",
        "GET /api/admin/datasets/{slug}/rows",
        "POST /api/admin/datasets/{slug}/rows/approve-kind",
        "POST /api/admin/datasets/{slug}/exclusions",
        "DELETE /api/admin/datasets/{slug}/exclusions",
    } <= set(checked)
    assert violations == []


STATE_CHANGING_METHODS = frozenset({"POST", "DELETE", "PUT", "PATCH"})
PATH_PARAMETER_PATTERN = re.compile(r"\{[^}]+\}")
# 경로 매개변수 자리에 넣는 더미 값. slug · 줄 id 형식을 모두 통과해 Origin 검사까지 가게 한다.
DUMMY_PATH_VALUE = "1"


def state_changing_admin_routes(routes: Sequence[BaseRoute]) -> list[tuple[str, str]]:
    """관리자 경로의 상태 변경 (메서드, 경로) 전부. 포함 · 중첩 라우터는 iter_route_contexts 로 펼친다."""
    found: list[tuple[str, str]] = []
    for route_context in iter_route_contexts(routes):
        path = route_context.path
        if path is None or not path.startswith(ADMIN_PREFIX):
            continue
        for method in sorted((route_context.methods or set()) & STATE_CHANGING_METHODS):
            found.append((method, path))
    return found


def test_every_state_changing_admin_route_requires_origin(client: TestClient) -> None:
    routes = state_changing_admin_routes(app.routes)
    # 세션은 유효하게 두고 Origin 만 뺀다. 거절 이유가 세션이 아니라 Origin 검사임을 분리한다.
    headers = session_cookie_header(issue_session_token(make_settings()))

    statuses = {
        route_label({method}, path): client.request(
            method, PATH_PARAMETER_PATTERN.sub(DUMMY_PATH_VALUE, path), json={}, headers=headers
        ).status_code
        for method, path in routes
    }

    # 순회가 실제 라우트를 보고 있는지(0건 통과 방지) 알려진 상태 변경 라우트로 확인한다.
    assert {
        LOGIN_ROUTE_LABEL,
        "POST /api/admin/logout",
        "POST /api/admin/imports",
        "POST /api/admin/datasets/{slug}/rows/{row_id}/reject",
        "DELETE /api/admin/datasets/{slug}/exclusions",
        "POST /api/admin/datasets/{slug}/publish",
        "POST /api/admin/datasets/{slug}/versions/{version_no}/publish",
        "POST /api/admin/datasets/{slug}/versions/{version_no}/abandon",
    } <= set(statuses)
    assert {label: code for label, code in statuses.items() if code != 403} == {}


def test_admin_route_inspection_detects_unguarded_routes() -> None:
    def probe() -> dict[str, str]:
        return {"status": "ok"}

    probe_app = FastAPI()
    probe_app.include_router(login_router)
    probe_app.include_router(admin_router)
    probe_app.add_api_route(f"{ADMIN_PREFIX}/direct-probe", probe, methods=["GET"])
    unguarded_router = APIRouter(prefix=f"{ADMIN_PREFIX}/included")
    unguarded_router.add_api_route("/probe", probe, methods=["GET"])
    probe_app.include_router(unguarded_router)
    nested_parent = APIRouter()
    nested_child = APIRouter(prefix=f"{ADMIN_PREFIX}/nested")
    nested_child.add_api_route("/probe", probe, methods=["GET"])
    nested_parent.include_router(nested_child)
    probe_app.include_router(nested_parent)
    # login 과 같은 의존성을 가진 GET /login 은 예외(POST login)로 취급되지 않아야 한다.
    login_lookalike = APIRouter(prefix=ADMIN_PREFIX, dependencies=login_router.dependencies)
    login_lookalike.add_api_route("/login", probe, methods=["GET"])
    probe_app.include_router(login_lookalike)
    probe_app.mount(f"{ADMIN_PREFIX}/files", StaticFiles(directory=".", check_dir=False))

    checked, violations = inspect_admin_routes(probe_app.routes)

    assert {LOGIN_ROUTE_LABEL, "POST /api/admin/logout", "GET /api/admin/me"} <= set(checked)
    assert sorted(violations) == sorted(
        [
            f"GET {ADMIN_PREFIX}/direct-probe",
            f"GET {ADMIN_PREFIX}/included/probe",
            f"GET {ADMIN_PREFIX}/nested/probe",
            f"GET {LOGIN_PATH}",
            f"* {ADMIN_PREFIX}/files",
        ]
    )


CATCH_ALL_PATH = "/api/{rest:path}"


def test_admin_route_inspection_detects_public_api_catch_all() -> None:
    def catch_all(rest: str) -> dict[str, str]:
        return {"rest": rest}

    probe_app = FastAPI()
    # 관리자 라우터보다 먼저 붙인 공개 catch-all 은 /api/admin/me 를 가로챈다.
    probe_app.add_api_route(CATCH_ALL_PATH, catch_all, methods=["GET"])
    probe_app.include_router(login_router)
    probe_app.include_router(admin_router)

    _, violations = inspect_admin_routes(probe_app.routes)
    intercepted = TestClient(probe_app).get("/api/admin/me")

    assert violations == [f"GET {CATCH_ALL_PATH}"]
    # 규칙이 막으려는 실제 위험: 세션 없이 관리자 URL 이 공개 라우트로 응답된다.
    assert intercepted.status_code == 200
    assert intercepted.json() == {"rest": "admin/me"}


def test_real_app_routes_admin_urls_to_admin_dependencies() -> None:
    # 구조 검사가 놓치는 실제 매칭 결과를 실제 앱 라우팅으로 확인한다(설정 교체 없이).
    real_client = TestClient(app)
    response = real_client.get("/api/admin/me")
    logout = real_client.post("/api/admin/logout")
    login_attempt = real_client.post(
        LOGIN_PATH, json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
    )

    assert response.status_code == 401
    assert logout.status_code == 403
    # 실제 환경 설정에 따라 비활성(503) 또는 Origin 거부(403). 둘 다 관리자 의존성을 거친 결과다.
    assert login_attempt.status_code in {403, 503}
    for admin_response in (response, logout, login_attempt):
        assert admin_response.headers["cache-control"] == "no-store"


def find_websocket_routes(routes: Sequence[BaseRoute]) -> list[str]:
    """app.routes 를 직접 본 결과와 iter_route_contexts 로 펼친 결과 모두에서 WebSocket 라우트를 찾는다."""
    found = [
        f"WS {getattr(route, 'path', '?')}" for route in routes if isinstance(route, WebSocketRoute)
    ]
    for route_context in iter_route_contexts(routes):
        if not isinstance(route_context.original_route, WebSocketRoute):
            continue
        # 포함된 WebSocket 은 RouteContext.path 가 비어 있고, prefix 가 붙은 경로는 starlette_route 에 있다.
        effective = getattr(route_context, "starlette_route", None) or route_context.original_route
        found.append(f"WS {getattr(effective, 'path', '?')}")
    return found


def test_app_has_no_websocket_routes() -> None:
    assert find_websocket_routes(app.routes) == [], WEBSOCKET_FORBIDDEN_MESSAGE


def test_websocket_route_detection_finds_direct_and_included_routes() -> None:
    async def websocket_probe(websocket: WebSocket) -> None:
        await websocket.close()

    probe_app = FastAPI()
    probe_app.add_api_websocket_route("/ws-direct", websocket_probe)
    included = APIRouter(prefix="/api/included")
    included.add_api_websocket_route("/ws", websocket_probe)
    probe_app.include_router(included)

    found = find_websocket_routes(probe_app.routes)

    assert "WS /ws-direct" in found
    assert "WS /api/included/ws" in found


# --- 해시 생성 도구 ---


def fake_getpass(answers: list[str]) -> Callable[[str], str]:
    remaining = iter(answers)
    return lambda prompt="": next(remaining)


def test_hash_tool_rejects_mismatched_inputs(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(hash_password, "getpass", fake_getpass(["first", "second"]))

    assert hash_password.main() == hash_password.EXIT_FAILURE
    assert capsys.readouterr().out == ""


def test_hash_tool_prints_argon2id_hash_for_matching_inputs(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(hash_password, "getpass", fake_getpass([ADMIN_PASSWORD, ADMIN_PASSWORD]))

    assert hash_password.main() == hash_password.EXIT_OK
    printed_hash = capsys.readouterr().out.strip()
    assert printed_hash.startswith("$argon2id$")
    assert PasswordHasher().verify(printed_hash, ADMIN_PASSWORD)
