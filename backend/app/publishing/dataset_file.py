"""발행 파일(공개 데이터 JSON) 만들기 · 쓰기(D-29).

- 직렬화(build_dataset_file)는 순수 함수다. 같은 입력이면 바이트가 항상 같아 재시도 때 다시 만들어 비교할 수 있다.
  형식은 frontend/src/lib/story/published.ts 의 PublishedDataset 과 같다.
- 쓰기(write_dataset_file)는 같은 폴더 임시 파일 → 하드 링크로 최종 경로를 배타적으로 만든다. 덮어쓰지 않는다
  (이야기가 판 번호로 참조하므로 한 번 공개한 파일은 바뀌면 안 된다).
"""

import errno
import hashlib
import json
import logging
import math
import os
import re
import stat
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from pathlib import Path
from typing import Any

from app.data_core.enums import FieldType, SourceKind
from app.data_core.models import SLUG_MAX_LENGTH, SLUG_PATTERN
from app.data_core.row_validation import _key_part

logger = logging.getLogger(__name__)

DATASETS_DIR_NAME = "datasets"
# 웹 서버(web)는 다른 uid 로 읽는다. 파일은 누구나 읽기 · 폴더는 누구나 들어가기.
FILE_MODE = 0o644
DIR_MODE = 0o755
CREATED_AT_FORMAT = "%Y-%m-%dT%H:%M:%SZ"
SELF_SOURCE_ID = "self"
EXTERNAL_SOURCE_ID_PREFIX = "s"
# 구분 칸 값을 숫자로 비교하는 형식(나머지는 문자열 코드포인트 비교). number 는 구분 칸으로 쓸 수 없지만 규칙상 함께 둔다.
NUMERIC_KEY_TYPES = frozenset({FieldType.INT, FieldType.NUMBER, FieldType.YEAR})
TEMP_FILE_SUFFIX = ".tmp"
# 공개 화면(JavaScript number)이 정수를 정확히 다루는 한계(Number.MAX_SAFE_INTEGER + 1).
MAX_EXACT_INTEGER = 2**53
# 기존 파일은 링크를 따라가지 않고(O_NOFOLLOW), FIFO 에서 기다리지 않고(O_NONBLOCK) 연다.
SAFE_READ_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
# 일반 파일로 열 수 없는 경우: 링크(ELOOP) · 소켓 등(ENXIO). 읽지 않고 "일반 파일 아님"으로 본다.
NOT_REGULAR_OPEN_ERRNOS = frozenset({errno.ELOOP, errno.ENXIO})
READ_CHUNK_BYTES = 64 * 1024
_SLUG_REGEX = re.compile(SLUG_PATTERN)


class UnsafePublishPath(ValueError):
    """slug · 판 번호로 만든 경로가 기대 경로와 다르다(이탈 · 중간 링크). DB 의 slug 는 검사를 거쳤으므로 버그거나 운영 조작이다."""


class ContentInvalid(ValueError):
    """기록본 내용이 공개 형식(published.ts isPublishedDataset)에 맞지 않는다. 문장에 경로를 넣지 않는다(D-30)."""


class WriteOutcome(StrEnum):
    # 새로 썼다
    WRITTEN = "written"
    # 같은 바이트의 파일이 이미 있다(재시도 · 중단 뒤 다시 쓰기)
    SAME = "same"
    # 다른 바이트의 파일이 이미 있다. 기존 파일은 그대로 둔다.
    CONFLICT = "conflict"
    # 그 밖의 쓰기 실패(링크 미지원 · 권한 · 공간 부족 등)
    FAILED = "failed"


@dataclass(frozen=True)
class PublishRow:
    """발행할 승인 줄 1개. 승인 줄은 구분 칸 · 출처 유형이 있고, external 이면 출처 링크 · 확인한 날이 있다."""

    row_key: str
    data: dict[str, Any]
    source_kind: SourceKind
    source_url: str | None
    as_of_date: date | None


@dataclass(frozen=True)
class DatasetFileInput:
    slug: str
    title: str
    version_no: int
    schema_version: int
    # 시간대 없는 UTC(DB 저장 기준)
    created_at: datetime
    fields: list[dict[str, Any]]
    rows: Sequence[PublishRow]


# --- 직렬화(순수 함수) ---


