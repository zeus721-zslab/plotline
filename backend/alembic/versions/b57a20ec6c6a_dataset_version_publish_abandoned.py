"""dataset version publish status abandoned

Revision ID: b57a20ec6c6a
Revises: e4d55bfdcd5f
Create Date: 2026-10-09 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b57a20ec6c6a'
down_revision: Union[str, Sequence[str], None] = 'e4d55bfdcd5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ENUM 끝에 값을 더하는 ALTER 1문장(기존 값 순서 · 기본값 · NOT NULL 유지, D-30).
# 값이 들어가지 않는 고정 DDL 이라 바인딩할 매개변수가 없다(문자열 조립 없음).
UPGRADE_DDL = sa.text(
    "ALTER TABLE dataset_versions"
    " MODIFY COLUMN publish_status ENUM('pending','done','failed','abandoned') NOT NULL DEFAULT 'pending'"
    " COMMENT '발행 파일 상태: pending | done | failed | abandoned'"
)
DOWNGRADE_DDL = sa.text(
    "ALTER TABLE dataset_versions"
    " MODIFY COLUMN publish_status ENUM('pending','done','failed') NOT NULL DEFAULT 'pending'"
    " COMMENT '발행 파일 상태: pending | done | failed'"
)


def upgrade() -> None:
    """publish_status 에 abandoned(폐기)를 더한다."""
    op.execute(UPGRADE_DDL)


def downgrade() -> None:
    # abandoned 줄이 있으면 값을 담을 수 없어 실패한다(되돌리기 전에 그 줄을 정리해야 함).
    op.execute(DOWNGRADE_DDL)
