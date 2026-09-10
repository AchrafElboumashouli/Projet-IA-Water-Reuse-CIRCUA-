"""
Routes API : alertes (/api/alerts).

Endpoints :
    - GET /api/alerts          -> lister les alertes (filtres : type
                                   d'alerte, étude, set de capteurs,
                                   date, sévérité, statut)
    - GET /api/alerts/config   -> consulter le seuil configuré
    - PUT /api/alerts/config   -> modifier le seuil (N événements
                                   consécutifs en échec, appliqué à la
                                   fois aux alertes "No Data Collected"
                                   et "Capture Failure")
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.alert import AlertConfigOut, AlertConfigUpdate, SensorAlertOut
from app.services import alert_service
from app.utils.logger import get_logger
from app.utils.timezone import to_utc

logger = get_logger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("", response_model=list[SensorAlertOut], summary="Lister les alertes")
def list_alerts(
    alert_type: Optional[str] = Query(
        default=None, description="Filtrer par type d'alerte (no_data | capture_failure | anomaly)"
    ),
    study_id: Optional[int] = Query(default=None, description="Filtrer par étude"),
    sensor_set: Optional[str] = Query(
        default=None, description="Filtrer par set de capteurs concerné (1 | 2 | both)"
    ),
    severity: Optional[str] = Query(default=None, description="Filtrer par sévérité (warning | critical)"),
    status: Optional[str] = Query(default=None, description="Filtrer par statut (active | resolved)"),
    date_from: Optional[datetime] = Query(default=None, description="Bornes de date : à partir de"),
    date_to: Optional[datetime] = Query(default=None, description="Bornes de date : jusqu'à"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Retourne la liste des alertes, les plus récentes en premier."""
    try:
        return alert_service.list_alerts(
            db,
            alert_type=alert_type,
            study_id=study_id,
            sensor_set=sensor_set,
            severity=severity,
            status=status,
            date_from=to_utc(date_from) if date_from is not None else None,
            date_to=to_utc(date_to) if date_to is not None else None,
            skip=skip,
            limit=limit,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la récupération des alertes : %s", exc)
        raise HTTPException(status_code=500, detail="Erreur interne lors de la récupération des alertes.")


@router.get("/config", response_model=AlertConfigOut, summary="Consulter le seuil d'alerte")
def get_config(db: Session = Depends(get_db)):
    return AlertConfigOut(null_capture_threshold=alert_service.get_threshold(db))


@router.put("/config", response_model=AlertConfigOut, summary="Modifier le seuil d'alerte")
def update_config(payload: AlertConfigUpdate, db: Session = Depends(get_db)):
    row = alert_service.set_threshold(db, payload.null_capture_threshold)
    return AlertConfigOut(null_capture_threshold=row.null_capture_threshold)
