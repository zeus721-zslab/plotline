from enum import StrEnum


class ImportSourceType(StrEnum):
    """데이터가 들어온 경로."""

    UPLOAD = "upload"
    CLAUDE = "claude"
    API = "api"


class SourceKind(StrEnum):
    """행 출처 유형(D-18). external 은 외부 자료, self 는 직접 작성."""

    EXTERNAL = "external"
    SELF = "self"


class RowStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    # 같은 구분 칸의 더 새 줄이 들어오거나 승인되어 밀려난 줄(D-28). 기록본 후보 · 검토 대상에서 빠진다.
    SUPERSEDED = "superseded"


class ChangeKind(StrEnum):
    """붙여넣은 줄이 같은 구분 칸의 현재 승인 줄과 비교해 어떤 변화인지(D-28). 저장하지 않는 "변화 없음"은 값으로 두지 않는다."""

    NEW = "new"
    CHANGED = "changed"
    AS_OF_ONLY = "as_of_only"
    # 구조가 바뀌어 승인 줄을 새 구조로 다시 검사해 만든 줄
    CARRIED = "carried"


class PublishStatus(StrEnum):
    """기록본의 발행 파일 상태(D-29 · D-30). pending: 기록본 저장 후 파일 쓰기 전 · 중단 / done: 파일 있음 / failed: 쓰기 실패
    / abandoned: 미완료를 폐기(번호 소진, 줄 · 파일은 그대로)."""

    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"
    ABANDONED = "abandoned"


class FieldType(StrEnum):
    TEXT = "text"
    INT = "int"
    NUMBER = "number"
    YEAR = "year"
    DATE = "date"
    CATEGORY = "category"
    URL = "url"
    BOOL = "bool"


class RowErrorCode(StrEnum):
    """행 검사 오류 코드. 관리자 화면·저장 JSON 에서 이 문자열을 그대로 쓴다."""

    REQUIRED = "required"
    TYPE = "type"
    MIN = "min"
    MAX = "max"
    MAX_LENGTH = "max_length"
    OPTION = "option"
    UNKNOWN_FIELD = "unknown_field"
    DUPLICATE_KEY = "duplicate_key"
    KEY_TOO_LONG = "key_too_long"
    KEY_SEPARATOR = "key_separator"
    SOURCE_KIND_MISSING = "source_kind_missing"
    SOURCE_KIND_INVALID = "source_kind_invalid"
    SOURCE_URL_MISSING = "source_url_missing"
    SOURCE_URL_INVALID = "source_url_invalid"
    AS_OF_DATE_MISSING = "as_of_date_missing"
    AS_OF_DATE_INVALID = "as_of_date_invalid"
    SELF_NOT_ALLOWED = "self_not_allowed"
