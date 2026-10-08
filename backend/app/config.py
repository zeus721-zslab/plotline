from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """환경변수에서 읽는 앱 설정. 값은 .env(로컬) 또는 운영 환경변수로 주입한다."""

    app_env: Literal["local", "production"] = "local"

    db_host: str = "db"
    db_port: int = 3306
    db_name: str = ""
    db_user: str = ""
    db_password: SecretStr = SecretStr("")

    admin_username: str = ""
    admin_password_hash: SecretStr = SecretStr("")


@lru_cache
def get_settings() -> Settings:
    return Settings()
