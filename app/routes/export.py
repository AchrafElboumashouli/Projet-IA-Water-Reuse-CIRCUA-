"""
Routes : Tableau complet des données (module 9) — toutes les mesures
brutes entrées dans le système depuis le début, avec pagination pour
affichage et export CSV (tout l'historique ou une période précise).
"""

import io
from datetime import datetime
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app import storage_client
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/monitoring/data-table", tags=["Monitoring - Tableau de données"])


@router.get("", summary="Tableau paginé de toutes les données brutes")
def data_table(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
):
    """
    Pour un affichage tableau simple (sans filtre de date), on relaie
    directement la pagination native de l'API stockage (rapide). Dès
    qu'un filtre de date est fourni, on doit agréger côté monitoring
    (l'API stockage ne filtre pas par date) puis paginer nous-mêmes.
    """
    try:
        if start_date is None and end_date is None:
            page = storage_client.get_raw_data(set_number=set_number, skip=skip, limit=limit)
            return {"count": page.get("count", 0), "data": page.get("data", [])}

        rows = storage_client.fetch_raw_data_range(set_number=set_number, start_date=start_date, end_date=end_date)
        total = len(rows)
        page_rows = rows[skip: skip + limit]
        return {"count": total, "data": page_rows}
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/export", summary="Export CSV de tout l'historique ou d'une période précise")
def export_csv(
    set_number: Optional[int] = Query(default=None, ge=1, le=2),
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
):
    try:
        rows = storage_client.fetch_raw_data_range(set_number=set_number, start_date=start_date, end_date=end_date)
    except storage_client.StorageAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    df = pd.DataFrame(rows)
    buffer = io.StringIO()
    df.to_csv(buffer, index=False)
    buffer.seek(0)

    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M")
    filename = f"raw_sensor_data_export_{stamp}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
