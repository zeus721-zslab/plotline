"""관리자 인증 규칙(D-20): 단일 관리자 계정 검증과 서명된 세션 토큰 발급·검증."""

import hashlib
import hmac
import logging
import threading
from enum import StrEnum
from urllib.parse import urlsplit

from argon2 import PasswordHasher, Type, extract_parameters
from argon2.exceptions import InvalidHashError, VerificationError
from itsdangerous import BadData, SignatureExpired, URLSafeTimedSerializer

from app.config import Settings

logger = logging.getLogger(__name__)

SESSION_COOKIE_NAME = "plotline_admin"
SESSION_COOKIE_PATH = "/api/admin"
SESSION_MAX_AGE_SECONDS = 8 * 60 * 60
MIN_SESSION_SECRET_BYTES = 32
# 같은 비밀키를 다른 용도의 서명에 재사용해도 토큰이 섞이지 않게 용도를 구분한다.
SESSION_SIGNING_SALT = "plotline-admin-session"
# 비밀번호 해시 지문을 salt 에 넣어, 비밀번호를 바꾸면 SESSION_SECRET 을 그대로 두어도 기존 세션이 무효가 된다.
PASSWORD_FINGERPRINT_HEX_LENGTH = 16
SESSION_USERNAME_KEY = "username"

# 해시 비용(memory_cost, KiB) 허용 범위. 하한은 OWASP argon2id 최소 권고(19MiB), 상한은 운영 api 메모리 상한(256m)에서
# 검증 1회가 절반을 넘지 않게 128MiB. 범위 밖이면 너무 약하거나 컨테이너를 종료시킬 수 있는 설정이라 비활성으로 둔다.
MIN_PASSWORD_HASH_MEMORY_KIB = 19456
MAX_PASSWORD_HASH_MEMORY_KIB = 131072

ALLOWED_ORIGIN_SCHEMES = frozenset({"http", "https"})

# verify 는 해시 문자열에 기록된 비용 파라미터를 쓰므로 기본 인스턴스로 충분하다.
_password_hasher = PasswordHasher()
# argon2 기본 파라미터는 검증 1회에 약 64MiB를 쓴다. 운영 api 메모리 상한(256m)에서 동시 로그인 요청으로
# 컨테이너가 종료되지 않도록 동시 검증 수를 제한한다. 초과 요청은 기다리지 않고 바로 BUSY 로 돌려보내,
# 대기 요청이 스레드풀 작업자를 붙잡아 다른 요청까지 막는 일을 피한다.
MAX_CONCURRENT_PASSWORD_VERIFICATIONS = 1
_password_verification_slots = threading.BoundedSemaphore(MAX_CONCURRENT_PASSWORD_VERIFICATIONS)


class LoginOutcome(StrEnum):
    SUCCESS = "success"
    INVALID_CREDENTIALS = "invalid_credentials"
    DISABLED = "disabled"
    BUSY = "busy"


def _password_hash_problem(password_hash: str) -> str | None:
    try:
        parameters = extract_parameters(password_hash)
    except InvalidHashError:
        return "ADMIN_PASSWORD_HASH is not an argon2id hash"
    if parameters.type is not Type.ID:
        return "ADMIN_PASSWORD_HASH is not an argon2id hash"
    if not MIN_PASSWORD_HASH_MEMORY_KIB <= parameters.memory_cost <= MAX_PASSWORD_HASH_MEMORY_KIB:
        return (
            "ADMIN_PASSWORD_HASH memory_cost out of allowed range "
            f"({MIN_PASSWORD_HASH_MEMORY_KIB}..{MAX_PASSWORD_HASH_MEMORY_KIB} KiB)"
        )
    return None


def _is_canonical_origin(origin: str) -> bool:
    """브라우저가 보내는 Origin 표기(scheme://host[:port], 소문자 호스트, 경로·끝 슬래시 없음)와 같은지 확인한다."""
    try:
        parts = urlsplit(origin)
        port = parts.port
    except ValueError:
        return False
    if parts.scheme not in ALLOWED_ORIGIN_SCHEMES or not parts.hostname:
        return False
    host = f"[{parts.hostname}]" if ":" in parts.hostname else parts.hostname
    canonical = f"{parts.scheme}://{host}" if port is None else f"{parts.scheme}://{host}:{port}"
    # 다시 조립한 값과 다르면 대문자·경로·쿼리·사용자 정보·끝 슬래시 등이 섞인 것이다.
    return origin == canonical


def _allowed_origins_problem(settings: Settings) -> str | None:
    origins = settings.allowed_origin_set()
    if not origins:
        return "ADMIN_ALLOWED_ORIGINS is empty"
    if not all(_is_canonical_origin(origin) for origin in origins):
        return "ADMIN_ALLOWED_ORIGINS has an entry not in scheme://host[:port] form"
    return None


