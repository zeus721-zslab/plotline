"""관리자 API 경계 의존성: 캐시 금지 헤더, 인증 활성 확인, 요청 출처(CSRF) 검사와 세션 확인."""

import logging
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, Response, status

from app.admin_auth.service import (
    SESSION_COOKIE_NAME,
    is_admin_auth_enabled,
    read_session_username,
)
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

STATE_CHANGING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
FORBIDDEN_ORIGIN_DETAIL = "허용되지 않은 요청 출처입니다."
UNAUTHENTICATED_DETAIL = "로그인이 필요합니다."
LOGIN_DISABLED_DETAIL = "관리자 로그인이 비활성 상태입니다."
CACHE_CONTROL_HEADER = "Cache-Control"
NO_STORE = "no-store"


async def apply_no_store(response: Response) -> AsyncIterator[None]:
    """관리자 응답은 브라우저·중간 캐시에 남기지 않는다.

    성공 응답은 주입된 Response 헤더로, 이후 의존성·엔드포인트가 던진 HTTPException 은
    같은 헤더를 붙여 다시 던져 오류 응답에도 적용한다. 요청 본문 검증 실패(422)는 HTTPException 이
    아니어서 여기서 붙지 않고, main 의 전역 검증 오류 처리기가 붙인다. I/O 가 없으므로 async 로 두어 스레드풀 작업을 늘리지 않는다.
    """
    response.headers[CACHE_CONTROL_HEADER] = NO_STORE
    try:
        yield
    except HTTPException as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
            headers={**(error.headers or {}), CACHE_CONTROL_HEADER: NO_STORE},
        ) from error


def require_admin_auth_enabled(settings: Annotated[Settings, Depends(get_settings)]) -> None:
    """설정 오류로 인증이 꺼져 있으면 Origin 검사보다 먼저 503 으로 알린다(허용 목록 자체가 잘못된 경우 포함)."""
    # 설정 문제는 기동 시 1회만 기록한다(요청마다 남기면 요청으로 로그를 늘릴 수 있다).
    if not is_admin_auth_enabled(settings):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=LOGIN_DISABLED_DETAIL
        )


def require_allowed_origin(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> None:
    """상태 변경 요청은 Origin 헤더가 허용 목록에 있어야 한다. 헤더가 없어도 거부한다(D-20)."""
    if request.method not in STATE_CHANGING_METHODS:
        return
    origin = request.headers.get("origin")
    if origin is None or origin not in settings.allowed_origin_set():
        logger.warning("admin request rejected: origin not allowed")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=FORBIDDEN_ORIGIN_DETAIL)


def require_admin(
    settings: Annotated[Settings, Depends(get_settings)],
    session_cookie: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> str:
    """유효한 관리자 세션의 사용자명을 돌려준다. 인증 비활성·쿠키 없음·변조·만료는 모두 401."""
    if session_cookie is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=UNAUTHENTICATED_DETAIL)
    username = read_session_username(settings, session_cookie)
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=UNAUTHENTICATED_DETAIL)
    return username
