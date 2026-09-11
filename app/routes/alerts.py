"""
Routes : Alertes (module 5, partie 2 — captures nulles consécutives,
déjà implémenté côté équipe stockage, on ne fait que le consommer) +
Journal / calendrier (module 6).
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app import storage_client
from app.services import anomaly_service, journal_service
from app.services.calculations import to_dataframe
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/monitoring/alerts", tags=["Monitoring - Alertes & Journal"])


@router.get("", summary="Lister les alertes (proxy de l'équipe stockage)")
def list_alerts(
    study_id: Optional[int] = Query(default=None),
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    parameter: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=1000, ge=1, le=5000),
):
    try:
        return storage_client.list_alerts(
            study_id=study_id, set_number=set_number, parameter=parameter, severity=severity,
            status=status,
            date_from=date_from.isoformat() if date_from else None,
            date_to=date_to.isoformat() if date_to else None,
            skip=skip, limit=limit,
        )
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/config", summary="Consulter le seuil de captures nulles consécutives")
def get_config():
    try:
        return storage_client.get_alert_config()
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.put("/config", summary="Modifier le seuil de captures nulles consécutives")
def update_config(threshold: int = Query(..., ge=1, le=1000)):
    try:
        return storage_client.set_alert_config(threshold)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/calendar", summary="Journal : calendrier des jours avec alerte (rouge) et anomalie (rouge/orange)")
def calendar(
    date_from: Optional[datetime] = Query(default=None, description="Début de la période affichée (ex. le 1er du mois)"),
    date_to: Optional[datetime] = Query(default=None, description="Fin de la période affichée (ex. le dernier jour du mois)"),
    include_anomalies: bool = Query(default=True, description="Inclure la détection d'anomalies (Z-score/Isolation Forest/Autoencoder), coûteux sur une longue période"),
):
    try:
        alerts = storage_client.list_alerts(
            date_from=date_from.isoformat() if date_from else None,
            date_to=date_to.isoformat() if date_to else None,
            limit=5000,
        )
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    anomaly_events: list[dict] = []
    if include_anomalies:
        try:
            for set_number in (1, 2):
                rows = storage_client.fetch_raw_data_range(set_number=set_number, start_date=date_from, end_date=date_to)
                df = to_dataframe(rows)
                anomaly_events.extend(anomaly_service.detect_anomaly_events(df, set_number))
        except storage_client.StorageAPIError as exc:
            logger.warning("Détection d'anomalies indisponible pour le calendrier : %s", exc)

    return journal_service.build_calendar(alerts, anomaly_events)


@router.get("/calendar/{day}", summary="Journal : détail des alertes ET anomalies d'un jour précis (YYYY-MM-DD)")
def calendar_day(day: str, include_anomalies: bool = Query(default=True)):
    try:
        day_start = datetime.fromisoformat(day)
        day_end = day_start + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Format de date invalide, attendu YYYY-MM-DD.")

    try:
        alerts = storage_client.list_alerts(
            date_from=day_start.isoformat(), date_to=day_end.isoformat(), limit=5000
        )
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    anomaly_events: list[dict] = []
    if include_anomalies:
        try:
            for set_number in (1, 2):
                rows = storage_client.fetch_raw_data_range(set_number=set_number, start_date=day_start, end_date=day_end)
                df = to_dataframe(rows)
                anomaly_events.extend(anomaly_service.detect_anomaly_events(df, set_number))
        except storage_client.StorageAPIError as exc:
            logger.warning("Détection d'anomalies indisponible pour le jour %s : %s", day, exc)

    return journal_service.day_detail(alerts, anomaly_events, day)
