"""
Service métier pour l'entité racine `studies`.

Fonctionnalités :
    - Création et consultation des études
    - Assignation de mesures brutes (`raw_sensor_data`) existantes à une
      étude, par simple mise à jour de `study_id` (remplace l'ancien
      mécanisme qui copiait les lignes dans `study_results`)
    - Export CSV des mesures brutes d'une étude, filtré par date, type de
      plante et numéro de set, avec calcul à la volée du temps écoulé
      (en minutes) depuis la première mesure exportée
"""

import io
from datetime import date, datetime
from typing import Optional

import pandas as pd
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.raw_sensor_data import RawSensorData
from app.models.study import Study
from app.schemas.study import StudyCreate
from app.utils.logger import get_logger

logger = get_logger(__name__)


# --------------------------------------------------------------------------
# Studies CRUD
# --------------------------------------------------------------------------
def create_study(db: Session, study_in: StudyCreate) -> Study:
    study = Study(**study_in.model_dump())
    db.add(study)
    db.commit()
    db.refresh(study)
    logger.info("Étude créée : id=%s, nom=%s", study.id, study.study_name)
    return study


def get_study(db: Session, study_id: int) -> Optional[Study]:
    return db.get(Study, study_id)


def list_studies(db: Session, skip: int = 0, limit: int = 100) -> list[Study]:
    query = select(Study).order_by(Study.start_date.desc()).offset(skip).limit(limit)
    return list(db.execute(query).scalars().all())


# --------------------------------------------------------------------------
# Assignation de raw_sensor_data à une étude
# --------------------------------------------------------------------------
def assign_raw_data_to_study(db: Session, study_id: int, set_number: int) -> int:
    """
    Lie (in place, via `study_id`) les mesures de `raw_sensor_data`
    correspondant à la période et au set d'une étude donnée.

    Contrairement à l'ancien mécanisme (`populate_study_results`), aucune
    copie de données n'est créée : les lignes de `raw_sensor_data` sont
    directement mises à jour. Une mesure déjà assignée à cette étude
    n'est pas retouchée ; une mesure assignée à une AUTRE étude n'est
    jamais réassignée automatiquement (ré-assignation manuelle requise).
    """
    study = get_study(db, study_id)
    if study is None:
        raise ValueError(f"Étude introuvable : id={study_id}")

    end_date = study.end_date or date.today()
    start_dt = datetime.combine(study.start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    stmt = (
        update(RawSensorData)
        .where(
            RawSensorData.set_number == set_number,
            RawSensorData.created_at >= start_dt,
            RawSensorData.created_at <= end_dt,
            RawSensorData.study_id.is_(None),
        )
        .values(study_id=study_id)
    )
    result = db.execute(stmt)
    db.commit()

    assigned = result.rowcount or 0
    logger.info(
        "Étude id=%s : %d mesure(s) brute(s) assignée(s) (set=%s)",
        study_id, assigned, set_number,
    )
    return assigned


# --------------------------------------------------------------------------
# Export CSV
# --------------------------------------------------------------------------
def export_study_results_csv(
    db: Session,
    start_date: date,
    end_date: date,
    plant_type: str,
    set_number: int,
) -> io.StringIO:
    """
    Exporte au format CSV les mesures brutes (`raw_sensor_data`) rattachées
    à une étude, correspondant aux filtres fournis.

    La colonne `time` (minutes écoulées depuis la première mesure du jeu
    exporté) est calculée à la volée, exactement comme avant, mais lue
    directement depuis `raw_sensor_data` (jointe à `studies` pour le
    filtre `plant_type`) plutôt que depuis la table `study_results`
    aujourd'hui supprimée.
    """
    query = (
        select(RawSensorData)
        .join(Study, Study.id == RawSensorData.study_id)
        .where(
            RawSensorData.created_at >= datetime.combine(start_date, datetime.min.time()),
            RawSensorData.created_at <= datetime.combine(end_date, datetime.max.time()),
            Study.plant_type == plant_type,
            RawSensorData.set_number == set_number,
        )
        .order_by(RawSensorData.created_at.asc())
    )

    rows = list(db.execute(query).scalars().all())

    columns = ["id", "study_id", "created_at", "ph", "temperature", "ec", "turbidity", "do", "time",
               "plant_type", "set_number"]

    if not rows:
        df = pd.DataFrame(columns=columns)
    else:
        records = [
            {
                "id": r.id,
                "study_id": r.study_id,
                "created_at": r.created_at,
                "ph": r.ph,
                "temperature": r.temperature,
                "ec": r.ec,
                "turbidity": r.turbidity,
                "do": r.do,
                "time": None,
                "plant_type": plant_type,
                "set_number": r.set_number,
            }
            for r in rows
        ]
        df = pd.DataFrame(records, columns=columns)

        # Recalcul de "time" = minutes écoulées depuis la première mesure du jeu exporté
        first_timestamp = df["created_at"].min()
        df["time"] = df["created_at"].apply(
            lambda ts: round((ts - first_timestamp).total_seconds() / 60.0, 2)
        )

    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    buffer.seek(0)

    logger.info(
        "Export CSV généré : %d ligne(s) (plant_type=%s, set_number=%s, %s -> %s)",
        len(rows), plant_type, set_number, start_date, end_date,
    )

    return buffer
