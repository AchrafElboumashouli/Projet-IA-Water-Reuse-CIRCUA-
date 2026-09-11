"""
Routes : Études & Cycles (module 8 "cycles et studies" + module 4
"comparaison IN vs OUT CONTROL vs OUT PLANT" + module C "reporting des
études" du cahier des charges).

Rappel du modèle (cf. équipe stockage) :
    Study (1 plante, 1 période)
      ├── raw_sensor_data assignées (mesures capteurs temps réel)
      └── Cycles (1 ou plusieurs, = une "étude" au sens du CdC)
            └── CycleResult (24 lignes : 8 paramètres x 3 stages
                IN=Wastewater / OUT_CONTROL=Control Series / OUT_PLANT=Planted Series)
"""

from datetime import datetime
from io import StringIO
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse

from app import storage_client
from app.services import comparison_service
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/monitoring/studies", tags=["Monitoring - Études & Cycles"])


# --------------------------------------------------------------------------
# Studies (proxy)
# --------------------------------------------------------------------------
@router.post("", summary="Créer une étude")
def create_study(payload: dict):
    try:
        return storage_client.create_study(payload)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("", summary="Lister les études")
def list_studies(skip: int = 0, limit: int = 100):
    try:
        return storage_client.list_studies(skip=skip, limit=limit)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/{study_id}", summary="Détail d'une étude")
def get_study(study_id: int):
    try:
        return storage_client.get_study(study_id)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/{study_id}/assign", summary="Assigner les mesures brutes existantes à l'étude")
def assign_study(study_id: int, set_number: int = Query(..., ge=1, le=2)):
    try:
        return storage_client.assign_study(study_id, set_number)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# --------------------------------------------------------------------------
# Cycles (proxy)
# --------------------------------------------------------------------------
@router.get("/meta/definitions", summary="Paramètres (8) et étapes (IN/OUT_CONTROL/OUT_PLANT) attendus pour un cycle")
def cycle_meta():
    try:
        meta = storage_client.get_cycle_meta()
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    meta["stage_labels"] = comparison_service.STAGE_LABELS
    return meta


@router.post("/{study_id}/cycles", summary="Créer un cycle (24 lignes : 8 paramètres x IN/OUT_CONTROL/OUT_PLANT)")
def create_cycle(study_id: int, payload: dict):
    payload = {**payload, "study_id": study_id}
    try:
        return storage_client.create_cycle(payload)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/{study_id}/cycles", summary="Lister les cycles d'une étude")
def list_cycles(study_id: int):
    try:
        return storage_client.list_study_cycles(study_id)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/cycles/{cycle_id}", summary="Détail d'un cycle avec sa table de résultats")
def get_cycle(cycle_id: int):
    try:
        return storage_client.get_cycle(cycle_id)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# --------------------------------------------------------------------------
# Comparaison IN vs OUT CONTROL vs OUT PLANT (statistiques + EDA + ANOVA/Tukey + PCA)
# --------------------------------------------------------------------------
def _load_cycles_full(study_id: int, cycle_ids: Optional[list[int]]) -> list[dict]:
    summaries = storage_client.list_study_cycles(study_id)
    if cycle_ids:
        summaries = [c for c in summaries if c["id"] in cycle_ids]
    return [storage_client.get_cycle(c["id"]) for c in summaries]


@router.get("/{study_id}/comparison/descriptive", summary="Stats descriptives IN vs OUT_CONTROL vs OUT_PLANT")
def comparison_descriptive(study_id: int, parameter: str, cycle_ids: Optional[str] = Query(default=None, description="IDs séparés par virgule")):
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return comparison_service.descriptive_by_stage(df, parameter)


@router.get("/{study_id}/comparison/anova-tukey", summary="ANOVA + Tukey HSD : IN vs OUT_CONTROL vs OUT_PLANT")
def comparison_anova(study_id: int, parameter: str, cycle_ids: Optional[str] = Query(default=None)):
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return comparison_service.anova_tukey(df, parameter)


@router.get("/{study_id}/comparison/pca", summary="ACP (PCA) sur les paramètres du cycle")
def comparison_pca(study_id: int, cycle_ids: Optional[str] = Query(default=None), n_components: int = Query(default=2, ge=1, le=8)):
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return comparison_service.pca_analysis(df, n_components=n_components)


@router.get("/{study_id}/comparison/removal-summary", summary="% d'abattement (removal) moyen par paramètre et stage")
def removal_summary(study_id: int, cycle_ids: Optional[str] = Query(default=None)):
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    rows = []
    for cycle in cycles:
        for r in cycle.get("results", []):
            if r["stage"] == "Wastewater":
                continue
            rows.append(
                {
                    "cycle_id": cycle["id"], "cycle_name": cycle.get("cycle_name"),
                    "parameter": r["parameter"],
                    "stage": comparison_service.STAGE_LABELS.get(r["stage"], r["stage"]),
                    "removal_percent": r.get("removal_percent"),
                }
            )
    if not rows:
        return []
    df = pd.DataFrame(rows)
    summary = (
        df.dropna(subset=["removal_percent"])
        .groupby(["parameter", "stage"])["removal_percent"]
        .agg(["mean", "std", "count"])
        .reset_index()
    )
    return summary.round(3).to_dict(orient="records")


