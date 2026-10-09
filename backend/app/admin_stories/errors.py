"""이야기 발행 · 판 내용 조회 유스케이스의 도메인 오류(D-37)."""

from enum import StrEnum


class StoryErrorCode(StrEnum):
    STORY_NOT_FOUND = "story_not_found"
    STORY_VERSION_NOT_FOUND = "story_version_not_found"
    DATASET_NOT_FOUND = "dataset_not_found"
    VERSION_NOT_FOUND = "version_not_found"
    VERSION_NOT_DONE = "version_not_done"
    CONTENT_INVALID = "content_invalid"
    DATASETS_MISMATCH = "datasets_mismatch"
    DATASET_VERSION_NOT_DONE = "dataset_version_not_done"
    DATASET_FILE_MISSING = "dataset_file_missing"
    PUBLISH_UNCHANGED = "publish_unchanged"
    PUBLISH_INCOMPLETE = "publish_incomplete"
    VERSION_NOT_RETRYABLE = "version_not_retryable"
    VERSION_NOT_RESTORABLE = "version_not_restorable"
    VERSION_NOT_REWRITABLE = "version_not_rewritable"
    CONCURRENT_CHANGE = "concurrent_change"


ERROR_MESSAGES: dict[StoryErrorCode, str] = {
    StoryErrorCode.STORY_NOT_FOUND: "등록할 수 없는 이야기입니다.",
    StoryErrorCode.STORY_VERSION_NOT_FOUND: "없는 이야기 판입니다.",
    StoryErrorCode.DATASET_NOT_FOUND: "없는 데이터 묶음입니다.",
    StoryErrorCode.VERSION_NOT_FOUND: "없는 판입니다.",
    StoryErrorCode.VERSION_NOT_DONE: "확정된 판만 내용을 볼 수 있습니다.",
    StoryErrorCode.CONTENT_INVALID: "이 판의 내용을 판 파일 형식으로 만들지 못했습니다.",
    StoryErrorCode.DATASETS_MISMATCH: "이 이야기가 쓰는 데이터 묶음과 고른 묶음이 다릅니다.",
    StoryErrorCode.DATASET_VERSION_NOT_DONE: "확정된 데이터 판만 고를 수 있습니다.",
    StoryErrorCode.DATASET_FILE_MISSING: "고른 데이터 판의 판 파일이 없습니다. 데이터 묶음에서 다시 시도로 복구하세요.",
    StoryErrorCode.PUBLISH_UNCHANGED: "지금 공개된 판과 제목 · 요약 · 데이터 판이 같아 발행할 것이 없습니다.",
    StoryErrorCode.PUBLISH_INCOMPLETE: "끝나지 않은 발행이 있습니다. 다시 불러온 뒤 시도하세요.",
    StoryErrorCode.VERSION_NOT_RETRYABLE: "가장 최근의 실패한 판만 다시 시도할 수 있습니다.",
    StoryErrorCode.VERSION_NOT_RESTORABLE: "지금 공개된 판이 아닌, 공개됐던 판으로만 되돌릴 수 있습니다.",
    StoryErrorCode.VERSION_NOT_REWRITABLE: "가장 최근 판이 공개된(done) 판일 때만 공개 파일을 다시 쓸 수 있습니다.",
    StoryErrorCode.CONCURRENT_CHANGE: "다른 발행과 겹쳤습니다. 다시 불러온 뒤 시도하세요.",
}


class StoryServiceError(Exception):
    def __init__(self, code: StoryErrorCode, problems: list[str] | None = None) -> None:
        super().__init__(code.value)
        self.code = code
        self.message = ERROR_MESSAGES[code]
        self.problems = problems
