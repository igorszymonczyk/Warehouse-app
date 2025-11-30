import os
import sys

# Dodaj folder 'backend' (nadrzędny) do ścieżki Pythona, aby umożliwić import modeli
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), '..')))

# Importuj Base i wszystkie modele, które mają być śledzone przez migracje
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

# target_metadata zawiera definicje wszystkich tabel zadeklarowanych w modelach (Base.metadata)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Uruchamia migracje w trybie 'offline', generując skrypty SQL bez łączenia się z bazą."""
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
    """Uruchamia migracje w trybie 'online', łącząc się bezpośrednio z bazą danych."""
    # Tworzenie obiektu Engine z konfiguracji
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    # Nawiązywanie i używanie połączenia z bazą
    with connectable.connect() as connection:
        # Konfiguracja kontekstu Alembic dla trybu online
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        # Uruchomienie migracji w ramach pojedynczej transakcji
        with context.begin_transaction():
            context.run_migrations()


# Wybór trybu wykonania na podstawie konfiguracji Alembic
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()