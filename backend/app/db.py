from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import URL, Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session

from app.config import Settings, get_settings


class Base(DeclarativeBase):
    pass


def build_database_url(settings: Settings) -> URL:
    # URL.create 는 비밀번호의 특수문자를 직접 다루므로 문자열 조립(인코딩 누락 위험)을 피한다.
    return URL.create(
        "mysql+pymysql",
        username=settings.db_user,
        password=settings.db_password.get_secret_value(),
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        query={"charset": "utf8mb4"},
    )


@lru_cache
def get_engine() -> Engine:
    """프로세스당 엔진 1개. 첫 호출 때 만들어 import 만으로는 DB 에 접속하지 않는다.

    pool_pre_ping: DB 재시작·유휴 연결 끊김 뒤 첫 요청이 끊긴 연결로 실패하지 않게 한다.
    """
    return create_engine(build_database_url(get_settings()), pool_pre_ping=True)


def get_db_session() -> Iterator[Session]:
    """FastAPI 의존성: 요청 1개 = Session 1개. commit 은 서비스 함수가 유스케이스 단위로 한다."""
    with Session(get_engine()) as session:
        yield session
