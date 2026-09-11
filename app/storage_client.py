"""
storage_client.py — SEULE couche d'accès aux données du service monitoring.

Règle d'architecture non négociable : le service monitoring n'ouvre
JAMAIS de connexion PostgreSQL. Toutes les données (données brutes,
études, cycles, alertes) transitent par l'API REST de l'équipe stockage
(`backend_equipe_stockage`, cf. STORAGE_API_BASE_URL). Si un module a
besoin d'une nouvelle donnée, il doit passer par une fonction de ce
fichier — jamais par un accès DB direct.
"""

from datetime import datetime
from typing import Any, Optional

import httpx

from app.config import settings
from app.utils.logger import get_logger

logger = get_logger(__name__)


class StorageAPIError(Exception):
    """Erreur générique lors d'un appel à l'API de l'équipe stockage."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


def _client() -> httpx.Client:
    return httpx.Client(base_url=settings.STORAGE_API_BASE_URL, timeout=settings.STORAGE_API_TIMEOUT_SECONDS)


def _get(path: str, params: Optional[dict] = None) -> Any:
    try:
        with _client() as client:
            resp = client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("Storage API %s -> %s : %s", path, exc.response.status_code, exc.response.text)
        raise StorageAPIError(f"Erreur API stockage sur {path} : {exc.response.status_code}", exc.response.status_code) from exc
    except httpx.RequestError as exc:
        logger.error("Storage API injoignable sur %s : %s", path, exc)
        raise StorageAPIError(f"API de l'équipe stockage injoignable ({settings.STORAGE_API_BASE_URL}) : {exc}") from exc


def _post(path: str, json: Optional[dict] = None, params: Optional[dict] = None) -> Any:
    try:
        with _client() as client:
            resp = client.post(path, json=json, params=params)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        logger.error("Storage API %s -> %s : %s", path, exc.response.status_code, exc.response.text)
        raise StorageAPIError(f"Erreur API stockage sur {path} : {exc.response.status_code}", exc.response.status_code) from exc
    except httpx.RequestError as exc:
        logger.error("Storage API injoignable sur %s : %s", path, exc)
        raise StorageAPIError(f"API de l'équipe stockage injoignable ({settings.STORAGE_API_BASE_URL}) : {exc}") from exc


def _put(path: str, json: Optional[dict] = None) -> Any:
    try:
        with _client() as client:
            resp = client.put(path, json=json)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise StorageAPIError(f"Erreur API stockage sur {path} : {exc.response.status_code}", exc.response.status_code) from exc
    except httpx.RequestError as exc:
        raise StorageAPIError(f"API de l'équipe stockage injoignable : {exc}") from exc


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------
def healthcheck() -> dict:
    return _get("/")


def scheduler_status() -> dict:
    return _get("/api/scheduler")


def trigger_manual_collection() -> dict:
    return _post("/api/collect")


# --------------------------------------------------------------------------
# Raw sensor data
# --------------------------------------------------------------------------
def get_raw_data(set_number: Optional[int] = None, skip: int = 0, limit: int = 100) -> dict:
    params = {"skip": skip, "limit": limit}
    if set_number is not None:
        params["set_number"] = set_number
    return _get("/api/raw-data", params=params)


def get_latest_raw_data(set_number: Optional[int] = None) -> list[dict]:
    params = {}
    if set_number is not None:
        params["set_number"] = set_number
    return _get("/api/raw-data/latest", params=params)


def get_raw_data_by_set(set_number: int, skip: int = 0, limit: int = 100) -> dict:
    return _get(f"/api/raw-data/set/{set_number}", params={"skip": skip, "limit": limit})


def fetch_raw_data_range(
    set_number: Optional[int],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    hard_cap: Optional[int] = None,
) -> list[dict]:
    """
    Agrège plusieurs pages de `/api/raw-data` (triées par created_at DESC)
    pour reconstituer une plage [start_date, end_date]. L'API stockage ne
    supporte pas le filtrage par date nativement, donc on pagine côté
    monitoring jusqu'à dépasser `start_date` (ou jusqu'au garde-fou
    STORAGE_MAX_PAGES) puis on filtre/tronque côté client.
    """
    page_size = settings.STORAGE_PAGE_SIZE
    max_pages = settings.STORAGE_MAX_PAGES
    collected: list[dict] = []
    skip = 0

    for _ in range(max_pages):
        page = get_raw_data(set_number=set_number, skip=skip, limit=page_size)
        rows = page.get("data", [])
        if not rows:
            break
        collected.extend(rows)
        skip += page_size

        oldest_in_page = rows[-1].get("created_at")
        if start_date is not None and oldest_in_page is not None:
            try:
                oldest_dt = datetime.fromisoformat(oldest_in_page.replace("Z", "+00:00"))
                if oldest_dt.tzinfo and start_date.tzinfo is None:
                    oldest_dt = oldest_dt.replace(tzinfo=None)
                if oldest_dt < start_date:
                    break
            except (ValueError, TypeError):
                pass
        if len(rows) < page_size:
            break
        if hard_cap and len(collected) >= hard_cap:
            break

    def _within_range(row: dict) -> bool:
        ts = row.get("created_at")
        if ts is None:
            return False
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, TypeError):
            return False
        if start_date is not None and dt < start_date.replace(tzinfo=None):
            return False
        if end_date is not None and dt > end_date.replace(tzinfo=None):
            return False
        return True

    if start_date is not None or end_date is not None:
        collected = [r for r in collected if _within_range(r)]

    if hard_cap:
        collected = collected[:hard_cap]

    return collected


# --------------------------------------------------------------------------
# Studies
# --------------------------------------------------------------------------
def create_study(payload: dict) -> dict:
    return _post("/api/study", json=payload)


def list_studies(skip: int = 0, limit: int = 100) -> list[dict]:
    return _get("/api/study", params={"skip": skip, "limit": limit})


def get_study(study_id: int) -> dict:
    return _get(f"/api/study/{study_id}")


def assign_study(study_id: int, set_number: int) -> dict:
    return _post(f"/api/study/{study_id}/assign", params={"set_number": set_number})


def list_study_cycles(study_id: int) -> list[dict]:
    return _get(f"/api/study/{study_id}/cycles")


def export_study_csv_raw(start_date: str, end_date: str, plant_type: str, set_number: int) -> bytes:
    with _client() as client:
        resp = client.get(
            "/api/study/export",
            params={
                "start_date": start_date,
                "end_date": end_date,
                "plant_type": plant_type,
                "set_number": set_number,
            },
        )
    resp.raise_for_status()
    return resp.content


# --------------------------------------------------------------------------
# Cycles
# --------------------------------------------------------------------------
def get_cycle_meta() -> dict:
    return _get("/api/meta")


def create_cycle(payload: dict) -> dict:
    return _post("/api/cycles", json=payload)


def get_cycle(cycle_id: int) -> dict:
    return _get(f"/api/cycles/{cycle_id}")


# --------------------------------------------------------------------------
# Alerts (captures nulles consécutives — déjà implémenté côté stockage)
# --------------------------------------------------------------------------
# ⚠️ L'API stockage plafonne `limit` à 1000 (voir app/routes/alerts.py côté
# backend_equipe_stockage : `limit: int = Query(default=200, ge=1, le=1000)`).
# Lui envoyer une valeur supérieure renvoie une erreur 422 (Unprocessable
# Entity). `list_alerts()` pagine donc automatiquement par blocs de 1000
# dès que le `limit` demandé dépasse ce plafond, au lieu de transmettre
# une valeur invalide.
STORAGE_ALERTS_MAX_LIMIT = 1000


def list_alerts(
    study_id: Optional[int] = None,
    set_number: Optional[int] = None,
    parameter: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
) -> list[dict]:
    def _page(page_skip: int, page_limit: int) -> list[dict]:
        params = {"skip": page_skip, "limit": page_limit}
        for key, value in (
            ("study_id", study_id),
            ("set_number", set_number),
            ("parameter", parameter),
            ("severity", severity),
            ("status", status),
            ("date_from", date_from),
            ("date_to", date_to),
        ):
            if value is not None:
                params[key] = value
        return _get("/api/alerts", params=params)

    if limit <= STORAGE_ALERTS_MAX_LIMIT:
        return _page(skip, limit)

    # Pagination : on demande des blocs de STORAGE_ALERTS_MAX_LIMIT jusqu'à
    # avoir récupéré `limit` alertes ou jusqu'à épuisement des résultats.
    collected: list[dict] = []
    page_skip = skip
    while len(collected) < limit:
        page_limit = min(STORAGE_ALERTS_MAX_LIMIT, limit - len(collected))
        page = _page(page_skip, page_limit)
        if not page:
            break
        collected.extend(page)
        page_skip += page_limit
        if len(page) < page_limit:
            break  # dernière page atteinte côté stockage
    return collected


def get_alert_config() -> dict:
    return _get("/api/alerts/config")


def set_alert_config(threshold: int) -> dict:
    return _put("/api/alerts/config", json={"null_capture_threshold": threshold})
