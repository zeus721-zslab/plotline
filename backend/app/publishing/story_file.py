"""이야기 파일(stories/{story}.json) · 목록(stories/index.json) 만들기 · 교체 · 공개 상태 확인(D-37).

- 직렬화는 순수 함수다. 형식은 frontend/src/lib/story/published.ts 의 PublishedStory · StoryIndex 와 같다(question 없음, D-35).
- 쓰기는 같은 폴더 임시 파일 → 쓰기 · fchmod 0644 · fsync → os.replace → 폴더 fsync 다. 데이터 파일(dataset_file)과 달리
  같은 경로를 덮어쓴다(D-29 불변 원칙의 예외: 이야기 파일은 판 번호가 아니라 이야기 이름으로 공개되고, 가리키는 데이터
  파일은 불변이라 옛 판 조합도 일관된다).
"""

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from pathlib import Path

from app.publishing.dataset_file import (
    CREATED_AT_FORMAT,
    DIR_MODE,
    UnsafePublishPath,
    _fsync_dir,
    _remove_temp_file,
    _write_temp_file,
    public_path,
    read_regular_file,
)
from app.publishing.story_refs import STORIES_DIR_NAME, STORY_FILE_MAX_BYTES, STORY_INDEX_FILE_NAME, _is_story

logger = logging.getLogger(__name__)

STORY_FILE_SUFFIX = ".json"


class PublicFileStatus(StrEnum):
    """공개 이야기 파일이 최신 공개(done) 판과 맞는가. 프론트 lib/admin/stories.ts PUBLIC_FILE_STATUSES 와 같다."""

    OK = "ok"
    MISSING = "missing"
    # title · published_at · datasets(판 번호 · 경로) · story 가 다름, 또는 해석 · 형식 실패
    MISMATCH = "mismatch"
    # 링크 · 일반 파일 아님 · 크기 초과 · 읽기 오류
    UNREADABLE = "unreadable"


@dataclass(frozen=True)
class StoryIndexItem:
    story: str
    title: str
    summary: str
    # 처음 공개된 시각(시간대 없는 UTC). 목록 순서 기준이다.
    first_published_at: datetime


# --- 직렬화(순수 함수) ---


def _utc_text(value: datetime) -> str:
    # DB 는 시간대 없는 UTC 로 저장한다. 공개 계약은 ...Z 형식(published.ts isUtcTimestamp).
    return value.strftime(CREATED_AT_FORMAT)


