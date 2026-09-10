"""
Service métier pour le système de cycles de laboratoire
(`cycles` / `cycle_plants` / `cycle_results`), utilisables par une ou
plusieurs études à la fois via la table d'association `study_cycles`
(voir app/models/study_cycle.py).

build_cycle_results() est le cœur du module : il prend les 24 lignes
brutes envoyées par le client (réplicats uniquement) et retourne des
lignes entièrement calculées (moyenne, écart-type, removal 1/2/3,
removal %, removal std), prêtes à être persistées. Les rôles
(stage_1/2/3) sont persistés tels quels dans
`cycle_results.stage_role` — le libellé d'étape réel est écrit une
fois sur `cycle_results.stage` (voir app/schemas/cycle.py::STAGE_LABELS).

Les noms de plante ne transitent JAMAIS par `build_cycle_results` ou
`cycle_results` : ils sont gérés séparément par
`upsert_cycle_plants()`, qui écrit/maj la ligne `cycle_plants` liée au
cycle via `cycle_id`. C'est PostgreSQL — pas le fichier Excel importé,
pas les lignes de résultats — qui porte la relation entre les plantes
d'un cycle et ses résultats :

    cycle_plants.cycle_id  -> cycles.id
    cycle_results.cycle_id -> cycles.id

IMPORTANT : un Cycle ne peut plus être supprimé via l'application (voir
suppression de delete_cycle / DELETE /api/cycles/{id}). La page Cycles
est un dépôt permanent : tous les cycles créés restent en base pour
toujours et peuvent être réutilisés par n'importe quelle étude, y
compris plusieurs à la fois.
"""
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.cycle import Cycle
from app.models.cycle_plants import CyclePlants
from app.models.cycle_result import CycleResult
from app.models.study import Study
from app.models.study_cycle import StudyCycle
from app.schemas.cycle import (
    BASELINE_STAGE_ROLE,
    STAGE_LABELS,
    CycleCreate,
    CyclePlantsIn,
    CycleRowIn,
)
from app.services.calculations import (
    compute_average,
    compute_removal,
    compute_std,
    round_or_none,
)
from app.utils.logger import get_logger
from app.utils.timezone import to_utc

logger = get_logger(__name__)


# --------------------------------------------------------------------------
# Cycles - read
# --------------------------------------------------------------------------
def list_cycles_for_study(db: Session, study_id: int) -> List[Cycle]:
    """Cycles currently associated with this study, through `study_cycles`
    (many-to-many — a cycle may also be associated with other studies at
    the same time; that's independent of this list)."""
    query = (
        select(Cycle)
        .join(StudyCycle, StudyCycle.cycle_id == Cycle.id)
        .where(StudyCycle.study_id == study_id)
        .options(joinedload(Cycle.plants))
        .order_by(Cycle.created_at.desc())
    )
    return list(db.execute(query).unique().scalars().all())


def list_all_cycles(db: Session, search: Optional[str] = None) -> List[Cycle]:
    """ALL cycles in the database, with no filtering — the permanent
    repository backing both the standalone Cycles page and "Import
    Existing Cycle" (see spec: "show ALL Cycles ... with no filter or
    exception"). Each cycle's `.studies` is eagerly loaded so callers can
    display every study currently using it (possibly zero, one, or many).
    """
    query = (
        select(Cycle)
        .options(joinedload(Cycle.plants), joinedload(Cycle.studies))
        .order_by(Cycle.created_at.desc())
    )
    cycles = list(db.execute(query).unique().scalars().all())
    if search:
        needle = search.strip().lower()
        cycles = [c for c in cycles if needle in c.cycle_name.lower()]
    return cycles


def get_cycle(db: Session, cycle_id: int) -> Optional[Cycle]:
    query = (
        select(Cycle)
        .options(
            joinedload(Cycle.results),
            joinedload(Cycle.plants),
            joinedload(Cycle.studies),
        )
        .where(Cycle.id == cycle_id)
    )
    return db.execute(query).unique().scalar_one_or_none()


# --------------------------------------------------------------------------
# Cycles - reuse / "Import Existing Cycle"
# --------------------------------------------------------------------------
def import_cycle_into_study(db: Session, study_id: int, cycle_id: int) -> Cycle:
    """Associates an existing Cycle with `study_id`, WITHOUT cloning
    anything: only a new `study_cycles` row is created. The Cycle, its
    `cycle_results` and its `cycle_plants` are never touched, and any
    other Study already using this cycle keeps its own association
    untouched too — the same Cycle can be used by several Studies at
    once (Study A -> Cycle 1 AND Study B -> Cycle 1 simultaneously).

    Raises ValueError (mapped to 4xx by the route) if:
        - the study does not exist,
        - the cycle does not exist,
        - this exact Study<->Cycle association already exists (avoids a
          duplicate row / silent no-op that could confuse the user).
    """
    study = db.get(Study, study_id)
    if study is None:
        raise ValueError(f"Étude introuvable : id={study_id}")

    cycle = db.execute(
        select(Cycle).where(Cycle.id == cycle_id)
    ).scalar_one_or_none()
    if cycle is None:
        raise ValueError(f"Cycle introuvable : id={cycle_id}")

    existing_link = db.execute(
        select(StudyCycle).where(
            StudyCycle.study_id == study_id, StudyCycle.cycle_id == cycle_id
        )
    ).scalar_one_or_none()
    if existing_link is not None:
        raise ValueError("Ce cycle est déjà associé à cette étude.")

    db.add(StudyCycle(study_id=study_id, cycle_id=cycle_id))
    db.commit()
    logger.info(
        "Cycle importé : cycle_id=%s associé à study_id=%s", cycle_id, study_id
    )
    return get_cycle(db, cycle_id)


