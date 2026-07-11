"""
Routes API : cycles de laboratoire (/api/cycles).

Endpoints :
    - GET  /api/meta               -> paramètres & étapes que le frontend doit afficher
    - POST /api/cycles             -> créer un cycle + résultats calculés (UNE requête)
    - GET  /api/cycles/{cycle_id}  -> détail d'un cycle avec sa table de résultats complète
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.cycle import PARAMETERS, STAGES, CycleCreate, CycleOut
from app.services import cycle_service, study_service
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["Cycles"])


@router.get("/api/meta", summary="Paramètres et étapes attendus pour un cycle")
def get_meta():
    """Indique au frontend exactement quelles 24 lignes afficher, dans l'ordre."""
    return {"parameters": PARAMETERS, "stages": STAGES}


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


@router.get("/api/cycles/{cycle_id}", response_model=CycleOut, summary="Détail d'un cycle")
def get_cycle(cycle_id: int, db: Session = Depends(get_db)):
    cycle = cycle_service.get_cycle(db, cycle_id)
    if cycle is None:
        raise HTTPException(status_code=404, detail="Cycle introuvable.")
    return cycle
