import os
import sys

# Add the 'backend' (parent) folder to Python path to allow model imports
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), '..')))

# Import Base and all models that should be tracked by migrations
from database import Base
import models.users
import models.product
import models.cart
import models.order
import models.invoice
import models.log
import models.stock
import models.WarehouseDoc
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context


config = context.config


if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# target_metadata contains definitions of all tables declared in models (Base.metadata)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode, generating SQL scripts without DB connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode, connecting directly to the database."""
    # Create Engine object from configuration
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    # Establish and use database connection
    with connectable.connect() as connection:
        # Configure Alembic context for online mode
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        # Run migrations within a single transaction
        with context.begin_transaction():
            context.run_migrations()


# Select execution mode based on Alembic configuration
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()