def find_admin_auth_settings_problems(settings: Settings) -> list[str]:
    """관리자 인증을 끄게 만드는 설정 문제 목록(값 원문은 담지 않는다). 로그는 남기지 않는다."""
    problems: list[str] = []
    if not settings.admin_username:
        problems.append("ADMIN_USERNAME is empty")
    password_hash_problem = _password_hash_problem(settings.admin_password_hash.get_secret_value())
    if password_hash_problem is not None:
        problems.append(password_hash_problem)
    if len(settings.session_secret.get_secret_value().encode("utf-8")) < MIN_SESSION_SECRET_BYTES:
        problems.append(f"SESSION_SECRET shorter than {MIN_SESSION_SECRET_BYTES} bytes")
    origins_problem = _allowed_origins_problem(settings)
    if origins_problem is not None:
        problems.append(origins_problem)
    return problems


def is_admin_auth_enabled(settings: Settings) -> bool:
    """사용자명이 있고, 해시가 비용 범위 안의 argon2id 이고, 비밀키가 충분히 길고, 허용 Origin 목록이
    올바를 때만 관리자 인증을 켠다(fail closed).

    빈 값·형식 오류 모두 비활성이며, 이때는 이미 발급된 세션도 받지 않는다.
    요청마다 호출되므로 로그를 남기지 않는다. 설정 문제는 기동 시 log_admin_auth_settings 가 1회 기록한다.
    """
    return not find_admin_auth_settings_problems(settings)


def warn_insecure_cookie_with_https_origin(settings: Settings) -> None:
    """https 출처를 허용하면서 Secure 쿠키를 끈 설정을 경고한다. 로컬(http 개발 + 운영 출처 병기)에서는 정상 조합이라 비활성으로 두지 않는다."""
    has_https_origin = any(origin.startswith("https://") for origin in settings.allowed_origin_set())
    if has_https_origin and not settings.session_cookie_secure:
        logger.warning(
            "ADMIN_ALLOWED_ORIGINS includes https origin but SESSION_COOKIE_SECURE=false; "
            "set true in production"
        )


def log_admin_auth_settings(settings: Settings) -> None:
    """앱 기동 시 1회 설정 상태를 기록한다. 요청 경로에서 기록하면 요청 수만큼 로그가 늘어나므로 여기서만 남긴다."""
    problems = find_admin_auth_settings_problems(settings)
    if problems:
        logger.error("admin auth disabled by settings: %s", "; ".join(problems))
    warn_insecure_cookie_with_https_origin(settings)


def authenticate(settings: Settings, username: str, password: str) -> LoginOutcome:
    if not is_admin_auth_enabled(settings):
        return LoginOutcome.DISABLED

    # 아이디가 틀려도 설정된 해시로 검증을 1회 수행해 아이디 존재 여부가 응답 시간으로 드러나지 않게 한다.
    username_matches = hmac.compare_digest(
        username.encode("utf-8"), settings.admin_username.encode("utf-8")
    )
    if not _password_verification_slots.acquire(blocking=False):
        logger.warning("admin login rejected: password verification slots busy")
        return LoginOutcome.BUSY
    try:
        password_matches = _password_hasher.verify(
            settings.admin_password_hash.get_secret_value(), password
        )
    except VerificationError:
        password_matches = False
    except InvalidHashError:
        # 형식은 is_admin_auth_enabled 에서 확인했지만, 본문 손상처럼 파싱 뒤에 드러나는 오류도 비활성으로 취급한다.
        # 이 상태는 기동 검사(파라미터 해석)로 드러나지 않아 요청마다 기록된다. 로그인 실패 로그와 같은 빈도라 증폭은 없다.
        logger.error("ADMIN_PASSWORD_HASH could not be verified; admin login disabled")
        return LoginOutcome.DISABLED
    finally:
        _password_verification_slots.release()

    if username_matches and password_matches:
        return LoginOutcome.SUCCESS
    logger.warning("admin login failed")
    return LoginOutcome.INVALID_CREDENTIALS


def _password_hash_fingerprint(settings: Settings) -> str:
    # 지문은 서명 salt 계산에만 쓰고 로그·응답에 남기지 않는다.
    digest = hashlib.sha256(settings.admin_password_hash.get_secret_value().encode("utf-8"))
    return digest.hexdigest()[:PASSWORD_FINGERPRINT_HEX_LENGTH]


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(
        settings.session_secret.get_secret_value(),
        salt=f"{SESSION_SIGNING_SALT}:{_password_hash_fingerprint(settings)}",
    )


def issue_session_token(settings: Settings) -> str:
    """사용자명을 담고 발급 시각은 서명에 포함된 타임스탬프로 기록한다."""
    return _serializer(settings).dumps({SESSION_USERNAME_KEY: settings.admin_username})


def read_session_username(settings: Settings, token: str) -> str | None:
    """유효한 세션이면 사용자명, 아니면 None. 만료는 서명 검증 시 max_age 로 강제한다."""
    if not is_admin_auth_enabled(settings):
        return None
    try:
        payload = _serializer(settings).loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    except SignatureExpired:
        return None
    except BadData:
        logger.warning("admin session cookie signature invalid")
        return None

    if not isinstance(payload, dict):
        return None
    username = payload.get(SESSION_USERNAME_KEY)
    if not isinstance(username, str):
        return None
    # ADMIN_USERNAME 이 바뀌면 이전 계정으로 발급된 세션은 받지 않는다.
    if not hmac.compare_digest(username.encode("utf-8"), settings.admin_username.encode("utf-8")):
        return None
    return username
