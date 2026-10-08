from logging.config import fileConfig

from sqlalchemy import create_engine, pool

from alembic import context
from app.config import get_settings
from app.data_core import models  # noqa: F401  # 테이블을 Base.metadata 에 등록하려고 import
from app.db import Base, build_database_url

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# 접속 정보는 alembic.ini 가 아니라 앱과 같은 환경변수(DB_*)에서 읽는다.
database_url = build_database_url(get_settings())


def run_migrations_offline() -> None:
    """DB 접속 없이 SQL 문만 출력한다(alembic upgrade --sql)."""
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(database_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