def _to_bytes(document: object) -> bytes:
    return json.dumps(document, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def build_story_file(story: str, title: str, published_at: datetime, datasets: dict[str, int]) -> bytes:
    """이야기 파일 바이트. datasets 는 넘겨준 순서(registry 순서)대로 싣는다."""
    return _to_bytes(
        {
            "story": story,
            "title": title,
            "published_at": _utc_text(published_at),
            "datasets": {
                name: {"version": version_no, "path": public_path(name, version_no)}
                for name, version_no in datasets.items()
            },
        }
    )


def build_story_index(items: list[StoryIndexItem]) -> bytes:
    """목록 바이트. 처음 공개된 시각 오름차순(같으면 이야기 이름 순)."""
    ordered = sorted(items, key=lambda item: (item.first_published_at, item.story))
    return _to_bytes(
        {
            "stories": [
                {
                    "story": item.story,
                    "title": item.title,
                    "summary": item.summary,
                    "published_at": _utc_text(item.first_published_at),
                }
                for item in ordered
            ]
        }
    )


# --- 경로 ---


def story_file_paths(published_root: Path, story: str) -> tuple[Path, Path]:
    """(stories/{story}.json, stories/index.json). 링크를 풀어도 기대 경로 그대로인지 확인한다.

    story 는 registry 의 이름만 들어온다. 발행 폴더 자체(볼륨 마운트 지점)는 링크여도 되지만, 그 아래 stories/ 와 두 파일이
    링크면 거부한다(dataset_file_path 와 같은 규칙).
    """
    try:
        root = published_root.resolve()
        expected_story = root / STORIES_DIR_NAME / f"{story}{STORY_FILE_SUFFIX}"
        expected_index = root / STORIES_DIR_NAME / STORY_INDEX_FILE_NAME
        resolved = (expected_story.resolve(), expected_index.resolve())
    except (RuntimeError, OSError) as error:
        raise UnsafePublishPath("story file path cannot be resolved") from error
    if resolved != (expected_story, expected_index) or expected_story == expected_index:
        raise UnsafePublishPath("story file path does not match the expected path")
    return expected_story, expected_index


# --- 읽기(공개 파일 상태) ---


def public_story_file_status(
    published_root: Path, story: str, title: str, published_at: datetime, datasets: dict[str, int]
) -> PublicFileStatus:
    """stories/{story}.json 이 이 제목 · 발행 시각 · 묶음 판으로 쓴 파일과 맞는지 본다. 목록(index.json)은 보지 않는다.

    링크를 따라가지 않고(경로 확인 + O_NOFOLLOW) 일반 파일만 크기 상한까지 읽는다. 로그에 경로를 남기지 않는다.
    """
    try:
        story_path, _ = story_file_paths(published_root, story)
    except UnsafePublishPath:
        return PublicFileStatus.UNREADABLE
    try:
        os.lstat(story_path)
    except FileNotFoundError:
        return PublicFileStatus.MISSING
    except OSError as error:
        logger.warning("story file stat failed: file=%s errno=%s", story_path.name, error.errno)
        return PublicFileStatus.UNREADABLE
    try:
        content = read_regular_file(story_path, max_bytes=STORY_FILE_MAX_BYTES)
    except OSError as error:
        logger.warning("story file read failed: file=%s errno=%s", story_path.name, error.errno)
        return PublicFileStatus.UNREADABLE
    if content is None or len(content) > STORY_FILE_MAX_BYTES:
        return PublicFileStatus.UNREADABLE
    try:
        parsed = json.loads(content)
    except (ValueError, RecursionError):
        # UnicodeDecodeError · JSONDecodeError 는 ValueError 다.
        return PublicFileStatus.MISMATCH
    if not _is_story(parsed):
        return PublicFileStatus.MISMATCH
    expected_references = {
        name: {"version": version_no, "path": public_path(name, version_no)} for name, version_no in datasets.items()
    }
    file_references = {
        name: {"version": reference["version"], "path": reference["path"]}
        for name, reference in parsed["datasets"].items()
    }
    if (
        parsed["story"] != story
        or parsed["title"] != title
        or parsed["published_at"] != _utc_text(published_at)
        or file_references != expected_references
    ):
        return PublicFileStatus.MISMATCH
    return PublicFileStatus.OK


# --- 쓰기 ---


def ensure_stories_dir(published_root: Path) -> None:
    """stories/ 가 없으면 0755 로 만든다. 발행 폴더 자체는 만들지 않는다(볼륨 미마운트 방지). 실패하면 OSError."""
    if not published_root.is_dir():
        raise FileNotFoundError("published dir is missing")
    folder = published_root / STORIES_DIR_NAME
    try:
        folder.mkdir()
    except FileExistsError:
        return
    # mkdir 의 mode 는 umask 에 깎이므로 새로 만든 폴더만 맞춘다. 발행 폴더 항목까지 디스크에 남긴다.
    os.chmod(folder, DIR_MODE)
    _fsync_dir(published_root)


def replace_file(path: Path, content: bytes) -> None:
    """같은 폴더 임시 파일(0644 · fsync) → os.replace → 폴더 fsync. 실패하면 OSError(임시 파일은 남기지 않음).

    로그 · 예외에 경로를 남기지 않는다(서버 절대경로 기록 금지). 호출자가 파일 이름 · 오류 번호만 남긴다.
    """
    temp_path = _write_temp_file(path.parent, path.name, content)
    try:
        os.replace(temp_path, path)
    except OSError:
        _remove_temp_file(temp_path)
        raise
    _fsync_dir(path.parent)