def build_dataset_file(source: DatasetFileInput) -> bytes:
    """발행 파일 바이트. UTF-8(BOM 없음) · ASCII 이스케이프 없음 · 공백 없는 구분자 · NaN 금지.

    사전 검사(정의 · 빈 줄 · 값 형식 · 정렬 · 인코딩)에 어긋나면 ContentInvalid. 공개 화면이 거부할 파일은 만들지 않는다.
    """
    _check_fields(source.fields)
    if not source.rows:
        raise ContentInvalid("dataset file has no rows")
    try:
        rows = sorted(source.rows, key=_row_order_key(source.fields))
    except TypeError as error:
        # 구분 칸 값의 형식이 줄마다 달라(숫자 · 글자 혼합) 비교할 수 없다.
        raise ContentInvalid("key values cannot be ordered") from error
    sources: list[dict[str, str]] = []
    external_ids: dict[tuple[str, str], str] = {}
    published_rows: list[dict[str, Any]] = []
    field_names = [str(field["name"]) for field in source.fields]
    for row in rows:
        source_id = _source_id(row, sources, external_ids)
        values = {name: row.data[name] for name in field_names if row.data.get(name) is not None}
        _check_values(values)
        published_rows.append({"key": row.row_key, "values": values, "source": source_id})
    document = {
        "dataset": source.slug,
        "title": source.title,
        "version": source.version_no,
        "schema_version": source.schema_version,
        "created_at": source.created_at.strftime(CREATED_AT_FORMAT),
        "fields": source.fields,
        "sources": sources,
        "rows": published_rows,
    }
    try:
        text = json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    except ValueError as error:
        # 값은 _check_values 를 거쳤으므로 남는 것은 정의(fields) 안의 NaN · 무한대 등이다(allow_nan=False).
        raise ContentInvalid("document is not representable as JSON") from error
    try:
        return text.encode("utf-8")
    except UnicodeEncodeError as error:
        # 고립 서로게이트(짝 없는 U+D800 등)는 UTF-8 로 쓸 수 없다. 값 · 제목 · 구분 칸 어디에 있든 막는다.
        raise ContentInvalid("text is not encodable as UTF-8") from error


def file_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def public_path(slug: str, version_no: int) -> str:
    """응답 · 화면 · 이야기 파일이 쓰는 공개 경로(web 이 발행 폴더를 /data/ 로 서빙)."""
    return f"/data/{DATASETS_DIR_NAME}/{slug}/v{version_no}.json"


def _check_fields(fields: Sequence[object]) -> None:
    """published.ts isFieldDefinition 과 같은 조건(name 문자열 · type 은 정해진 8종 · label 은 없거나 문자열).

    하나라도 어긋나면 공개 화면이 파일 전체를 거부한다. 정의 검사를 통과한 구조만 저장되지만, 그 전에 저장된 구조가
    있을 수 있어 파일을 만들기 전에 막는다(발행에서는 커밋 전이라 기록본이 남지 않는다).
    """
    for position, field in enumerate(fields):
        if not isinstance(field, dict):
            raise ContentInvalid(f"field definition {position + 1} is not an object")
        field_type = field.get("type")
        if (
            not isinstance(field.get("name"), str)
            or not isinstance(field_type, str)
            or field_type not in FieldType
            or ("label" in field and not isinstance(field["label"], str))
        ):
            raise ContentInvalid(f"field definition {position + 1} does not match the published contract")


def _check_values(values: dict[str, Any]) -> None:
    """published.ts isCellValue 와 같은 조건(문자열 · 유한한 숫자 · 참/거짓) + 정수는 JavaScript 가 정확히 다루는 범위."""
    for name, value in values.items():
        if isinstance(value, (str, bool)):
            continue
        if isinstance(value, int):
            if abs(value) > MAX_EXACT_INTEGER:
                raise ContentInvalid(f"value {name} is outside the exact integer range")
            continue
        if isinstance(value, float) and math.isfinite(value):
            continue
        raise ContentInvalid(f"value {name} is not a published value type")


type RowOrderKey = tuple[tuple[Any, ...], str]


