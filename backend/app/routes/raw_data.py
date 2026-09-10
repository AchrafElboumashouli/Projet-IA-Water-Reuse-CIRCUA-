"""
Routes API : données brutes des capteurs (/api/raw-data).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import get_db
from app.schemas.raw_data import RawSensorDataListResponse, RawSensorDataOut
from app.services import raw_data_service
from app.utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/raw-data", tags=["Raw Sensor Data"])


def _validate_set_number(set_number: Optional[int]) -> None:
    """Raises 400 if `set_number` isn't one of the configured sensor sets
    (see `settings.SENSOR_SETS`). Replaces the old hardcoded `ge=1, le=2`
    bounds now that the number of sets is configurable."""
    if set_number is not None and set_number not in settings.valid_set_numbers:
        raise HTTPException(
            status_code=400,
            detail=f"set_number invalide : {set_number}. Sets configurés : {settings.valid_set_numbers}.",
        )


@router.get("", response_model=RawSensorDataListResponse, summary="Lister les données brutes")
def list_raw_data(
    set_number: Optional[int] = Query(default=None, description="Filtrer par set (voir /api/sensor-sets)"),
    skip: int = Query(default=0, ge=0, description="Décalage de pagination"),
    limit: int = Query(default=100, ge=1, le=1000, description="Nombre maximum de résultats"),
    db: Session = Depends(get_db),
):
    """Retourne une liste paginée des mesures brutes, triées par date décroissante."""
    _validate_set_number(set_number)
    try:
        data = raw_data_service.get_raw_data(db, set_number=set_number, skip=skip, limit=limit)
        total = raw_data_service.count_raw_data(db, set_number=set_number)
        return RawSensorDataListResponse(count=total, data=data)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la récupération des données brutes : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la récupération des données.")


@router.get("/latest", response_model=list[RawSensorDataOut], summary="Dernière mesure disponible")
def latest_raw_data(
    set_number: Optional[int] = Query(default=None, description="Filtrer par set (voir /api/sensor-sets)"),
    db: Session = Depends(get_db),
):
    """
    Retourne la dernière mesure enregistrée.

    - Si `set_number` est précisé : la dernière mesure de ce set.
    - Sinon : la dernière mesure de chaque set configuré.
    """
    _validate_set_number(set_number)
    try:
        data = raw_data_service.get_latest_raw_data(db, set_number=set_number)
        if not data:
            raise HTTPException(status_code=404, detail="Aucune donnée disponible.")
        return data
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la récupération de la dernière mesure : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la récupération des données.")


@router.get("/set/{set_number}", response_model=RawSensorDataListResponse, summary="Données d'un set de capteurs")
def raw_data_by_set(
    set_number: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Retourne les mesures brutes pour un set de capteurs donné (voir /api/sensor-sets)."""
    _validate_set_number(set_number)

    try:
        data = raw_data_service.get_raw_data_by_set(db, set_number=set_number, skip=skip, limit=limit)
        total = raw_data_service.count_raw_data(db, set_number=set_number)
        return RawSensorDataListResponse(count=total, data=data)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la récupération des données du set %s : %s", set_number, exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la récupération des données.")
