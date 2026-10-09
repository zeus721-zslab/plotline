"""이야기 파일에서 데이터 묶음을 쓰는 이야기 찾기(find_story_references) 테스트. DB 없음.

정상 · 해석 실패 · 형식 불일치는 test_admin_publish.py(목록 API)가 맡고, 여기서는 파일 종류 · 크기 · 판 번호 규칙을 본다.
"""

import json
import os
from pathlib import Path

from app.publishing.story_refs import STORY_FILE_MAX_BYTES, find_story_references

SLUG = "elements"


def story_bytes(story_id: str, version: int, path: str) -> bytes:
    document = {
        "story": story_id,
        "title": f"{story_id} 제목",
        "published_at": "2026-10-09T00:00:00Z",
        "datasets": {"main": {"version": version, "path": path}},
    }
    return json.dumps(document).encode()


def stories_dir(published: Path) -> Path:
    directory = published / "stories"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def test_link_and_fifo_story_files_are_skipped(tmp_path: Path) -> None:
    stories = stories_dir(tmp_path)
    target = tmp_path / "outside.json"
    target.write_bytes(story_bytes("outside", 1, "/data/datasets/elements/v1.json"))
    (stories / "linked.json").symlink_to(target)
    # 쓰는 쪽이 없는 FIFO: O_NONBLOCK 없이 열면 여기서 멈춘다.
    os.mkfifo(stories / "pipe.json")
    (stories / "real.json").write_bytes(story_bytes("real", 1, "/data/datasets/elements/v1.json"))

    usage = find_story_references(tmp_path, SLUG)

    assert [reference.story for reference in usage.references] == ["real"]
    assert usage.skipped_files == 2


def test_story_file_one_byte_over_limit_is_skipped(tmp_path: Path) -> None:
    stories = stories_dir(tmp_path)
    content = story_bytes("at-limit", 1, "/data/datasets/elements/v1.json")
    (stories / "at-limit.json").write_bytes(content + b" " * (STORY_FILE_MAX_BYTES - len(content)))
    (stories / "over-limit.json").write_bytes(content + b" " * (STORY_FILE_MAX_BYTES - len(content) + 1))

    usage = find_story_references(tmp_path, SLUG)

    assert [reference.story for reference in usage.references] == ["at-limit"]
    assert usage.skipped_files == 1


def test_reference_whose_path_version_differs_is_skipped(tmp_path: Path) -> None:
    stories = stories_dir(tmp_path)
    (stories / "a-match.json").write_bytes(story_bytes("match", 2, "/data/datasets/elements/v2.json"))
    (stories / "b-mismatch.json").write_bytes(story_bytes("mismatch", 2, "/data/datasets/elements/v3.json"))
    (stories / "c-odd-name.json").write_bytes(story_bytes("odd", 2, "/data/datasets/elements/latest.json"))
    # 다른 묶음 항목은 판 번호가 어긋나도 이 묶음의 건너뜀 수에 넣지 않는다.
    (stories / "d-other.json").write_bytes(story_bytes("other", 1, "/data/datasets/elements-ko/v9.json"))

    usage = find_story_references(tmp_path, SLUG)

    assert [(reference.story, reference.version) for reference in usage.references] == [("match", 2)]
    # 파일은 모두 읽혔고(파일 수 0) 판 번호가 어긋난 항목 2개만 따로 센다.
    assert (usage.skipped_files, usage.skipped_references) == (0, 2)
