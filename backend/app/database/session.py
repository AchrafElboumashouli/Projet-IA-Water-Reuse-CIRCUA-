"""
Configuration de la connexion à la base de données PostgreSQL via SQLAlchemy.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,   # vérifie la connexion avant chaque transaction
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    Dependency FastAPI : fournit une session de base de données
    et la ferme automatiquement à la fin de la requête.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
