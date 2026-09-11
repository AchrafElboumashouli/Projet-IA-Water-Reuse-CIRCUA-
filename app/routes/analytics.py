"""
Routes : statistiques globales (module 2) & analyse scientifique avancée
(module 3 : histogrammes, corrélations, boxplot, heatmap, timeline).
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app import storage_client
from app.services.calculations import (
    NUMERIC_PARAMETERS,
    boxplot_summary,
    correlation_matrix,
    global_statistics,
    histogram,
    pairwise_correlation,
    pca_analysis,
    rolling_average,
    to_dataframe,
)

from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/monitoring/analytics", tags=["Monitoring - Analytique"])


def _load(set_number: Optional[int], start_date: Optional[datetime], end_date: Optional[datetime]):
    rows = storage_client.fetch_raw_data_range(set_number=set_number, start_date=start_date, end_date=end_date)
    return to_dataframe(rows)


@router.get("/global-stats", summary="Statistiques globales (min/max/moyenne/écart-type/quartiles)")
def global_stats(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
):
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return global_statistics(df)


@router.get("/histogram", summary="Histogramme d'un paramètre")
def histogram_endpoint(
    parameter: str = Query(..., description="ph|temperature|ec|turbidity|do"),
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    bins: int = Query(default=20, ge=5, le=100),
):
    if parameter not in NUMERIC_PARAMETERS:
        raise HTTPException(status_code=400, detail=f"Paramètre inconnu. Attendu : {NUMERIC_PARAMETERS}")
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if parameter not in df.columns:
        return {"bin_edges": [], "counts": []}
    return histogram(df[parameter], bins=bins)


@router.get("/boxplot", summary="Résumé boxplot d'un ou plusieurs paramètres")
def boxplot_endpoint(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
):
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {param: boxplot_summary(df[param]) for param in NUMERIC_PARAMETERS if param in df.columns}


@router.get("/correlation", summary="Matrice de corrélation (heatmap) Pearson/Spearman")
def correlation_endpoint(
    method: str = Query(default="pearson", pattern="^(pearson|spearman)$"),
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
):
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return correlation_matrix(df, method=method)


@router.get("/correlation/pairwise", summary="Corrélation détaillée entre deux paramètres")
def correlation_pairwise_endpoint(
    param_a: str,
    param_b: str,
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
):
    if param_a not in NUMERIC_PARAMETERS or param_b not in NUMERIC_PARAMETERS:
        raise HTTPException(status_code=400, detail=f"Paramètres attendus parmi : {NUMERIC_PARAMETERS}")
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return pairwise_correlation(df, param_a, param_b)


@router.get("/timeline", summary="Série temporelle + tendance (moyenne mobile)")
def timeline_endpoint(
    parameter: str,
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    window: int = Query(default=5, ge=1, le=200),
):
    if parameter not in NUMERIC_PARAMETERS:
        raise HTTPException(status_code=400, detail=f"Paramètre inconnu. Attendu : {NUMERIC_PARAMETERS}")
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return rolling_average(df, parameter, window=window)

@router.get("/pca", summary="ACP (PCA) sur les 5 paramètres temps réel (pH, température, EC, turbidité, OD)")
def pca_endpoint(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    n_components: int = Query(default=2, ge=1, le=5),
):
    try:
        df = _load(set_number, start_date, end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return pca_analysis(df, n_components=n_components)