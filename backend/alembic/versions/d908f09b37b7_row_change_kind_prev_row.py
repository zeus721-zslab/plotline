"""row change kind and prev row

Revision ID: d908f09b37b7
Revises: 77af74ebc4c1
Create Date: 2026-10-09 12:00:01.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd908f09b37b7'
down_revision: Union[str, Sequence[str], None] = '77af74ebc4c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 두 칸과 외래 키를 ALTER TABLE 1문장으로 더한다. op.add_column · op.create_foreign_key 는 문장 3개가 되고,
# MariaDB DDL 은 문장마다 암묵 커밋되어 중간 실패 시 일부만 남는다. 1문장이면 함께 적용되거나 함께 실패한다.
# 값이 들어가지 않는 고정 DDL 이라 바인딩할 매개변수가 없다(문자열 조립 없음).
UPGRADE_DDL = sa.text(
    "ALTER TABLE dataset_rows"
    " ADD COLUMN change_kind ENUM('new','changed','as_of_only','carried') NULL"
    " COMMENT '같은 구분 칸 승인 줄과 비교한 변화: new | changed | as_of_only | carried' AFTER reviewed_at,"
    " ADD COLUMN prev_row_id BIGINT NULL"
    " COMMENT '비교 상대였던 줄(이전 값 표시 · 이월 원본)' AFTER change_kind,"
    " ADD CONSTRAINT fk_dataset_rows_prev_row_id FOREIGN KEY (prev_row_id) REFERENCES dataset_rows (id)"
)
# 외래 키 · 두 칸을 1문장으로 지운다. 외래 키가 만든 인덱스는 prev_row_id 칸을 지울 때 함께 지워진다.
DOWNGRADE_DDL = sa.text(
    "ALTER TABLE dataset_rows"
    " DROP FOREIGN KEY fk_dataset_rows_prev_row_id,"
    " DROP COLUMN prev_row_id,"
    " DROP COLUMN change_kind"
)


def upgrade() -> None:
    """dataset_rows 에 change_kind(ENUM, NULL) · prev_row_id(자기 참조 외래 키, NULL)를 더한다."""
    op.execute(UPGRADE_DDL)


def downgrade() -> None:
    """두 칸과 외래 키를 지운다. 칸에 든 분류 · 이전 줄 연결은 함께 사라진다."""
    op.execute(DOWNGRADE_DDL)
