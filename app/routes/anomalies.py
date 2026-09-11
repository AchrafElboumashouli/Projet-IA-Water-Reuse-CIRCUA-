"""
Routes : détection intelligente d'anomalies (module 5, partie 1) +
comparaison entre sets / drift (module 4 partiel + module E du CdC).

La partie "captures nulles consécutives" (module 5, partie 2) est déjà
implémentée côté équipe stockage : voir app/routes/alerts.py qui ne fait
que consommer /api/alerts.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app import storage_client
from app.services import anomaly_service, comparison_service
from app.services.calculations import to_dataframe
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/monitoring/anomalies", tags=["Monitoring - Anomalies"])


def _load(set_number: Optional[int], start_date: Optional[datetime], end_date: Optional[datetime]):
    rows = storage_client.fetch_raw_data_range(set_number=set_number, start_date=start_date, end_date=end_date)
    return to_dataframe(rows)


@router.get("/zscore", summary="Anomalies univariées (Z-score) par paramètre")
def zscore_endpoint(
    parameter: str,
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    threshold: Optional[float] = Query(default=None, gt=0),
):
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return anomaly_service.zscore_anomalies(df, parameter, threshold=threshold)


@router.get("/isolation-forest", summary="Anomalies multivariées (Isolation Forest)")
def isolation_forest_endpoint(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    contamination: Optional[float] = Query(default=None, gt=0, lt=0.5),
):
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return anomaly_service.isolation_forest_anomalies(df, contamination=contamination)


@router.get("/autoencoder", summary="Anomalies multivariées (Autoencoder - erreur de reconstruction)")
def autoencoder_endpoint(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    error_percentile: Optional[float] = Query(default=None, gt=50, lt=100),
):
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return anomaly_service.autoencoder_anomalies(df, error_percentile=error_percentile)


@router.get("/drift", summary="Dérive entre SET 1 et SET 2 (test de Kolmogorov-Smirnov)")
def drift_endpoint(
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
):
    try:
        df1 = _load(1, start_date, end_date)
        df2 = _load(2, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return anomaly_service.drift_between_sets(df1, df2)


@router.get("/compare-sets", summary="Comparaison statistique SET 1 vs SET 2 pour un paramètre")
def compare_sets_endpoint(
    parameter: str,
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
):
    try:
        df1 = _load(1, start_date, end_date)
        df2 = _load(2, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return comparison_service.compare_sets(df1, df2, parameter)
