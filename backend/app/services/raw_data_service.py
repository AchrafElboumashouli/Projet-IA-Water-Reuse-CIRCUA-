"""
Service métier pour la consultation des données brutes des capteurs
(table `raw_sensor_data`).
"""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.raw_sensor_data import RawSensorData
from app.utils.logger import get_logger

logger = get_logger(__name__)


def get_raw_data(
    db: Session,
    set_number: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
) -> list[RawSensorData]:
    """Retourne une liste paginée de mesures brutes, triées par date décroissante."""
    query = select(RawSensorData)

    if set_number is not None:
        query = query.where(RawSensorData.set_number == set_number)

    query = query.order_by(RawSensorData.created_at.desc()).offset(skip).limit(limit)

    return list(db.execute(query).scalars().all())


def get_latest_raw_data(db: Session, set_number: Optional[int] = None) -> list[RawSensorData]:
    """
    Retourne la dernière mesure enregistrée.

    - Si `set_number` est fourni : la dernière mesure de ce set uniquement.
    - Sinon : la dernière mesure de chaque set disponible.
    """
    if set_number is not None:
        query = (
            select(RawSensorData)
            .where(RawSensorData.set_number == set_number)
            .order_by(RawSensorData.created_at.desc())
            .limit(1)
        )
        result = db.execute(query).scalars().first()
        return [result] if result else []

    # Pas de set précisé : on retourne la dernière mesure pour chaque set distinct
    distinct_sets = db.execute(select(RawSensorData.set_number).distinct()).scalars().all()

    latest_entries = []
    for s in distinct_sets:
        query = (
            select(RawSensorData)
            .where(RawSensorData.set_number == s)
            .order_by(RawSensorData.created_at.desc())
            .limit(1)
        )
        entry = db.execute(query).scalars().first()
        if entry:
            latest_entries.append(entry)

    return latest_entries


def get_raw_data_by_set(db: Session, set_number: int, skip: int = 0, limit: int = 100) -> list[RawSensorData]:
    """Retourne les mesures brutes pour un set de capteurs donné (1 ou 2)."""
    query = (
        select(RawSensorData)
        .where(RawSensorData.set_number == set_number)
        .order_by(RawSensorData.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(db.execute(query).scalars().all())


def count_raw_data(db: Session, set_number: Optional[int] = None) -> int:
    """Retourne le nombre total de lignes (utile pour la pagination)."""
    from sqlalchemy import func

    query = select(func.count()).select_from(RawSensorData)
    if set_number is not None:
        query = query.where(RawSensorData.set_number == set_number)
    return db.execute(query).scalar_one()
