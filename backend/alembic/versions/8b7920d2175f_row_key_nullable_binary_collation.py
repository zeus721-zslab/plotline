"""row_key nullable binary collation

Revision ID: 8b7920d2175f
Revises: 81f11f6f6071
Create Date: 2026-10-08 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = '8b7920d2175f'
down_revision: Union[str, Sequence[str], None] = '81f11f6f6071'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# autogenerate 는 콜레이션 변경을 잡지 못할 수 있어 수기로 작성한다.
ROW_KEY_LENGTH = 191
ROW_KEY_COMMENT = 'key 필드 값을 정의 순서대로 | 로 연결한 값'
OLD_COLLATION = 'utf8mb4_unicode_ci'
NEW_COLLATION = 'utf8mb4_bin'


def upgrade() -> None:
    """row_key: NULL 허용(key 오류 행도 저장) · 대소문자·악센트를 구분하는 utf8mb4_bin."""
    op.alter_column(
        'dataset_rows',
        'row_key',
        existing_type=mysql.VARCHAR(length=ROW_KEY_LENGTH, collation=OLD_COLLATION),
        type_=mysql.VARCHAR(length=ROW_KEY_LENGTH, charset='utf8mb4', collation=NEW_COLLATION),
        existing_nullable=False,
        nullable=True,
        existing_comment=ROW_KEY_COMMENT,
    )


def downgrade() -> None:
    """NOT NULL · utf8mb4_unicode_ci 로 되돌린다."""
    # row_key 가 NULL 인 행이 있으면 NOT NULL 변경이 실패할 수 있다(엄격 모드) — 해당 행을 먼저 정리해야 한다.
    op.alter_column(
        'dataset_rows',
        'row_key',
        existing_type=mysql.VARCHAR(length=ROW_KEY_LENGTH, collation=NEW_COLLATION),
        type_=mysql.VARCHAR(length=ROW_KEY_LENGTH, charset='utf8mb4', collation=OLD_COLLATION),
        existing_nullable=True,
        nullable=False,
        existing_comment=ROW_KEY_COMMENT,
    )
