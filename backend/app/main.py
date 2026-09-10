"""
Point d'entrée principal de l'application FastAPI.

- Initialise l'application FastAPI et les routes
- Démarre un scheduler APScheduler qui exécute périodiquement
  le collecteur ThingSpeak (app.collectors.collector.collect_all)
- Gère les exceptions globales et expose un endpoint de healthcheck
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.background import BackgroundScheduler

from app.collectors.collector import backfill_all, collect_all
from app.config import settings
from app.routes import alerts, cycle, raw_data, study
from app.utils.logger import get_logger
from app.utils.timezone import APP_TZ

logger = get_logger(__name__)

# Le scheduler journalise et calcule ses "next_run_time" dans le fuseau
# métier configuré (settings.TIMEZONE), pour que /api/scheduler affiche des
# heures directement lisibles par un opérateur. Cela n'affecte pas le
# fuseau des données stockées (toujours UTC, voir app/utils/timezone.py) :
# seul l'affichage/log du scheduler en dépend.
scheduler = BackgroundScheduler(timezone=APP_TZ)


def scheduled_collection_job():
    """Tâche exécutée périodiquement par APScheduler : collecte ThingSpeak."""
    logger.info("Démarrage de la collecte programmée des données ThingSpeak...")
    try:
        summary = collect_all()
        logger.info("Collecte programmée terminée : %s", summary)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la collecte programmée : %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Démarrage ---
    logger.info("Démarrage de l'application '%s'...", settings.APP_NAME)

    scheduler.add_job(
        scheduled_collection_job,
        trigger="interval",
        minutes=settings.COLLECTOR_INTERVAL_MINUTES,
        id="thingspeak_collector",
        replace_existing=True,
        max_instances=1,
        coalesce=True
    )

    # Backfill complet de l'historique ThingSpeak à CHAQUE démarrage du
    # backend (une seule fois), suivi d'une collecte immédiate — le tout
    # AVANT de démarrer le scheduler, pour garantir qu'aucune collecte
    # planifiée ne puisse se déclencher pendant que le backfill est
    # encore en cours.
    logger.info("Backfill initial de l'historique ThingSpeak au démarrage...")
    try:
        backfill_summary = backfill_all()
        logger.info("Backfill initial terminé : %s", backfill_summary)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors du backfill initial : %s", exc)

    # Puis une collecte régulière immédiate (résultats les plus récents,
    # THINGSPEAK_RESULTS_COUNT lignes), pour ne pas attendre le premier
    # déclenchement programmé du scheduler.
    try:
        collect_all()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erreur lors de la collecte initiale : %s", exc)

    # Le scheduler ne prend le relais qu'une fois le backfill et la
    # collecte initiale terminés.
    scheduler.start()
    logger.info(
        "Scheduler démarré : collecte ThingSpeak toutes les %s minute(s).",
        settings.COLLECTOR_INTERVAL_MINUTES,
    )

    yield

    # --- Arrêt ---
    logger.info("Arrêt de l'application...")
    scheduler.shutdown(wait=False)


app = FastAPI(
    title=settings.APP_NAME,
    description="API de monitoring de la qualité de l'eau : stockage et prétraitement "
                 "des données brutes de capteurs (pH, température, EC, turbidité, DO).",
    version="1.0.0",
    lifespan=lifespan,
)

# --------------------------------------------------------------------------
# CORS — nécessaire pour que le frontend Next.js (origine différente,
# ex. http://localhost:3000) puisse appeler l'API (http://localhost:8000).
# Sans ce middleware, le navigateur bloque toute requête préflight OPTIONS
# avec une erreur 405, et fetch() côté frontend échoue silencieusement
# ("Failed to fetch").
# --------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Gestion globale des erreurs
# --------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Erreur non gérée sur %s %s : %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Une erreur interne est survenue. Veuillez consulter les logs du serveur."},
    )

@app.get("/api/scheduler")
def scheduler_status():

    jobs = scheduler.get_jobs()

    return {
        "running": scheduler.running,
        "jobs": [
            {
                "id": job.id,
                "next_run_time": str(job.next_run_time)
            }
            for job in jobs
        ]
    }
# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
app.include_router(raw_data.router)
app.include_router(study.router)
app.include_router(cycle.router)
app.include_router(alerts.router)


@app.get("/", tags=["Health"], summary="Healthcheck")
def root():
    """Endpoint de vérification de l'état de l'API."""
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": "1.0.0",
    }


@app.get("/api/sensor-sets", tags=["Health"], summary="Sets de capteurs configurés")
def list_sensor_sets():
    """
    Retourne la liste des sets de capteurs actuellement configurés
    (`settings.SENSOR_SETS`), pour que le frontend construise ses filtres
    et libellés dynamiquement plutôt que de coder en dur "Set 1" / "Set 2".
    """
    return {
        "sensor_sets": [
            {"set_number": s.set_number, "channel_id": s.channel_id}
            for s in settings.sensor_sets
        ]
    }


@app.post("/api/collect", tags=["Health"], summary="Déclencher manuellement une collecte ThingSpeak")
def trigger_manual_collection():
    """Déclenche immédiatement une collecte des données ThingSpeak (hors planification)."""
    summary = collect_all()
    return {"status": "ok", "summary": summary}
