"""
Service métier pour le système de cycles de laboratoire
(`cycles` / `cycle_results`), rattachés à une étude.

build_cycle_results() est le cœur du module : il prend les 24 lignes
brutes envoyées par le client (réplicats uniquement) et retourne des
lignes entièrement calculées (moyenne, écart-type, removal 1/2/3,
removal %, removal std), prêtes à être persistées.
"""
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.cycle import Cycle
from app.models.cycle_result import CycleResult
from app.schemas.cycle import CycleCreate, CycleRowIn
from app.services.calculations import (
    compute_average,
    compute_removal,
    compute_std,
    round_or_none,
)
from app.utils.logger import get_logger

logger = get_logger(__name__)


# --------------------------------------------------------------------------
# Cycles - read
# --------------------------------------------------------------------------
def list_cycles_for_study(db: Session, study_id: int) -> List[Cycle]:
    query = (
        select(Cycle)
        .where(Cycle.study_id == study_id)
        .order_by(Cycle.created_at.desc())
    )
    return list(db.execute(query).scalars().all())


def get_cycle(db: Session, cycle_id: int) -> Optional[Cycle]:
    query = (
        select(Cycle)
        .options(joinedload(Cycle.results))
        .where(Cycle.id == cycle_id)
    )
    return db.execute(query).unique().scalar_one_or_none()


# --------------------------------------------------------------------------
# Cycles - calculations
# --------------------------------------------------------------------------
def build_cycle_results(rows: List[CycleRowIn]) -> List[dict]:
    """
    Compute average/std/removal for every row.

    Removal for a "Planted Series" / "Control Series" row is calculated
    against the "Wastewater" row of the SAME parameter, replicate by
    replicate, then averaged with its own std.
    """
    by_key: Dict[Tuple[str, str], CycleRowIn] = {
        (r.parameter, r.stage): r for r in rows
    }

    computed_rows: List[dict] = []

    for row in rows:
        replicates = [row.replicate_1, row.replicate_2, row.replicate_3]
        average = compute_average(replicates)
        std = compute_std(replicates)

        removal_1 = removal_2 = removal_3 = removal_percent = removal_std = None

        if row.stage != "Wastewater":
            baseline = by_key.get((row.parameter, "Wastewater"))
            if baseline is not None:
                removal_1 = compute_removal(baseline.replicate_1, row.replicate_1)
                removal_2 = compute_removal(baseline.replicate_2, row.replicate_2)
                removal_3 = compute_removal(baseline.replicate_3, row.replicate_3)
                removal_percent = compute_average([removal_1, removal_2, removal_3])
                removal_std = compute_std([removal_1, removal_2, removal_3])

        computed_rows.append(
            {
                "parameter": row.parameter,
                "stage": row.stage,
                "replicate_1": row.replicate_1,
                "replicate_2": row.replicate_2,
                "replicate_3": row.replicate_3,
                "average": round_or_none(average),
                "std": round_or_none(std),
                "removal_1": round_or_none(removal_1),
                "removal_2": round_or_none(removal_2),
                "removal_3": round_or_none(removal_3),
                "removal_percent": round_or_none(removal_percent),
                "removal_std": round_or_none(removal_std),
            }
        )

    return computed_rows


# --------------------------------------------------------------------------
# Cycles - write
# --------------------------------------------------------------------------
def create_cycle_with_results(db: Session, cycle_in: CycleCreate) -> Cycle:
    cycle = Cycle(
        study_id=cycle_in.study_id,
        cycle_name=cycle_in.cycle_name,
        start_date=cycle_in.start_date,
        end_date=cycle_in.end_date,
    )
    db.add(cycle)
    db.flush()  # assign cycle.id without committing yet

    computed_rows = build_cycle_results(cycle_in.rows)

    for row in computed_rows:
        db.add(CycleResult(cycle_id=cycle.id, **row))

    db.commit()
    logger.info(
        "Cycle créé : id=%s, study_id=%s, nom=%s (%d lignes de résultats)",
        cycle.id, cycle.study_id, cycle.cycle_name, len(computed_rows),
    )
    return get_cycle(db, cycle.id)