def _row_order_key(fields: Sequence[dict[str, Any]]) -> Callable[[PublishRow], RowOrderKey]:
    """구분 칸 정의 순서대로 칸 값을 비교한다. 숫자 형식은 숫자로, 나머지는 row_key 와 같은 문자열로."""
    key_fields = [(str(field["name"]), field.get("type") in NUMERIC_KEY_TYPES) for field in fields if field.get("key")]

    def order_key(row: PublishRow) -> RowOrderKey:
        parts: list[Any] = []
        for name, numeric in key_fields:
            value = row.data.get(name)
            if value is None:
                # row_key 가 있는 승인 줄은 구분 칸 값이 모두 있다(row_validation._build_row_key).
                raise ContentInvalid(f"approved row has no key value: {name}")
            parts.append(value if numeric else _key_part(value))
        # 구분 칸 값이 같을 수 없지만(구분 칸당 승인 줄 1개) 순서를 완전히 정하려고 row_key 를 덧붙인다.
        return tuple(parts), row.row_key

    return order_key


def _source_id(row: PublishRow, sources: list[dict[str, str]], external_ids: dict[tuple[str, str], str]) -> str:
    """줄의 출처 id. 같은 출처(external 은 링크 + 확인한 날)는 처음 나온 순서로 한 번만 sources 에 싣는다."""
    if row.source_kind is SourceKind.SELF:
        if not any(source["id"] == SELF_SOURCE_ID for source in sources):
            sources.append({"id": SELF_SOURCE_ID, "kind": SourceKind.SELF.value})
        return SELF_SOURCE_ID
    if row.source_url is None or row.as_of_date is None:
        raise ContentInvalid("approved external row has no source url or as-of date")
    identity = (row.source_url, row.as_of_date.isoformat())
    known = external_ids.get(identity)
    if known is not None:
        return known
    external_count = sum(1 for source in sources if source["kind"] == SourceKind.EXTERNAL.value)
    source_id = f"{EXTERNAL_SOURCE_ID_PREFIX}{external_count + 1}"
    external_ids[identity] = source_id
    sources.append(
        {"id": source_id, "kind": SourceKind.EXTERNAL.value, "url": identity[0], "as_of_date": identity[1]}
    )
    return source_id


# --- 경로 ---


def dataset_file_path(published_root: Path, slug: str, version_no: int) -> Path:
    """{발행 폴더}/datasets/{slug}/v{version_no}.json. slug 형식을 다시 보고, 링크를 풀어도 기대 경로 그대로인지 확인한다.

    발행 폴더 자체(볼륨 마운트 지점)는 링크여도 되지만, 그 아래 datasets/ · {slug}/ · v{n}.json 이 링크면 거부한다
    (안쪽 링크가 다른 묶음 폴더를 가리키면 발행 폴더 이탈 검사만으로는 막지 못한다).
    """
    if len(slug) > SLUG_MAX_LENGTH or _SLUG_REGEX.fullmatch(slug) is None:
        raise UnsafePublishPath("slug does not match the slug pattern")
    if isinstance(version_no, bool) or not isinstance(version_no, int) or version_no < 1:
        raise UnsafePublishPath("version number must be a positive integer")
    try:
        root = published_root.resolve()
        expected = root / DATASETS_DIR_NAME / slug / f"v{version_no}.json"
        resolved = expected.resolve()
    except (RuntimeError, OSError) as error:
        # 링크 순환 등. 원래 예외 문장에는 경로가 들어 있으므로 경로 없는 문장으로 바꿔 올린다.
        raise UnsafePublishPath("dataset file path cannot be resolved") from error
    if resolved != expected:
        raise UnsafePublishPath("dataset file path does not match the expected path")
    return expected


# --- 쓰기 ---


def write_dataset_file(published_root: Path, path: Path, content: bytes) -> WriteOutcome:
    """임시 파일(같은 폴더) 쓰기 · 0644 · fsync → os.link 로 최종 경로를 배타적으로 만든다. rename · 덮어쓰기는 쓰지 않는다.

    path 는 dataset_file_path(published_root, …) 결과다. 발행 폴더 자체는 만들지 않는다: 볼륨이 붙지 않았거나 설정이
    틀렸을 때 컨테이너 안 임시 폴더에 쓰고 성공으로 기록하는 일을 막는다.
    로그에는 경로를 남기지 않는다(서버 절대경로 기록 금지). 오류 번호 · 파일 이름만 남긴다.
    """
    if not published_root.is_dir():
        logger.warning("publish dir missing: file=%s", path.name)
        return WriteOutcome.FAILED
    try:
        _make_dirs(published_root, path.parent)
    except OSError as error:
        logger.warning("publish dir create failed: file=%s errno=%s", path.name, error.errno)
        return WriteOutcome.FAILED

    temp_path: Path | None = None
    try:
        temp_path = _write_temp_file(path.parent, path.name, content)
        try:
            os.link(temp_path, path)
            outcome = WriteOutcome.WRITTEN
        except FileExistsError:
            outcome = _compare_existing(path, content)
        if outcome is not WriteOutcome.CONFLICT:
            # 같은 바이트(SAME)도 앞선 쓰기가 폴더 fsync 전에 멈췄을 수 있어 같은 3단을 디스크에 남긴다.
            sync_dataset_dirs(published_root, path)
        return outcome
    except OSError as error:
        logger.warning("publish file write failed: file=%s errno=%s", path.name, error.errno)
        return WriteOutcome.FAILED
    finally:
        if temp_path is not None:
            _remove_temp_file(temp_path)


