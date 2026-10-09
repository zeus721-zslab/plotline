"""이야기 발행 관리자 API 의 요청 · 응답 형식(D-37). 시각은 UTC 로 저장하고 응답에 Z 를 붙인다."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.admin_imports.schemas import to_utc_iso
from app.admin_stories.service import (
    StoryDatasetChoice,
    StoryDetail,
    StoryOverview,
    StoryPublishResult,
    StoryRewriteResult,
    StoryVersionView,
)
from app.data_core.enums import PublishStatus
from app.publishing.story_file import PublicFileStatus
from app.data_core.models import SLUG_MAX_LENGTH, SLUG_PATTERN, STORY_SUMMARY_MAX_LENGTH, STORY_TITLE_MAX_LENGTH

# story_versions.version_no · dataset_versions.version_no 는 INT(부호 있음). 넘는 값은 DB 비교 전에 422 로 끝낸다.
MAX_VERSION_NO = 2**31 - 1
# 이야기 하나가 쓰는 묶음 수 상한(요청 크기 제한용, registry 는 2개씩)
MAX_STORY_DATASETS = 16

DatasetSlug = Annotated[str, StringConstraints(min_length=1, max_length=SLUG_MAX_LENGTH, pattern=SLUG_PATTERN)]
VersionNo = Annotated[int, Field(strict=True, ge=1, le=MAX_VERSION_NO)]


class PublishStoryRequest(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=STORY_TITLE_MAX_LENGTH)]
    summary: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=STORY_SUMMARY_MAX_LENGTH)
    ]
    # 이름 집합이 registry 와 같은지 · 각 판이 공개 판인지는 서비스가 본다(도메인 규칙).
    datasets: Annotated[dict[DatasetSlug, VersionNo], Field(min_length=1, max_length=MAX_STORY_DATASETS)]


class StoryVersionResponse(BaseModel):
    version_no: int
    status: PublishStatus
    title: str
    summary: str
    datasets: dict[str, int]
    published_at: str | None
    publish_error: str | None
    created_at: str


class DoneDatasetVersionResponse(BaseModel):
    version_no: int
    file_present: bool


class StoryDatasetResponse(BaseModel):
    name: str
    done_versions: list[DoneDatasetVersionResponse]
    current_version: int | None
    newer_than_current: bool


class StorySummaryResponse(BaseModel):
    story: str
    latest_version_no: int | None
    latest_status: PublishStatus | None
    latest_done: StoryVersionResponse | None
    datasets: list[StoryDatasetResponse]
    # 공개 이야기 파일 상태(공개 판이 없으면 None). 경로는 싣지 않는다.
    public_file: PublicFileStatus | None


class StoryDetailResponse(StorySummaryResponse):
    versions: list[StoryVersionResponse]


class StoryPublishResponse(BaseModel):
    story: str
    version_no: int
    status: PublishStatus
    published_at: str | None
    publish_error: str | None


class StoryRewriteResponse(BaseModel):
    story: str
    version_no: int
    published_at: str
    # 쓰기 실패 코드(성공이면 None). 판 상태는 바뀌지 않는다.
    write_error: str | None


def _optional_utc_iso(value: datetime | None) -> str | None:
    return None if value is None else to_utc_iso(value)


def _version_response(version: StoryVersionView) -> StoryVersionResponse:
    return StoryVersionResponse(
        version_no=version.version_no,
        status=version.status,
        title=version.title,
        summary=version.summary,
        datasets=version.datasets,
        published_at=_optional_utc_iso(version.published_at),
        publish_error=version.publish_error,
        created_at=to_utc_iso(version.created_at),
    )


def _dataset_response(choice: StoryDatasetChoice) -> StoryDatasetResponse:
    return StoryDatasetResponse(
        name=choice.name,
        done_versions=[
            DoneDatasetVersionResponse(version_no=version.version_no, file_present=version.file_present)
            for version in choice.done_versions
        ],
        current_version=choice.current_version,
        newer_than_current=choice.newer_than_current,
    )


def _summary_fields(overview: StoryOverview) -> dict[str, object]:
    return {
        "story": overview.story,
        "latest_version_no": None if overview.latest is None else overview.latest.version_no,
        "latest_status": None if overview.latest is None else overview.latest.status,
        "latest_done": None if overview.latest_done is None else _version_response(overview.latest_done),
        "datasets": [_dataset_response(choice) for choice in overview.datasets],
        "public_file": overview.public_file,
    }


def to_summary_response(overview: StoryOverview) -> StorySummaryResponse:
    return StorySummaryResponse.model_validate(_summary_fields(overview))


def to_detail_response(detail: StoryDetail) -> StoryDetailResponse:
    return StoryDetailResponse.model_validate(
        {**_summary_fields(detail.overview), "versions": [_version_response(version) for version in detail.versions]}
    )


def to_publish_response(result: StoryPublishResult) -> StoryPublishResponse:
    return StoryPublishResponse(
        story=result.story,
        version_no=result.version_no,
        status=result.status,
        published_at=_optional_utc_iso(result.published_at),
        publish_error=result.publish_error,
    )


def to_rewrite_response(result: StoryRewriteResult) -> StoryRewriteResponse:
    return StoryRewriteResponse(
        story=result.story,
        version_no=result.version_no,
        published_at=to_utc_iso(result.published_at),
        write_error=result.write_error,
    )
