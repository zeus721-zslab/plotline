"""테스트 공용 설정.

- 관리자 세션 헬퍼(make_settings · session_cookie_header 등): 관리자 API 테스트들이 같은 설정·쿠키 방식을 쓴다.
- db 테스트 기반: pytest.mark.db 테스트만 테스트 전용 DB(db-test)에 접속한다. 세션당 마이그레이션 1회,
  테스트마다 바깥 트랜잭션을 롤백해 테이블 삭제·재생성 없이 격리한다. 마커 없는 테스트는 이 픽스처를 쓰지 않는다.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import URL, Engine, create_engine
from sqlalchemy.orm import Session

from app.admin_auth import service
from app.admin_auth.service import SESSION_COOKIE_NAME, issue_session_token
from app.config import Settings, get_settings
from app.db import build_database_url, get_db_session
from app.main import app

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "correct horse battery staple"
ALLOWED_ORIGIN = "https://plotline.test"
VALID_SECRET = "s" * 48
# 테스트 시간을 줄이기 위한 낮은 비용 파라미터. 운영 해시는 hash_password 도구의 기본 파라미터를 쓴다.
# 운영 하한(MIN_PASSWORD_HASH_MEMORY_KIB)보다 낮으므로 이 해시를 쓰는 테스트는 하한을 이 값으로 낮춘다.
TEST_HASH_MEMORY_KIB = 8
TEST_PASSWORD_HASH = PasswordHasher(
    time_cost=1, memory_cost=TEST_HASH_MEMORY_KIB, parallelism=1
).hash(ADMIN_PASSWORD)

TEST_DB_HOST_ENV = "TEST_DB_HOST"
BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_SCRIPT_LOCATION = BACKEND_DIR / "alembic"
MIGRATION_HEAD = "head"


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "admin_username": ADMIN_USERNAME,
        "admin_password_hash": SecretStr(TEST_PASSWORD_HASH),
        "session_secret": SecretStr(VALID_SECRET),
        "session_cookie_secure": True,
        "admin_allowed_origins": f"{ALLOWED_ORIGIN}, http://127.0.0.1:5173",
    }
    values.update(overrides)
    return Settings.model_validate(values)


def session_cookie_header(token: str) -> dict[str, str]:
    # Secure 쿠키는 http TestClient 쿠키 저장소가 다시 보내지 않으므로 헤더로 직접 싣는다.
    return {"Cookie": f"{SESSION_COOKIE_NAME}={token}"}


# --- db 테스트 기반 ---


def _test_database_url() -> URL:
    """db-test 접속 URL. 호스트는 TEST_DB_HOST 만 쓰고 포트·DB 이름·계정은 DB_* 값을 쓴다.

    TEST_DB_HOST 가 없거나 개발 DB 호스트와 같으면 건너뛰지 않고 실패시킨다.
    건너뛰면 db 테스트가 한 건도 돌지 않은 채 통과(false-green)하고, 같으면 개발 DB 를 롤백 대상으로 쓰게 된다.
    """
    settings = get_settings()
    test_host = os.environ.get(TEST_DB_HOST_ENV, "").strip()
    if not test_host:
        pytest.fail(
            f"{TEST_DB_HOST_ENV} 가 없어 db 테스트를 실행할 수 없습니다. "
            "docker compose 의 backend 컨테이너(db-test)에서 실행하거나, DB 없는 테스트만 -m \"not db\" 로 실행하세요."
        )
    if test_host == settings.db_host:
        pytest.fail(
            f"{TEST_DB_HOST_ENV} 가 개발 DB 호스트(DB_HOST)와 같습니다. db 테스트는 테스트 전용 DB 에만 접속합니다."
        )
    return build_database_url(settings.model_copy(update={"db_host": test_host}))


@pytest.fixture(scope="session")
def db_engine() -> Iterator[Engine]:
    engine = create_engine(_test_database_url(), pool_pre_ping=True)
    # ini 파일 없이 만든 Config 는 env.py 의 fileConfig(로깅 재설정)를 건너뛰어, 앱 로거가 꺼지지 않는다.
    alembic_config = Config()
    alembic_config.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    with engine.connect() as connection:
        alembic_config.attributes["connection"] = connection
        command.upgrade(alembic_config, MIGRATION_HEAD)
        connection.commit()
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine: Engine) -> Iterator[Session]:
    # 서비스의 commit 은 savepoint 해제로만 끝나고, 테스트가 끝나면 바깥 트랜잭션을 롤백해 데이터를 남기지 않는다.
    with db_engine.connect() as connection:
        outer_transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            session.close()
            outer_transaction.rollback()


@pytest.fixture
def admin_client(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """설정과 DB 세션을 테스트용으로 바꾼 앱 클라이언트. 인증 헤더는 admin_headers 로 따로 싣는다."""
    monkeypatch.setattr(service, "MIN_PASSWORD_HASH_MEMORY_KIB", TEST_HASH_MEMORY_KIB)
    settings = make_settings()
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_db_session] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def admin_headers() -> dict[str, str]:
    """유효한 세션 쿠키와 허용 Origin. GET 은 Origin 이 없어도 되지만 POST 와 같은 헤더로 통일한다."""
    return {**session_cookie_header(issue_session_token(make_settings())), "Origin": ALLOWED_ORIGIN}
