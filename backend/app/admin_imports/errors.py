"""관리자 데이터 입력 · 검토 · 기록본 유스케이스의 도메인 오류. 붙여넣기(paste)와 검토(service)가 함께 쓴다."""

from enum import StrEnum


class ImportErrorCode(StrEnum):
    DATASET_NOT_FOUND = "dataset_not_found"
    DATASET_REQUIRED = "dataset_required"
    DATASET_MISMATCH = "dataset_mismatch"
    DATASET_CONFIRMATION_REQUIRED = "dataset_confirmation_required"
    DATASET_CONFLICT = "dataset_conflict"
    CONCURRENT_CHANGE = "concurrent_change"
    INVALID_BUNDLE = "invalid_bundle"
    INVALID_FIELDS = "invalid_fields"
    SCHEMA_MISSING = "schema_missing"
    SCHEMA_CONFIRMATION_REQUIRED = "schema_confirmation_required"
    SCHEMA_VERSION_CONFLICT = "schema_version_conflict"
    ROW_NOT_FOUND = "row_not_found"
    ROW_NOT_PENDING = "row_not_pending"
    EXCLUSION_NOT_FOUND = "exclusion_not_found"
    VERSION_EMPTY = "version_empty"
    VERSION_UNCHANGED = "version_unchanged"
    VERSION_CONFLICT = "version_conflict"


ERROR_MESSAGES: dict[ImportErrorCode, str] = {
    ImportErrorCode.DATASET_NOT_FOUND: "없는 데이터 묶음입니다.",
    ImportErrorCode.DATASET_REQUIRED: "묶음에 'dataset'(주소 이름 · 제목)이 있어야 어느 데이터 묶음인지 정할 수 있습니다.",
    ImportErrorCode.DATASET_MISMATCH: "묶음의 주소 이름이 지금 보고 있는 데이터 묶음과 다릅니다.",
    ImportErrorCode.DATASET_CONFIRMATION_REQUIRED: "새 데이터 묶음을 만들지 확인하세요.",
    ImportErrorCode.DATASET_CONFLICT: "같은 주소 이름의 데이터 묶음이 동시에 만들어졌습니다. 다시 확인하세요.",
    ImportErrorCode.CONCURRENT_CHANGE: "확인한 뒤 다른 처리로 데이터 묶음 · 줄 상태가 바뀌었습니다. 다시 확인하세요.",
    ImportErrorCode.INVALID_BUNDLE: "붙여넣은 묶음의 형식에 문제가 있습니다.",
    ImportErrorCode.INVALID_FIELDS: "묶음의 구조에 문제가 있습니다.",
    ImportErrorCode.SCHEMA_MISSING: "구조가 없습니다. 묶음에 'fields' 를 넣으세요.",
    ImportErrorCode.SCHEMA_CONFIRMATION_REQUIRED: "묶음의 구조가 지금 구조와 다릅니다. 새 구조로 저장할지 확인하세요.",
    ImportErrorCode.SCHEMA_VERSION_CONFLICT: "같은 구조 번호가 동시에 저장되었습니다. 다시 확인하세요.",
    ImportErrorCode.ROW_NOT_FOUND: "없는 줄입니다.",
    ImportErrorCode.ROW_NOT_PENDING: "대기 중인 줄만 제외할 수 있습니다.",
    ImportErrorCode.EXCLUSION_NOT_FOUND: "공개 제외 중인 구분 칸이 아닙니다.",
    ImportErrorCode.VERSION_EMPTY: "기록본에 넣을 승인 줄이 없습니다.",
    ImportErrorCode.VERSION_UNCHANGED: "최신 기록본과 줄 구성이 같아 새 기록본을 만들지 않았습니다.",
    ImportErrorCode.VERSION_CONFLICT: "같은 번호의 기록본이 동시에 저장되었습니다. 다시 불러온 뒤 시도하세요.",
}


class ImportServiceError(Exception):
    def __init__(
        self,
        code: ImportErrorCode,
        problems: list[str] | None = None,
        current_version: int | None = None,
    ) -> None:
        super().__init__(code.value)
        self.code = code
        self.message = ERROR_MESSAGES[code]
        self.problems = problems
        # schema_confirmation_required 에서만 의미가 있다(None 은 "구조 없음").
        self.current_version = current_version
