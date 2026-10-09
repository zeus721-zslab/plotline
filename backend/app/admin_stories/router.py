"""이야기 발행 관리자 API 와 데이터 판 내용 API(D-37).

보호 의존성을 직접 두지 않는다. main 에서 admin_router 아래에 포함되어 캐시 금지 · Origin 검사 · 세션 확인을 물려받는다.
{story} 형식은 경로에서 검사하지 않고 서비스가 registry 로 본다(없으면 404).
"""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path as FilePath
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.admin_auth.dependencies import CACHE_CONTROL_HEADER, NO_STORE
from app.admin_imports.router import _is_lock_conflict
from app.admin_stories.errors import StoryErrorCode, StoryServiceError
from app.admin_stories.schemas import (
    MAX_VERSION_NO,
    PublishStoryRequest,
    StoryDetailResponse,
    StoryPublishResponse,
    StoryRewriteResponse,
    StorySummaryResponse,
    to_detail_response,
    to_publish_response,
    to_rewrite_response,
    to_summary_response,
)
from app.admin_stories.service import (
    get_story,
    list_stories,
    publish_story,
    read_dataset_version_content,
    restore_story,
    retry_story,
    rewrite_story,
)
from app.config import Settings, get_settings
from app.db import get_db_session

JSON_MEDIA_TYPE = "application/json"

ERROR_STATUS: dict[StoryErrorCode, int] = {
    StoryErrorCode.STORY_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    StoryErrorCode.STORY_VERSION_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    StoryErrorCode.DATASET_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    StoryErrorCode.VERSION_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    StoryErrorCode.VERSION_NOT_DONE: status.HTTP_409_CONFLICT,
    StoryErrorCode.CONTENT_INVALID: status.HTTP_409_CONFLICT,
    StoryErrorCode.DATASETS_MISMATCH: status.HTTP_422_UNPROCESSABLE_CONTENT,
    StoryErrorCode.DATASET_VERSION_NOT_DONE: status.HTTP_409_CONFLICT,
    StoryErrorCode.DATASET_FILE_MISSING: status.HTTP_409_CONFLICT,
    StoryErrorCode.PUBLISH_UNCHANGED: status.HTTP_409_CONFLICT,
    StoryErrorCode.PUBLISH_INCOMPLETE: status.HTTP_409_CONFLICT,
    StoryErrorCode.VERSION_NOT_RETRYABLE: status.HTTP_409_CONFLICT,
    StoryErrorCode.VERSION_NOT_RESTORABLE: status.HTTP_409_CONFLICT,
    StoryErrorCode.VERSION_NOT_REWRITABLE: status.HTTP_409_CONFLICT,
    StoryErrorCode.CONCURRENT_CHANGE: status.HTTP_409_CONFLICT,
}

stories_router = APIRouter(prefix="/stories")
# admin_imports/router.py 의 datasets_router 와 같은 prefix 를 쓰지만 경로가 겹치지 않는다(…/versions/{n}/content).
dataset_content_router = APIRouter(prefix="/datasets")

DbSession = Annotated[Session, Depends(get_db_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]
VersionNoPath = Annotated[int, Path(ge=1, le=MAX_VERSION_NO)]


def to_http_error(error: StoryServiceError) -> HTTPException:
    # HTTPException 으로 바꿔 던져야 admin_router 의 apply_no_store 가 오류 응답에도 no-store 를 붙인다.
    detail: dict[str, object] = {"code": error.code.value, "message": error.message}
    if error.problems is not None:
        detail["problems"] = error.problems
    return HTTPException(status_code=ERROR_STATUS[error.code], detail=detail)


@contextmanager
def http_errors() -> Iterator[None]:
    """도메인 오류와 DB 잠금 충돌(1213 · 1205)을 HTTP 오류로 바꾼다. 그 밖의 OperationalError 는 그대로 올린다."""
    try:
        yield
    except StoryServiceError as error:
        raise to_http_error(error) from error
    except OperationalError as error:
        if not _is_lock_conflict(error):
            raise
        raise to_http_error(StoryServiceError(StoryErrorCode.CONCURRENT_CHANGE)) from error


# --- 데이터 판 내용(문구 대조 · 미리보기) ---


@dataset_content_router.get("/{slug}/versions/{version_no}/content")
def get_dataset_version_content(slug: str, version_no: VersionNoPath, session: DbSession) -> Response:
    with http_errors():
        content = read_dataset_version_content(session, slug, version_no)
    # 직접 만든 Response 는 라우터 의존성이 붙인 헤더를 잃으므로 no-store 를 여기서 싣는다.
    return Response(content=content, media_type=JSON_MEDIA_TYPE, headers={CACHE_CONTROL_HEADER: NO_STORE})


# --- 이야기 ---


@stories_router.get("")
def get_stories(session: DbSession, settings: AppSettings) -> list[StorySummaryResponse]:
    with http_errors():
        overviews = list_stories(session, FilePath(settings.published_dir))
    return [to_summary_response(overview) for overview in overviews]


@stories_router.get("/{story}")
def get_story_detail(story: str, session: DbSession, settings: AppSettings) -> StoryDetailResponse:
    with http_errors():
        detail = get_story(session, story, FilePath(settings.published_dir))
    return to_detail_response(detail)


@stories_router.post("/{story}/publish", status_code=status.HTTP_201_CREATED)
def post_publish_story(
    story: str, body: PublishStoryRequest, session: DbSession, settings: AppSettings
) -> StoryPublishResponse:
    with http_errors():
        result = publish_story(
            session, story, body.title, body.summary, body.datasets, FilePath(settings.published_dir)
        )
    return to_publish_response(result)


@stories_router.post("/{story}/versions/{version_no}/retry")
def post_retry_story(
    story: str, version_no: VersionNoPath, session: DbSession, settings: AppSettings
) -> StoryPublishResponse:
    with http_errors():
        result = retry_story(session, story, version_no, FilePath(settings.published_dir))
    return to_publish_response(result)


@stories_router.post("/{story}/versions/{version_no}/restore", status_code=status.HTTP_201_CREATED)
def post_restore_story(
    story: str, version_no: VersionNoPath, session: DbSession, settings: AppSettings
) -> StoryPublishResponse:
    with http_errors():
        result = restore_story(session, story, version_no, FilePath(settings.published_dir))
    return to_publish_response(result)


@stories_router.post("/{story}/rewrite")
def post_rewrite_story(story: str, session: DbSession, settings: AppSettings) -> StoryRewriteResponse:
    # 쓰기 실패도 200 이고 write_error 에 코드를 싣는다(판 상태는 done 그대로).
    with http_errors():
        result = rewrite_story(session, story, FilePath(settings.published_dir))
    return to_rewrite_response(result)