def remove_cycle_from_study(db: Session, study_id: int, cycle_id: int) -> bool:
    """"Delete" a Cycle from a Study's Cycles page: removes ONLY the
    `study_cycles` association row for (study_id, cycle_id). The Cycle
    itself, its `cycle_results`, and its `cycle_plants` are NEVER
    touched, and any other Study<->Cycle association (e.g. the same
    cycle used by another study) is left completely untouched — this is
    the many-to-many "unassign" operation, not a delete of the Cycle.

    Returns True if an association was found and removed, False if no
    such (study_id, cycle_id) association existed (caller maps this to
    404).
    """
    link = db.execute(
        select(StudyCycle).where(
            StudyCycle.study_id == study_id, StudyCycle.cycle_id == cycle_id
        )
    ).scalar_one_or_none()
    if link is None:
        return False

    db.delete(link)
    db.commit()
    logger.info(
        "Association retirée : study_id=%s n'utilise plus cycle_id=%s "
        "(le Cycle, ses cycle_results et cycle_plants restent en base)",
        study_id, cycle_id,
    )
    return True


# --------------------------------------------------------------------------
# Cycles - calculations
# --------------------------------------------------------------------------
def build_cycle_results(rows: List[CycleRowIn]) -> List[dict]:
    """
    Compute average/std/removal for every row.

    Removal for a stage_2 / stage_3 row is calculated against the
    stage_1 row (BASELINE_STAGE_ROLE — the reference/untreated sample)
    of the SAME parameter, replicate by replicate, then averaged with
    its own std. This calculation always operates on the stable
    stage_1/2/3 roles (row.stage as sent by the client).

    The returned rows persist the stable role in `stage_role` (used only
    for the Removal % baseline) AND the real stage label in `stage`
    ("Wastewater"/"Planted Series"/"Control Series", resolved once here
    via STAGE_LABELS) — the database itself holds the user-facing value,
    not just the API response. No plant information is ever attached
    here: plant names live exclusively in `cycle_plants` (see
    upsert_cycle_plants below).
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

        if row.stage != BASELINE_STAGE_ROLE:
            baseline = by_key.get((row.parameter, BASELINE_STAGE_ROLE))
            if baseline is not None:
                removal_1 = compute_removal(baseline.replicate_1, row.replicate_1)
                removal_2 = compute_removal(baseline.replicate_2, row.replicate_2)
                removal_3 = compute_removal(baseline.replicate_3, row.replicate_3)
                removal_percent = compute_average([removal_1, removal_2, removal_3])
                removal_std = compute_std([removal_1, removal_2, removal_3])

        computed_rows.append(
            {
                "parameter": row.parameter,
                "stage_role": row.stage,
                "stage": STAGE_LABELS.get(row.stage, row.stage),
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
# Cycle plants - write
# --------------------------------------------------------------------------
def upsert_cycle_plants(db: Session, cycle_id: int, plants: CyclePlantsIn) -> Optional[CyclePlants]:
    """Creates or updates the single `cycle_plants` row for this cycle.

    Does nothing (and returns the existing record untouched, or None) if
    all three plant names are blank — a cycle can exist without any
    plant names, filled in later at the cycle level.
    """
    plant_1 = (plants.plant_1 or "").strip()
    plant_2 = (plants.plant_2 or "").strip()
    plant_3 = (plants.plant_3 or "").strip()

    existing = db.execute(
        select(CyclePlants).where(CyclePlants.cycle_id == cycle_id)
    ).scalar_one_or_none()

    if not (plant_1 or plant_2 or plant_3):
        return existing

    if existing is None:
        existing = CyclePlants(cycle_id=cycle_id)
        db.add(existing)

    existing.plant_1 = plant_1
    existing.plant_2 = plant_2
    existing.plant_3 = plant_3
    db.flush()
    return existing


# --------------------------------------------------------------------------
# Cycles - write
# --------------------------------------------------------------------------
def create_cycle_with_results(db: Session, cycle_in: CycleCreate) -> Cycle:
    cycle = Cycle(
        cycle_name=cycle_in.cycle_name,
        # `cycle_in.start_date`/`end_date` may be naive (e.g. a
        # `datetime-local` form field submitted with no UTC offset,
        # representing a wall-clock time in the app's business timezone)
        # or already UTC-aware (e.g. pre-converted by the Excel importer).
        # `to_utc` is a no-op localization+conversion in both cases, so
        # this is the single place that guarantees the value stored is
        # always UTC-aware, regardless of the caller.
        start_date=to_utc(cycle_in.start_date),
        end_date=to_utc(cycle_in.end_date),
    )
    db.add(cycle)
    db.flush()  # assign cycle.id without committing yet

    # A brand-new cycle is always created under one study; this is the
    # cycle's FIRST `study_cycles` association row, not a `study_id`
    # column on the cycle itself (see app/models/study_cycle.py). Other
    # studies can associate with the very same cycle later on via
    # "Import Existing Cycle" (import_cycle_into_study above).
    db.add(StudyCycle(study_id=cycle_in.study_id, cycle_id=cycle.id))

    computed_rows = build_cycle_results(cycle_in.rows)

    for row in computed_rows:
        db.add(CycleResult(cycle_id=cycle.id, **row))

    # Plant names are written to their OWN table, linked via cycle_id —
    # never onto cycle_results rows.
    upsert_cycle_plants(db, cycle.id, cycle_in.plants)

    db.commit()
    logger.info(
        "Cycle créé : id=%s, study_id=%s, nom=%s (%d lignes de résultats)",
        cycle.id, cycle_in.study_id, cycle.cycle_name, len(computed_rows),
    )
    return get_cycle(db, cycle.id)