# --------------------------------------------------------------------------
# Statistiques globales complètes + analyse scientifique (boxplot/histo/heatmap)
# pour TOUS les paramètres du cycle, sur une étude (ou un sous-ensemble de
# cycles précis via cycle_ids) — demandé pour compléter les modules 2 et 3
# du cahier des charges appliqués aux données de cycle/laboratoire.
# --------------------------------------------------------------------------
@router.get("/{study_id}/global-stats", summary="Statistiques globales complètes (tous paramètres) pour une étude/un cycle")
def study_global_stats(study_id: int, cycle_ids: Optional[str] = Query(default=None, description="IDs séparés par virgule ; un seul ID = stats d'un cycle précis")):
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return {
        "study_id": study_id,
        "cycle_ids": ids or [c["id"] for c in cycles],
        "cycle_count": len(cycles),
        "parameters": comparison_service.global_stats_all_parameters(df),
    }


@router.get("/{study_id}/analysis/boxplot", summary="Boxplot détaillé (IN/OUT_CONTROL/OUT_PLANT) pour un paramètre")
def study_boxplot(study_id: int, parameter: str, cycle_ids: Optional[str] = Query(default=None)):
    if parameter not in comparison_service.CYCLE_PARAMETERS:
        raise HTTPException(status_code=400, detail=f"Paramètre inconnu. Attendu : {comparison_service.CYCLE_PARAMETERS}")
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return comparison_service.boxplot_by_stage(df, parameter)


@router.get("/{study_id}/analysis/histogram", summary="Histogramme (IN/OUT_CONTROL/OUT_PLANT superposables) pour un paramètre")
def study_histogram(study_id: int, parameter: str, cycle_ids: Optional[str] = Query(default=None), bins: int = Query(default=15, ge=5, le=50)):
    if parameter not in comparison_service.CYCLE_PARAMETERS:
        raise HTTPException(status_code=400, detail=f"Paramètre inconnu. Attendu : {comparison_service.CYCLE_PARAMETERS}")
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return comparison_service.histogram_by_stage(df, parameter, bins=bins)


@router.get("/{study_id}/analysis/heatmap", summary="Heatmap de corrélation entre les 8 paramètres du cycle")
def study_heatmap(study_id: int, cycle_ids: Optional[str] = Query(default=None), method: str = Query(default="pearson", pattern="^(pearson|spearman)$")):
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return comparison_service.parameter_correlation_heatmap(df, method=method)


@router.get(
    "/{study_id}/analysis/parameter-summary",
    summary="Carte complète d'un paramètre : boxplot + moyennes ± σ + ANOVA/Tukey + % élimination",
)
def study_parameter_summary(study_id: int, parameter: str, cycle_ids: Optional[str] = Query(default=None)):
    if parameter not in comparison_service.CYCLE_PARAMETERS:
        raise HTTPException(status_code=400, detail=f"Paramètre inconnu. Attendu : {comparison_service.CYCLE_PARAMETERS}")
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return comparison_service.parameter_summary(df, parameter)


@router.get(
    "/{study_id}/analysis/progression",
    summary="Progression cycle par cycle (boxplots) d'un paramètre",
)
def study_progression(study_id: int, parameter: str, cycle_ids: Optional[str] = Query(default=None)):
    if parameter not in comparison_service.CYCLE_PARAMETERS:
        raise HTTPException(status_code=400, detail=f"Paramètre inconnu. Attendu : {comparison_service.CYCLE_PARAMETERS}")
    ids = [int(x) for x in cycle_ids.split(",")] if cycle_ids else None
    try:
        cycles = _load_cycles_full(study_id, ids)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    df = comparison_service.cycles_to_long_dataframe(cycles)
    if df.empty:
        raise HTTPException(status_code=404, detail="Aucune donnée de cycle pour cette étude.")
    return comparison_service.progression_by_cycle(df, parameter)


# --------------------------------------------------------------------------
# Import Excel (proxy multipart) & Export CSV (proxy)
# --------------------------------------------------------------------------
@router.post("/{study_id}/cycles/import", summary="Importer des cycles depuis un fichier Excel")
async def import_cycles(study_id: int, file: UploadFile = File(...), skip_duplicates: bool = Query(default=True)):
    import httpx

    from app.config import settings

    file_bytes = await file.read()
    try:
        with httpx.Client(base_url=settings.STORAGE_API_BASE_URL, timeout=60.0) as client:
            resp = client.post(
                f"/api/study/{study_id}/cycles/import",
                params={"skip_duplicates": skip_duplicates},
                files={"file": (file.filename, file_bytes, file.content_type)},
            )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"API stockage injoignable : {exc}")


@router.get("/export/csv", summary="Export CSV des mesures brutes d'une étude")
def export_csv(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    plant_type: str = Query(...),
    set_number: int = Query(..., ge=1, le=2),
):
    try:
        content = storage_client.export_study_csv_raw(
            start_date.isoformat(), end_date.isoformat(), plant_type, set_number
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Erreur export : {exc}")

    filename = f"study_export_{plant_type}_set{set_number}.csv"
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
