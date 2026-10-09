"""dataset key exclusions

Revision ID: 0bd9fb32318f
Revises: d908f09b37b7
Create Date: 2026-10-09 12:00:02.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0bd9fb32318f'
down_revision: Union[str, Sequence[str], None] = 'd908f09b37b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROW_KEY_LENGTH = 191
ROW_KEY_COLLATION = 'utf8mb4_bin'


def upgrade() -> None:
    """구분 칸 단위 공개 제외 테이블. 테이블 옵션은 models.TABLE_OPTIONS 와 같다."""
    op.create_table(
        'dataset_key_exclusions',
        sa.Column('dataset_id', sa.BigInteger(), nullable=False, comment='소속 데이터 묶음'),
        sa.Column(
            'row_key',
            sa.String(length=ROW_KEY_LENGTH, collation=ROW_KEY_COLLATION),
            nullable=False,
            comment='공개에서 뺄 구분 칸 값',
        ),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.text('(UTC_TIMESTAMP())'),
            nullable=False,
            comment='생성 시각(UTC)',
        ),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id']),
        sa.PrimaryKeyConstraint('dataset_id', 'row_key', name='pk_dataset_key_exclusions'),
        comment='기록본에서 빼는 구분 칸',
        mysql_engine='InnoDB',
        mysql_charset='utf8mb4',
        mysql_collate='utf8mb4_unicode_ci',
    )


def downgrade() -> None:
    """테이블을 지운다. 공개 제외 기록은 함께 사라진다(줄 자체는 dataset_rows 에 남음)."""
    op.drop_table('dataset_key_exclusions')
