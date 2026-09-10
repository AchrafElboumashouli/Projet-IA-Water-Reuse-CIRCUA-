"""
Service métier pour l'entité racine `studies`.

Fonctionnalités :
    - Création et consultation des études
    - Assignation de mesures brutes (`raw_sensor_data`) existantes à une
      étude, par simple mise à jour de `study_id` (remplace l'ancien
      mécanisme qui copiait les lignes dans `study_results`)
    - Export CSV des mesures brutes d'une étude (RawSensorData.study_id
      == study_id, condition toujours appliquée), avec filtres
      optionnels de date et de numéro de set, et calcul à la volée du
      temps écoulé (en minutes) depuis la première mesure exportée

Une étude ne porte plus d'information de plante (voir app/models/study.py) :
ce filtre a été retiré de l'export, qui ne dépend donc plus que de la
période et du set de capteurs.
"""

import io
from datetime import datetime
from typing import Optional

import pandas as pd
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.raw_sensor_data import RawSensorData
from app.models.study import Study
from app.schemas.study import StudyCreate
from app.utils.logger import get_logger
from app.utils.timezone import now_utc, to_utc

logger = get_logger(__name__)


# --------------------------------------------------------------------------
# Studies CRUD
# --------------------------------------------------------------------------
def create_study(db: Session, study_in: StudyCreate) -> Study:
    data = study_in.model_dump()
    # Same rationale as cycle_service.create_cycle_with_results: a naive
    # datetime here represents a wall-clock time in the app's business
    # timezone (form input); localize+convert to UTC before storage.
    data["start_date"] = to_utc(data["start_date"])
    if data.get("end_date") is not None:
        data["end_date"] = to_utc(data["end_date"])
    study = Study(**data)
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
# Studies - delete
# --------------------------------------------------------------------------
def delete_study(db: Session, study_id: int) -> bool:
    """Permanently deletes a study WITHOUT touching its cycles.

    A Study never owns a Cycle's lifecycle. The Study<->Cycle
    relationship is many-to-many, carried entirely by the `study_cycles`
    association table (see app/models/study_cycle.py):

        - `StudyCycle.study_id` -> ON DELETE CASCADE, so deleting a study
          only removes its `study_cycles` rows (i.e. it stops "using" its
          cycles). The Cycle rows themselves, their `cycle_results` and
          their `cycle_plants` are NEVER touched, and any other Study
          also associated with the same cycle keeps its own association
          intact.
        - `RawSensorData.study_id` -> ON DELETE SET NULL (see
          app/models/raw_sensor_data.py), so raw sensor rows are never
          deleted either: they simply lose their study_id and become
          unassigned again.

    `Study.raw_sensor_data` / `Study.study_cycle_links` are declared with
    passive_deletes=True, so this delete never loads either collection
    into memory — the database enforces both behaviors on its own, in
    the same transaction as the study delete.

    Returns False if the study does not exist (nothing to delete);
    True on successful deletion.
    """
    study = db.execute(
        select(Study).where(Study.id == study_id)
    ).scalar_one_or_none()
    if study is None:
        return False

    db.delete(study)
    db.commit()
    logger.info("Étude supprimée : id=%s", study_id)
    return True


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

    start_dt = study.start_date
    end_dt = study.end_date or now_utc()

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
    study_id: int,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    set_number: Optional[int] = None,
) -> io.StringIO:
    """
    Exporte au format CSV les mesures brutes (`raw_sensor_data`)
    RATTACHÉES À CETTE ÉTUDE (RawSensorData.study_id == study_id) —
    contrairement à l'ancienne version de cet export, qui ne filtrait
    que par date et set_number et pouvait donc renvoyer des mesures
    d'une autre étude, ou non assignées à aucune étude, si elles
    tombaient dans l'intervalle de dates demandé.

    `start_date`, `end_date` et `set_number` restent des filtres
    optionnels pour affiner l'export (ex. un seul set de capteurs, ou
    une sous-période de l'étude), mais l'appartenance à l'étude est
    désormais la condition de base, toujours appliquée.

    La colonne `time` (minutes écoulées depuis la première mesure du jeu
    exporté) est calculée à la volée.
    """
    conditions = [RawSensorData.study_id == study_id]
    if start_date is not None:
        conditions.append(RawSensorData.created_at >= start_date)
    if end_date is not None:
        conditions.append(RawSensorData.created_at <= end_date)
    if set_number is not None:
        conditions.append(RawSensorData.set_number == set_number)

    query = (
        select(RawSensorData)
        .where(*conditions)
        .order_by(RawSensorData.created_at.asc())
    )

    rows = list(db.execute(query).scalars().all())

    columns = ["id", "study_id", "created_at", "ph", "temperature", "ec", "turbidity", "do", "time",
               "set_number"]

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
        "Export CSV généré : %d ligne(s) (study_id=%s, set_number=%s, %s -> %s)",
        len(rows), study_id, set_number, start_date, end_date,
    )

    return buffer
