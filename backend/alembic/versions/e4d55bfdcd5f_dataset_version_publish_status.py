"""dataset version publish status

Revision ID: e4d55bfdcd5f
Revises: 0bd9fb32318f
Create Date: 2026-10-09 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e4d55bfdcd5f'
down_revision: Union[str, Sequence[str], None] = '0bd9fb32318f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 네 칸을 ALTER TABLE 1문장으로 더한다(MariaDB DDL 은 문장마다 암묵 커밋되어, 나누면 중간 실패 시 일부만 남는다).
# 이미 있는 기록본은 파일을 쓴 적이 없으므로 기본값 pending 으로 들어가 "다시 시도" 대상이 된다(D-29).
# 값이 들어가지 않는 고정 DDL 이라 바인딩할 매개변수가 없다(문자열 조립 없음).
UPGRADE_DDL = sa.text(
    "ALTER TABLE dataset_versions"
    " ADD COLUMN publish_status ENUM('pending','done','failed') NOT NULL DEFAULT 'pending'"
    " COMMENT '발행 파일 상태: pending | done | failed' AFTER note,"
    " ADD COLUMN file_sha256 CHAR(64) NULL"
    " COMMENT '발행 파일 바이트의 SHA-256(16진수)' AFTER publish_status,"
    " ADD COLUMN published_at DATETIME NULL"
    " COMMENT '발행 파일 쓰기 완료 시각(UTC)' AFTER file_sha256,"
    " ADD COLUMN publish_error VARCHAR(64) NULL"
    " COMMENT '발행 실패 오류 코드(경로 · 예외 문장 저장 금지)' AFTER published_at"
)
DOWNGRADE_DDL = sa.text(
    "ALTER TABLE dataset_versions"
    " DROP COLUMN publish_error,"
    " DROP COLUMN published_at,"
    " DROP COLUMN file_sha256,"
    " DROP COLUMN publish_status"
)


def upgrade() -> None:
    """dataset_versions 에 발행 상태 · 파일 해시 · 발행 시각 · 실패 코드를 더한다."""
    op.execute(UPGRADE_DDL)


def downgrade() -> None:
    """네 칸을 지운다. 발행 상태 기록은 함께 사라진다(이미 쓴 발행 파일은 볼륨에 그대로 남는다)."""
    op.execute(DOWNGRADE_DDL)
