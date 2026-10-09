"""범용 데이터 저장 구조(D-17). 주제와 무관하게 6개 테이블에 정의·원본·행·버전을 담는다.

시각 컬럼은 모두 UTC 로 저장한다(DB 기본값 UTC_TIMESTAMP()). 표시 시간대 변환은 화면 쪽 책임.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    CHAR,
    JSON,
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.data_core.enums import ChangeKind, ImportSourceType, PublishStatus, RowStatus, SourceKind
from app.db import Base

SLUG_MAX_LENGTH = 64
# 주소 이름(slug) 형식. 묶음 머리(bundle)와 요청 검증이 같은 규칙을 쓴다.
SLUG_PATTERN = r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$"
TITLE_MAX_LENGTH = 200
URL_MAX_LENGTH = 2048
# 옛 COMPACT 행 형식의 인덱스 키 한도(767바이트 / utf8mb4 4바이트)까지 고려한 보수적 길이. 운영 공유 DB 설정과 무관하게 인덱스 생성이 되도록 한다.
ROW_KEY_MAX_LENGTH = 191
NOTE_MAX_LENGTH = 500
REJECT_REASON_MAX_LENGTH = 500
FILE_SHA256_LENGTH = 64
PUBLISH_ERROR_MAX_LENGTH = 64
STORY_TITLE_MAX_LENGTH = 60
STORY_SUMMARY_MAX_LENGTH = 200
STORY_PUBLISH_LOCK_ID = 1
STORY_PUBLISH_STATUS_CHECK = "publish_status IN ('pending', 'done', 'failed')"

TABLE_OPTIONS = {
    "mysql_engine": "InnoDB",
    "mysql_charset": "utf8mb4",
    "mysql_collate": "utf8mb4_unicode_ci",
}

UTC_NOW = text("(UTC_TIMESTAMP())")


def _enum_column_type(enum_class: type[StrEnum], name: str) -> Enum:
    # DB ENUM 값을 Python enum 의 이름(대문자)이 아니라 value(소문자 문자열)로 맞춘다.
    return Enum(
        enum_class,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
    )


def _created_at_column() -> Mapped[datetime]:
    return mapped_column(DateTime, nullable=False, server_default=UTC_NOW, comment="생성 시각(UTC)")


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = {**TABLE_OPTIONS, "comment": "데이터 묶음(주제 1개 단위)"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(
        String(SLUG_MAX_LENGTH), nullable=False, unique=True, comment="URL·파일명에 쓰는 고유 식별자"
    )
    title: Mapped[str] = mapped_column(String(TITLE_MAX_LENGTH), nullable=False, comment="표시 제목")
    created_at: Mapped[datetime] = _created_at_column()


class DatasetSchema(Base):
    __tablename__ = "dataset_schemas"
    __table_args__ = (
        UniqueConstraint("dataset_id", "version", name="uq_dataset_schemas_dataset_version"),
        {**TABLE_OPTIONS, "comment": "데이터 묶음의 필드 정의 이력"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id"), nullable=False, comment="소속 데이터 묶음"
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, comment="정의 버전(묶음 안에서 증가)")
    fields: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, comment="필드 정의 배열(원소 1개 = 칸 1개)"
    )
    created_at: Mapped[datetime] = _created_at_column()


class DataImport(Base):
    __tablename__ = "imports"
    __table_args__ = {**TABLE_OPTIONS, "comment": "입력 1회분 원본(업로드·붙여넣기 등)"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id"), nullable=False, comment="대상 데이터 묶음"
    )
    schema_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataset_schemas.id"), nullable=False, comment="검사에 쓴 필드 정의"
    )
    source_type: Mapped[ImportSourceType] = mapped_column(
        _enum_column_type(ImportSourceType, "import_source_type"),
        nullable=False,
        comment="입력 경로: upload | claude | api",
    )
    raw_payload: Mapped[str] = mapped_column(LONGTEXT, nullable=False, comment="입력 원문 그대로")
    default_source_url: Mapped[str | None] = mapped_column(
        String(URL_MAX_LENGTH), nullable=True, comment="행에 출처 URL이 없을 때 쓰는 기본 출처"
    )
    created_at: Mapped[datetime] = _created_at_column()


class DatasetRow(Base):
    __tablename__ = "dataset_rows"
    __table_args__ = (
        Index("ix_dataset_rows_dataset_row_key", "dataset_id", "row_key"),
        {**TABLE_OPTIONS, "comment": "검사를 거친 데이터 행(값은 JSON)"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id"), nullable=False, comment="소속 데이터 묶음"
    )
    import_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("imports.id"), nullable=False, comment="이 행을 만든 입력"
    )
    # NULL: key 오류(누락·구분자·길이 초과) 행도 저장해 관리자가 보고 반려하게 한다.
    # utf8mb4_bin: "Fe" 와 "fe" 처럼 대소문자·악센트만 다른 key 를 같은 행으로 보지 않게 한다.
    # MariaDB 의 utf8mb4_bin 은 끝 공백을 무시(PAD SPACE)하지만, 행 검사가 key 값을 strip 하므로 끝 공백 key 는 생기지 않는다.
    row_key: Mapped[str | None] = mapped_column(
        String(ROW_KEY_MAX_LENGTH, collation="utf8mb4_bin"),
        nullable=True,
        comment="key 필드 값을 정의 순서대로 | 로 연결한 값",
    )
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, comment="정규화된 칸 값")
    source_kind: Mapped[SourceKind | None] = mapped_column(
        _enum_column_type(SourceKind, "row_source_kind"),
        nullable=True,
        comment="출처 유형: external | self (누락 시 승인 불가)",
    )
    source_url: Mapped[str | None] = mapped_column(String(URL_MAX_LENGTH), nullable=True, comment="출처 URL")
    as_of_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="출처 기준 날짜")
    status: Mapped[RowStatus] = mapped_column(
        _enum_column_type(RowStatus, "row_status"),
        nullable=False,
        server_default=RowStatus.PENDING.value,
        comment="검토 상태: pending | approved | rejected | superseded",
    )
    errors: Mapped[list[dict[str, str | None]] | None] = mapped_column(
        JSON, nullable=True, comment="검사 오류 목록 [{code, field, message}]"
    )
    reject_reason: Mapped[str | None] = mapped_column(
        String(REJECT_REASON_MAX_LENGTH), nullable=True, comment="반려 사유"
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="검토 시각(UTC)")
    # NULL: 이 규칙(D-28) 이전에 들어온 줄 · 구분 칸이 없는 오류 줄 · 승인 줄과 같은데 오류가 있는 줄.
    change_kind: Mapped[ChangeKind | None] = mapped_column(
        _enum_column_type(ChangeKind, "row_change_kind"),
        nullable=True,
        comment="같은 구분 칸 승인 줄과 비교한 변화: new | changed | as_of_only | carried",
    )
    prev_row_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("dataset_rows.id", name="fk_dataset_rows_prev_row_id"),
        nullable=True,
        comment="비교 상대였던 줄(이전 값 표시 · 이월 원본)",
    )
    created_at: Mapped[datetime] = _created_at_column()


class DatasetKeyExclusion(Base):
    """구분 칸 단위 공개 제외(D-28). 줄을 지우지 않고 기록본 후보에서만 뺀다."""

    __tablename__ = "dataset_key_exclusions"
    __table_args__ = (
        PrimaryKeyConstraint("dataset_id", "row_key", name="pk_dataset_key_exclusions"),
        {**TABLE_OPTIONS, "comment": "기록본에서 빼는 구분 칸"},
    )

    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id"), nullable=False, comment="소속 데이터 묶음"
    )
    # dataset_rows.row_key 와 같은 길이 · 콜레이션이어야 같은 값끼리 비교된다.
    row_key: Mapped[str] = mapped_column(
        String(ROW_KEY_MAX_LENGTH, collation="utf8mb4_bin"), nullable=False, comment="공개에서 뺄 구분 칸 값"
    )
    created_at: Mapped[datetime] = _created_at_column()


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"
    __table_args__ = (
        UniqueConstraint("dataset_id", "version_no", name="uq_dataset_versions_dataset_version_no"),
        {**TABLE_OPTIONS, "comment": "승인 행을 묶은 데이터 버전"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id"), nullable=False, comment="소속 데이터 묶음"
    )
    schema_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataset_schemas.id"), nullable=False, comment="버전이 따르는 필드 정의"
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, comment="버전 번호(묶음 안에서 증가)")
    note: Mapped[str | None] = mapped_column(String(NOTE_MAX_LENGTH), nullable=True, comment="버전 메모")
    publish_status: Mapped[PublishStatus] = mapped_column(
        _enum_column_type(PublishStatus, "publish_status"),
        nullable=False,
        server_default=PublishStatus.PENDING.value,
        comment="발행 파일 상태: pending | done | failed | abandoned",
    )
    file_sha256: Mapped[str | None] = mapped_column(
        CHAR(FILE_SHA256_LENGTH), nullable=True, comment="발행 파일 바이트의 SHA-256(16진수)"
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="발행 파일 쓰기 완료 시각(UTC)"
    )
    publish_error: Mapped[str | None] = mapped_column(
        String(PUBLISH_ERROR_MAX_LENGTH), nullable=True, comment="발행 실패 오류 코드(경로 · 예외 문장 저장 금지)"
    )
    created_at: Mapped[datetime] = _created_at_column()


class Story(Base):
    """이야기 1편(D-37). 등록 가능한 이야기는 admin_stories/registry.py 상수가 정하고, 처음 발행할 때 행이 생긴다."""

    __tablename__ = "stories"
    __table_args__ = {**TABLE_OPTIONS, "comment": "발행하는 이야기"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(
        String(SLUG_MAX_LENGTH), nullable=False, unique=True, comment="이야기 주소 이름(stories/{slug}.json)"
    )
    # 목록(index.json) 순서 · published_at 기준. 처음 done 이 될 때만 정하고 이후 바꾸지 않는다.
    first_published_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="처음 공개된 시각(UTC)"
    )
    created_at: Mapped[datetime] = _created_at_column()


class StoryVersion(Base):
    __tablename__ = "story_versions"
    __table_args__ = (
        UniqueConstraint("story_id", "version_no", name="uq_story_versions_story_version_no"),
        # 공용 PublishStatus ENUM 중 이야기가 쓰는 값만 받는다(폐기 abandoned 없음).
        CheckConstraint(STORY_PUBLISH_STATUS_CHECK, name="ck_story_versions_publish_status"),
        {**TABLE_OPTIONS, "comment": "이야기 발행 판(제목 · 요약 · 묶음 판)"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    story_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stories.id"), nullable=False, comment="소속 이야기"
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False, comment="판 번호(이야기 안에서 증가)")
    title: Mapped[str] = mapped_column(String(STORY_TITLE_MAX_LENGTH), nullable=False, comment="이야기 제목")
    summary: Mapped[str] = mapped_column(String(STORY_SUMMARY_MAX_LENGTH), nullable=False, comment="목록 요약")
    datasets: Mapped[dict[str, int]] = mapped_column(
        JSON, nullable=False, comment="묶음 주소 이름 → 데이터 판 번호"
    )
    # PublishStatus 를 그대로 쓴다. 이야기는 pending · done · failed 만 쓴다(rename 교체라 폐기가 없음).
    publish_status: Mapped[PublishStatus] = mapped_column(
        _enum_column_type(PublishStatus, "publish_status"),
        nullable=False,
        server_default=PublishStatus.PENDING.value,
        comment="이야기 파일 상태: pending | done | failed",
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, comment="이야기 파일 · 목록 교체 완료 시각(UTC)"
    )
    publish_error: Mapped[str | None] = mapped_column(
        String(PUBLISH_ERROR_MAX_LENGTH), nullable=True, comment="발행 실패 오류 코드(경로 · 예외 문장 저장 금지)"
    )
    created_at: Mapped[datetime] = _created_at_column()


class StoryPublishLock(Base):
    """이야기 발행 전역 잠금 행(id 1, 마이그레이션이 시드). 목록(index.json)은 이야기 전체로 만들므로 발행끼리 줄 세운다."""

    __tablename__ = "story_publish_lock"
    __table_args__ = (
        CheckConstraint(f"id = {STORY_PUBLISH_LOCK_ID}", name="ck_story_publish_lock_single_row"),
        {**TABLE_OPTIONS, "comment": "이야기 발행 전역 잠금(1행)"},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)


class DatasetVersionRow(Base):
    __tablename__ = "dataset_version_rows"
    __table_args__ = {**TABLE_OPTIONS, "comment": "버전에 포함된 행 목록"}

    version_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataset_versions.id"), primary_key=True, comment="데이터 버전"
    )
    row_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataset_rows.id"), primary_key=True, comment="포함된 행"
    )
