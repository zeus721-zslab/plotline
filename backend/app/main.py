from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.admin_auth.dependencies import CACHE_CONTROL_HEADER, NO_STORE
from app.admin_auth.router import admin_router, login_router
from app.admin_auth.service import log_admin_auth_settings
from app.admin_imports.router import datasets_router, paste_router
from app.config import get_settings

VALIDATION_ERROR_INPUT_KEY = "input"

settings = get_settings()
log_admin_auth_settings(settings)

# 끝 슬래시 요청을 307 로 돌려보내지 않고 404 로 끝낸다. 프록시 헤더를 신뢰하지 않으므로(D-21) 리다이렉트 Location 이
# 내부 기준 http 주소로 만들어져 https 운영에서 잘못된 곳을 가리키는 일을 피한다.
app = FastAPI(title="Plotline API", redirect_slashes=False)
app.include_router(login_router)
# 관리자 기능 라우터는 admin_router 아래에 포함해 보호 의존성을 물려받게 한다. app 에 붙이기 전에 포함해야 반영된다.
admin_router.include_router(datasets_router)
admin_router.include_router(paste_router)
app.include_router(admin_router)


@app.exception_handler(RequestValidationError)
async def validation_error_without_input(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    # 기본 처리기는 각 오류에 보낸 값(input)을 그대로 실어, 로그인 비밀번호가 응답으로 되돌아간다.
    # input 만 빼고 형식(loc·msg·type·ctx)은 유지한다. 오류 응답도 브라우저·중간 캐시에 남기지 않는다.
    errors = [
        {key: value for key, value in item.items() if key != VALIDATION_ERROR_INPUT_KEY}
        for item in error.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": jsonable_encoder(errors)},
        headers={CACHE_CONTROL_HEADER: NO_STORE},
    )


# 이벤트 루프에서 바로 응답해, 로그인 검증 등으로 스레드풀이 바쁠 때도 헬스체크가 밀리지 않게 한다.
@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
