from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
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

    # 세션 쿠키 서명 키. 교체하면 발급된 모든 세션이 무효화된다(D-20).
    session_secret: SecretStr = SecretStr("")
    # 로컬 http 개발에서만 false. 운영 https 는 true.
    session_cookie_secure: bool = True
    # 쉼표 구분 Origin 목록. pydantic-settings 는 list 타입 환경변수를 JSON 으로 해석하므로 문자열로 받아 나눈다.
    admin_allowed_origins: str = ""

    @field_validator("admin_username")
    @classmethod
    def strip_admin_username(cls, value: str) -> str:
        # 활성 판정·로그인 비교·세션 발급이 모두 같은 값을 쓰도록 앞뒤 공백을 여기서 한 번만 제거한다.
        return value.strip()

    def allowed_origin_set(self) -> frozenset[str]:
        return frozenset(
            origin.strip() for origin in self.admin_allowed_origins.split(",") if origin.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
