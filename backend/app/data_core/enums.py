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
    SOURCE_KIND_MISSING = "source_kind_missing"
    SOURCE_KIND_INVALID = "source_kind_invalid"
    SOURCE_URL_MISSING = "source_url_missing"
    SOURCE_URL_INVALID = "source_url_invalid"
    AS_OF_DATE_MISSING = "as_of_date_missing"
    AS_OF_DATE_INVALID = "as_of_date_invalid"
    SELF_NOT_ALLOWED = "self_not_allowed"
