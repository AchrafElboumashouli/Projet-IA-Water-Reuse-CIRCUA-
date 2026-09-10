"""
Routes API : cycles de laboratoire (/api/cycles).

Endpoints :
    - GET  /api/meta                        -> paramètres, unités & rôles d'étape que le frontend doit afficher
    - POST /api/cycles                      -> créer un cycle + résultats calculés (UNE requête)
    - GET  /api/cycles/available-for-import -> TOUS les cycles de la base (dépôt permanent, aucun filtre)
    - GET  /api/cycles/{cycle_id}           -> détail d'un cycle avec sa table de résultats complète

Il n'existe volontairement AUCUN endpoint DELETE /api/cycles/{id} : un
Cycle ne peut plus être supprimé via l'application (voir
app/models/study_cycle.py) — seule l'association Study<->Cycle peut être
retirée, en supprimant l'étude (cascade sur `study_cycles` uniquement).
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from typing import Optional

from app.database.session import get_db
from app.schemas.cycle import (
    BASELINE_STAGE_ROLE,
    PARAMETERS,
    PARAMETER_UNITS,
    STAGE_LABELS,
    STAGE_ROLES,
    CycleCreate,
    CycleOut,
    ImportableCycleOut,
)
from app.services import cycle_service, study_service
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["Cycles"])


@router.get("/api/meta", summary="Paramètres, unités et rôles d'étape attendus pour un cycle")
def get_meta():
    """
    Indique au frontend exactement quelles 24 lignes afficher, dans l'ordre,
    ainsi que l'unité de chaque paramètre (affichée une seule fois, en
    en-tête de colonne, jamais répétée dans le nom du paramètre) et les
    rôles d'étape stables. Le libellé d'étape réel pour chaque rôle est
    résolu côté backend via STAGE_LABELS et renvoyé dans
    CycleResultOut.stage ; les noms de plante sont gérés séparément,
    au niveau du cycle, dans la table cycle_plants (voir
    CycleCreate.plants / CycleOut.plants).
    """
    return {
        "parameters": PARAMETERS,
        "parameter_units": PARAMETER_UNITS,
        "stage_roles": STAGE_ROLES,
        "stage_labels": STAGE_LABELS,
        "baseline_stage_role": BASELINE_STAGE_ROLE,
    }


@router.post("/api/cycles", response_model=CycleOut, status_code=201, summary="Créer un cycle")
def create_cycle(cycle_in: CycleCreate, db: Session = Depends(get_db)):
    study = study_service.get_study(db, cycle_in.study_id)
    if study is None:
        raise HTTPException(status_code=404, detail="Étude introuvable.")

    try:
        return cycle_service.create_cycle_with_results(db, cycle_in)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la création du cycle : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la création du cycle.")


@router.get(
    "/api/cycles/available-for-import",
    response_model=list[ImportableCycleOut],
    summary="Lister TOUS les cycles de la base (dépôt permanent, aucun filtre)",
)
def list_available_cycles_for_import(
    search: Optional[str] = Query(
        default=None, description="Filtre insensible à la casse sur le nom du cycle."
    ),
    db: Session = Depends(get_db),
):
    """
    Retourne TOUS les cycles présents en base, sans aucune exception ni
    filtre : cycles actuellement utilisés par une ou plusieurs études,
    cycles n'appartenant plus à aucune étude, et cycles jamais rattachés
    apparaissent tous ici (voir cycle_service.list_all_cycles). Chaque
    cycle expose la liste complète des études qui l'utilisent
    actuellement (`studies`, peut être vide) — le frontend s'en sert pour
    indiquer si le cycle est déjà associé à l'étude courante plutôt que
    de le masquer.
    """
    cycles = cycle_service.list_all_cycles(db, search=search)

    results: list[ImportableCycleOut] = []
    for c in cycles:
        plant_count = 0
        if c.plants is not None:
            plant_count = sum(
                1
                for p in (c.plants.plant_1, c.plants.plant_2, c.plants.plant_3)
                if p and p.strip()
            )
        results.append(
            ImportableCycleOut(
                id=c.id,
                cycle_name=c.cycle_name,
                studies=c.studies,
                start_date=c.start_date,
                end_date=c.end_date,
                created_at=c.created_at,
                plants=c.plants,
                plant_count=plant_count,
            )
        )
    return results


@router.get("/api/cycles/{cycle_id}", response_model=CycleOut, summary="Détail d'un cycle")
def get_cycle(cycle_id: int, db: Session = Depends(get_db)):
    cycle = cycle_service.get_cycle(db, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle introuvable.")
    return cycle
