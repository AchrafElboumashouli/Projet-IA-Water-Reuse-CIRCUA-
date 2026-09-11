"""
Poller temps réel : interroge périodiquement l'API stockage (jamais la
DB) pour détecter de nouvelles mesures / alertes, et les pousse aux
clients frontend connectés en WebSocket (`/ws/live`). Utilise un
backoff exponentiel si l'API stockage est injoignable, afin de ne pas
la marteler en cas de panne.
"""

import asyncio
import json
from typing import Optional

from fastapi import WebSocket

from app import storage_client
from app.config import settings
from app.utils.logger import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        logger.info("Client WebSocket connecté (%d actif(s))", len(self.active))

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        logger.info("Client WebSocket déconnecté (%d actif(s))", len(self.active))

    async def broadcast(self, message: dict):
        stale = []
        for ws in self.active:
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:  # noqa: BLE001
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)


manager = ConnectionManager()

_last_entry_ids: dict[int, Optional[int]] = {s: None for s in settings.KNOWN_SET_NUMBERS}


async def poll_loop():
    """Boucle de fond : vérifie les dernières mesures toutes les POLL_INTERVAL_SECONDS."""
    backoff = settings.POLL_INTERVAL_SECONDS

    while True:
        try:
            for set_number in settings.KNOWN_SET_NUMBERS:
                latest = await asyncio.to_thread(storage_client.get_latest_raw_data, set_number)
                if not latest:
                    continue
                entry = latest[0]
                entry_id = entry.get("entry_id")
                if _last_entry_ids.get(set_number) != entry_id:
                    _last_entry_ids[set_number] = entry_id
                    await manager.broadcast({"type": "new_measurement", "set_number": set_number, "data": entry})

            backoff = settings.POLL_INTERVAL_SECONDS  # reset après succès
        except storage_client.StorageAPIError as exc:
            logger.warning("Poller : API stockage injoignable, backoff %ss (%s)", backoff, exc)
            await manager.broadcast({"type": "storage_unreachable", "message": str(exc)})
            backoff = min(backoff * 2, 300)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Poller : erreur inattendue : %s", exc)

        await asyncio.sleep(backoff)
