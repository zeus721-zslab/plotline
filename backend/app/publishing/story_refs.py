"""발행 폴더의 이야기 파일(stories/*.json)에서 데이터 묶음을 쓰는 이야기를 찾는다(읽기 전용).

이야기 파일은 관리자 기능 밖에서 놓이므로 형식을 믿지 않는다. 일반 파일 아님(링크 · FIFO) · 크기 초과 · 해석 실패 · 형식
불일치 파일과, path 의 판 번호가 version 과 다른 항목은 건너뛰고 수만 센다(D-30).
형식은 frontend/src/lib/story/published.ts 의 isPublishedStory 와 같게 본다(화면이 거부하는 파일은 쓰는 이야기로 세지 않음).
"""

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.publishing.dataset_file import DATASETS_DIR_NAME, read_regular_file

logger = logging.getLogger(__name__)

STORIES_DIR_NAME = "stories"
STORY_INDEX_FILE_NAME = "index.json"
STORY_FILE_MAX_BYTES = 1024 * 1024
# published.ts 의 UTC_TIMESTAMP_PATTERN 과 같다.
UTC_TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")


@dataclass(frozen=True)
class StoryReference:
    story: str
    title: str
    # 이야기 파일이 가리키는 이 묶음의 판 번호
    version: int


@dataclass(frozen=True)
class StoryUsage:
    references: list[StoryReference]
    # 건너뛴 이야기 파일 수(일반 파일 아님 · 크기 초과 · 해석 실패 · 형식 불일치)
    skipped_files: int
    # path 의 판 번호가 version 과 어긋나 건너뛴 이 묶음 항목 수
    skipped_references: int


def find_story_references(published_dir: Path, slug: str) -> StoryUsage:
    """datasets 항목의 path 가 /data/datasets/{slug}/ 로 시작하는 이야기. 파일 이름 순."""
    stories_dir = published_dir / STORIES_DIR_NAME
    if not stories_dir.is_dir():
        return StoryUsage(references=[], skipped_files=0, skipped_references=0)
    prefix = f"/data/{DATASETS_DIR_NAME}/{slug}/"
    references: list[StoryReference] = []
    skipped_files = 0
    skipped_references = 0
    for path in sorted(stories_dir.glob("*.json")):
        if path.name == STORY_INDEX_FILE_NAME:
            continue
        story = _read_story(path)
        if story is None:
            skipped_files += 1
            continue
        for reference in story["datasets"].values():
            if not reference["path"].startswith(prefix):
                continue
            if reference["path"] != f"{prefix}v{reference['version']}.json":
                # path 의 판 번호(또는 파일 이름)와 version 이 어긋난 항목은 어느 판을 쓰는지 알 수 없어 건너뛴다.
                skipped_references += 1
                continue
            references.append(StoryReference(story=story["story"], title=story["title"], version=reference["version"]))
    return StoryUsage(references=references, skipped_files=skipped_files, skipped_references=skipped_references)


def _read_story(path: Path) -> dict[str, Any] | None:
    try:
        # 링크 · FIFO · 장치는 읽지 않는다(O_NOFOLLOW · O_NONBLOCK · fstat). 상한 + 1 바이트까지만 읽어 크기를 판단한다.
        content = read_regular_file(path, max_bytes=STORY_FILE_MAX_BYTES)
        if content is None or len(content) > STORY_FILE_MAX_BYTES:
            return None
        parsed = json.loads(content)
    except (OSError, ValueError, RecursionError) as error:
        # 읽기 · 해석 실패는 그 파일만 건너뛴다(UnicodeDecodeError · JSONDecodeError 는 ValueError). 경로는 남기지 않는다.
        logger.warning("story file skipped: file=%s error=%s", path.name, type(error).__name__)
        return None
    return parsed if _is_story(parsed) else None


def _is_story(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    datasets = value.get("datasets")
    published_at = value.get("published_at")
    return (
        isinstance(value.get("story"), str)
        and isinstance(value.get("title"), str)
        and isinstance(published_at, str)
        and UTC_TIMESTAMP_PATTERN.fullmatch(published_at) is not None
        and (value.get("question") is None or isinstance(value.get("question"), str))
        and isinstance(datasets, dict)
        and all(_is_dataset_reference(reference) for reference in datasets.values())
    )


def _is_dataset_reference(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    version = value.get("version")
    return (
        isinstance(version, int)
        and not isinstance(version, bool)
        and version > 0
        and isinstance(value.get("path"), str)
    )
