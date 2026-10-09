"""row status superseded

Revision ID: 77af74ebc4c1
Revises: 8b7920d2175f
Create Date: 2026-10-09 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '77af74ebc4c1'
down_revision: Union[str, Sequence[str], None] = '8b7920d2175f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# MariaDB DDL 은 암묵 커밋되므로 마이그레이션 1개에 DDL 1개만 둔다(D-28 · 백로그).
OLD_STATUSES = ('pending', 'approved', 'rejected')
NEW_STATUSES = (*OLD_STATUSES, 'superseded')
STATUS_DEFAULT = 'pending'
OLD_COMMENT = '검토 상태: pending | approved | rejected'
NEW_COMMENT = '검토 상태: pending | approved | rejected | superseded'


def upgrade() -> None:
    """dataset_rows.status ENUM 끝에 superseded 를 더한다(끝에 더하므로 기존 값의 순서 번호는 그대로)."""
    op.alter_column(
        'dataset_rows',
        'status',
        existing_type=sa.Enum(*OLD_STATUSES, name='row_status'),
        type_=sa.Enum(*NEW_STATUSES, name='row_status'),
        existing_nullable=False,
        existing_server_default=STATUS_DEFAULT,
        comment=NEW_COMMENT,
        existing_comment=OLD_COMMENT,
    )


def downgrade() -> None:
    """superseded 를 뺀다."""
    # superseded 줄이 있으면 엄격 모드에서 실패한다 — 그 줄의 상태를 먼저 정리해야 한다(데이터 판단이 필요해 자동 변환하지 않음).
    op.alter_column(
        'dataset_rows',
        'status',
        existing_type=sa.Enum(*NEW_STATUSES, name='row_status'),
        type_=sa.Enum(*OLD_STATUSES, name='row_status'),
        existing_nullable=False,
        existing_server_default=STATUS_DEFAULT,
        comment=OLD_COMMENT,
        existing_comment=NEW_COMMENT,
    )
