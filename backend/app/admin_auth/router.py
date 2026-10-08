"""관리자 API 라우터.

/api/admin 이하 라우트는 admin_router 에 붙인다. admin_router 는 라우터 단위 의존성으로
캐시 금지·Origin 검사·세션 확인을 강제하므로, 새 라우트가 실수로 공개되지 않는다.
세션 없이 열어야 하는 라우트는 login 하나뿐이며 login_router 에만 둔다.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.admin_auth.dependencies import (
    LOGIN_DISABLED_DETAIL,
    apply_no_store,
    require_admin,
    require_admin_auth_enabled,
    require_allowed_origin,
)
from app.admin_auth.service import (
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_PATH,
    SESSION_MAX_AGE_SECONDS,
    LoginOutcome,
    authenticate,
    issue_session_token,
)
from app.config import Settings, get_settings

ADMIN_PREFIX = "/api/admin"
# 비정상적으로 긴 입력으로 해시 계산 비용을 키우는 요청을 막는 상한
MAX_USERNAME_LENGTH = 128
MAX_PASSWORD_LENGTH = 1024
INVALID_CREDENTIALS_DETAIL = "아이디 또는 비밀번호가 올바르지 않습니다."
LOGIN_BUSY_DETAIL = "로그인 요청이 몰려 있습니다. 잠시 후 다시 시도하세요."
LOGIN_BUSY_RETRY_AFTER_SECONDS = 1

# 의존성 순서: 캐시 금지가 가장 먼저 실행되어야 뒤 의존성이 던진 오류 응답에도 헤더가 붙는다.
# 인증 비활성 확인을 Origin 검사보다 앞에 두어, 허용 목록 자체가 잘못된 설정도 403 이 아니라 503 으로 드러난다.
login_router = APIRouter(
    prefix=ADMIN_PREFIX,
    tags=["admin"],
    dependencies=[
        Depends(apply_no_store),
        Depends(require_admin_auth_enabled),
        Depends(require_allowed_origin),
    ],
)
# Origin 검사가 세션 확인보다 먼저 실행되어, 출처가 틀린 상태 변경 요청은 세션 유무와 관계없이 403이다.
admin_router = APIRouter(
    prefix=ADMIN_PREFIX,
    tags=["admin"],
    dependencies=[Depends(apply_no_store), Depends(require_allowed_origin), Depends(require_admin)],
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=MAX_USERNAME_LENGTH)
    password: str = Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)


class AdminMeResponse(BaseModel):
    username: str


@login_router.post("/login", status_code=status.HTTP_204_NO_CONTENT)
def login(
    body: LoginRequest, settings: Annotated[Settings, Depends(get_settings)], response: Response
) -> None:
    # 직접 만든 Response 를 반환하면 라우터 의존성이 붙인 헤더(no-store)가 빠지므로 주입된 Response 에 쿠키를 싣는다.
    outcome = authenticate(settings, body.username, body.password)
    if outcome is LoginOutcome.BUSY:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=LOGIN_BUSY_DETAIL,
            headers={"Retry-After": str(LOGIN_BUSY_RETRY_AFTER_SECONDS)},
        )
    if outcome is LoginOutcome.DISABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=LOGIN_DISABLED_DETAIL
        )
    if outcome is LoginOutcome.INVALID_CREDENTIALS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_CREDENTIALS_DETAIL
        )

    response.set_cookie(
        SESSION_COOKIE_NAME,
        issue_session_token(settings),
        max_age=SESSION_MAX_AGE_SECONDS,
        path=SESSION_COOKIE_PATH,
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="strict",
    )


@admin_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(settings: Annotated[Settings, Depends(get_settings)], response: Response) -> None:
    # 브라우저는 이름·Path 가 같은 쿠키만 지우므로 발급 때와 같은 속성으로 삭제한다.
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path=SESSION_COOKIE_PATH,
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="strict",
    )


@admin_router.get("/me")
def me(username: Annotated[str, Depends(require_admin)]) -> AdminMeResponse:
    return AdminMeResponse(username=username)
