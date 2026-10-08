from sqlalchemy import URL
from sqlalchemy.orm import DeclarativeBase

from app.config import Settings


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
