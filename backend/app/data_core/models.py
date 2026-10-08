"""범용 데이터 저장 구조(D-17). 주제와 무관하게 6개 테이블에 정의·원본·행·버전을 담는다.

시각 컬럼은 모두 UTC 로 저장한다(DB 기본값 UTC_TIMESTAMP()). 표시 시간대 변환은 화면 쪽 책임.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.data_core.enums import ImportSourceType, RowStatus, SourceKind
from app.db import Base

SLUG_MAX_LENGTH = 64
TITLE_MAX_LENGTH = 200
URL_MAX_LENGTH = 2048
# 옛 COMPACT 행 형식의 인덱스 키 한도(767바이트 / utf8mb4 4바이트)까지 고려한 보수적 길이. 운영 공유 DB 설정과 무관하게 인덱스 생성이 되도록 한다.
ROW_KEY_MAX_LENGTH = 191
NOTE_MAX_LENGTH = 500
REJECT_REASON_MAX_LENGTH = 500

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
    row_key: Mapped[str] = mapped_column(
        String(ROW_KEY_MAX_LENGTH), nullable=False, comment="key 필드 값을 정의 순서대로 | 로 연결한 값"
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
        comment="검토 상태: pending | approved | rejected",
    )
    errors: Mapped[list[dict[str, str | None]] | None] = mapped_column(
        JSON, nullable=True, comment="검사 오류 목록 [{code, field, message}]"
    )
    reject_reason: Mapped[str | None] = mapped_column(
        String(REJECT_REASON_MAX_LENGTH), nullable=True, comment="반려 사유"
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="검토 시각(UTC)")
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
    created_at: Mapped[datetime] = _created_at_column()


class DatasetVersionRow(Base):
    __tablename__ = "dataset_version_rows"
    __table_args__ = {**TABLE_OPTIONS, "comment": "버전에 포함된 행 목록"}

    version_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataset_versions.id"), primary_key=True, comment="데이터 버전"
    )
    row_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("dataset_rows.id"), primary_key=True, comment="포함된 행"
    )