def sync_dataset_dirs(published_root: Path, path: Path) -> None:
    """링크(디렉터리 항목)와, 처음 만들었을 수 있는 datasets/ · {slug}/ 항목까지 디스크에 남긴다. 실패하면 OSError."""
    for directory in (path.parent, published_root / DATASETS_DIR_NAME, published_root):
        _fsync_dir(directory)


def read_regular_file(path: Path, max_bytes: int | None = None) -> bytes | None:
    """링크를 따라가지 않고 열어 일반 파일일 때만 읽는다. 없거나 · 링크 · FIFO · 장치 등이면 None.

    max_bytes 가 있으면 최대 max_bytes + 1 바이트까지만 읽는다(호출자가 길이로 초과를 판단). 그 밖의 OSError 는 올린다.
    """
    try:
        descriptor = os.open(path, SAFE_READ_FLAGS)
    except FileNotFoundError:
        return None
    except OSError as error:
        if error.errno in NOT_REGULAR_OPEN_ERRNOS:
            return None
        raise
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            return None
        limit = None if max_bytes is None else max_bytes + 1
        chunks: list[bytes] = []
        total = 0
        while limit is None or total < limit:
            chunk = os.read(descriptor, READ_CHUNK_BYTES if limit is None else min(READ_CHUNK_BYTES, limit - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def _make_dirs(published_root: Path, directory: Path) -> None:
    # datasets/ · datasets/{slug}/ 를 하나씩 만들고, 이번에 새로 만든 폴더만 0755 로 맞춘다(mkdir 의 mode 는 umask 에
    # 깎인다). 이미 있던 폴더는 운영자가 정한 권한일 수 있어 손대지 않는다.
    for folder in (published_root / DATASETS_DIR_NAME, directory):
        try:
            folder.mkdir()
        except FileExistsError:
            continue
        os.chmod(folder, DIR_MODE)


def _write_temp_file(directory: Path, final_name: str, content: bytes) -> Path:
    descriptor, name = tempfile.mkstemp(dir=directory, prefix=f".{final_name}.", suffix=TEMP_FILE_SUFFIX)
    temp_path = Path(name)
    try:
        try:
            view = memoryview(content)
            while view:
                written = os.write(descriptor, view)
                view = view[written:]
            # 권한 변경(메타데이터)까지 함께 디스크에 남도록 fchmod 를 fsync 앞에 둔다.
            os.fchmod(descriptor, FILE_MODE)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except OSError:
        # 호출자는 경로를 받기 전이라 지울 수 없다. 여기서 지우고 실패를 올린다(공간 부족 · fsync 실패 등).
        _remove_temp_file(temp_path)
        raise
    return temp_path


def _compare_existing(path: Path, content: bytes) -> WriteOutcome:
    # 이미 있는 파일은 읽기만 한다(다른 내용이어도 고치지 않음). 링크 · FIFO 등 일반 파일이 아니면 읽지 않고 충돌.
    if read_regular_file(path, max_bytes=len(content)) == content:
        return WriteOutcome.SAME
    logger.warning("publish file conflict: file=%s is not a regular file with the same bytes", path.name)
    return WriteOutcome.CONFLICT


def _fsync_dir(directory: Path) -> None:
    # 링크(디렉터리 항목)까지 디스크에 남긴다. 실패하면 OSError 로 올라가 FAILED 가 되고, 재시도가 같은 바이트로 확인한다.
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _remove_temp_file(temp_path: Path) -> None:
    try:
        temp_path.unlink(missing_ok=True)
    except OSError as error:
        logger.warning("publish temp file cleanup failed: file=%s errno=%s", temp_path.name, error.errno)
