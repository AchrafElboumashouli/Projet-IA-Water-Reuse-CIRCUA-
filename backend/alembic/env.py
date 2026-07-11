"""
Configuration de l'environnement Alembic.

Charge dynamiquement l'URL de la base de données depuis `app.config.settings`
(donc depuis le fichier `.env`) et importe tous les modèles SQLAlchemy
pour permettre la génération automatique des migrations (`--autogenerate`).
"""

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Permet d'importer le package "app" depuis la racine du projet backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import settings  # noqa: E402
from app.database.session import Base  # noqa: E402
from app.models import Study, RawSensorData, Cycle, CycleResult  # noqa: E402,F401

# Objet de configuration Alembic, donnant accès aux valeurs de alembic.ini
config = context.config

# Surcharge l'URL définie dans alembic.ini avec celle de l'application (.env)
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Métadonnées cibles pour l'autogénération des migrations
target_metadata = Base.metadata

print("DATABASE_URL =", settings.DATABASE_URL)
def run_migrations_offline() -> None:
    """Exécute les migrations en mode 'offline' (génère uniquement le SQL)."""
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
    """Exécute les migrations en mode 'online' (connexion directe à la base)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
    print("DATABASE_URL =", settings.DATABASE_URL)
else:
    run_migrations_online()
    print("DATABASE_URL =", settings.DATABASE_URL)
