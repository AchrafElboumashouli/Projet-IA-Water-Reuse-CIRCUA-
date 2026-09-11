"""
Routes : monitoring temps réel & historique des données brutes
(module 1 du besoin : graphes, filtres plante/set/temps, cartes de
conformité aux normes).
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app import storage_client
from app.norms_config import NORMS, evaluate_parameter
from app.services.calculations import NUMERIC_PARAMETERS, data_quality_report, to_dataframe
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/monitoring/raw-data", tags=["Monitoring - Données brutes"])


@router.get("/latest", summary="Dernière mesure + conformité aux normes")
def latest_with_compliance(set_number: Optional[int] = Query(default=None, ge=1, le=2)):
    try:
        latest = storage_client.get_latest_raw_data(set_number=set_number)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    enriched = []
    for entry in latest:
        compliance = {param: evaluate_parameter(param, entry.get(param)) for param in NUMERIC_PARAMETERS}
        enriched.append({**entry, "compliance": compliance})
    return enriched


@router.get("/norms", summary="Référentiel des seuils de conformité (Maroc / Europe)")
def get_norms():
    return NORMS


@router.get("/history", summary="Historique filtré (plante, set, période) pour graphes")
def history(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    plant_type: Optional[str] = Query(default=None, description="Filtre indirect via les études de ce type de plante"),
    limit: int = Query(default=5000, ge=1, le=50000),
):
    """
    Retourne les points temporels bruts pour tracer les courbes. Si
    `plant_type` est fourni, on ne garde que les mesures rattachées à une
    étude de ce type de plante (jointure via /api/study).
    """
    try:
        study_ids_for_plant = None
        if plant_type:
            studies = storage_client.list_studies(skip=0, limit=1000)
            study_ids_for_plant = {s["id"] for s in studies if s.get("plant_type") == plant_type}

        rows = storage_client.fetch_raw_data_range(
            set_number=set_number, start_date=start_date, end_date=end_date, hard_cap=limit
        )
        if study_ids_for_plant is not None:
            rows = [r for r in rows if r.get("study_id") in study_ids_for_plant]
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return {"count": len(rows), "data": rows}


@router.get("/quality-report", summary="Rapport de qualité des données (complétude, trous)")
def quality_report(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
):
    try:
        rows = storage_client.fetch_raw_data_range(set_number=set_number, start_date=start_date, end_date=end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    df = to_dataframe(rows)
    return data_quality_report(df)
