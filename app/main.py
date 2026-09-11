"""
Point d'entrée du service MONITORING (Tâche 2 — Aya).

Ce service ne fait AUCUN accès direct à PostgreSQL : toute donnée
transite par l'API REST de l'équipe stockage (`backend_equipe_stockage`,
port 8000 par défaut). Voir `app/storage_client.py`.

Lancement : uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import storage_client
from app.config import settings
from app.json_safety import SafeJSONResponse
from app.poller import manager, poll_loop
from app.routes import alerts, analytics, anomalies, export, raw_data, studies
from app.utils.logger import get_logger

logger = get_logger(__name__)

_poller_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _poller_task
    logger.info("Démarrage du service monitoring (%s)...", settings.APP_NAME)
    _poller_task = asyncio.create_task(poll_loop())
    yield
    logger.info("Arrêt du service monitoring...")
    if _poller_task:
        _poller_task.cancel()


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Service de monitoring intelligent de la qualité des eaux usées — "
        "consomme exclusivement l'API de l'équipe stockage, aucun accès DB direct."
    ),
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=SafeJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Erreur non gérée sur %s %s : %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "Erreur interne du service monitoring."})


app.include_router(raw_data.router)
app.include_router(analytics.router)
app.include_router(anomalies.router)
app.include_router(alerts.router)
app.include_router(studies.router)
app.include_router(export.router)


@app.get("/", tags=["Health"], summary="Healthcheck du service monitoring")
def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": "1.0.0"}


@app.get("/health/storage", tags=["Health"], summary="Vérifie la disponibilité de l'API stockage")
def health_storage():
    try:
        return {"storage_api": "reachable", "detail": storage_client.healthcheck()}
    except storage_client.StorageAPIError as exc:
        return JSONResponse(status_code=502, content={"storage_api": "unreachable", "detail": str(exc)})


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """Flux temps réel : pousse chaque nouvelle mesure détectée par le poller."""
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive / ping du client
    except WebSocketDisconnect:
        manager.disconnect(websocket)
