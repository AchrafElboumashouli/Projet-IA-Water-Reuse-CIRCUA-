"""
Configuration centrale du service de monitoring.

IMPORTANT (contrainte d'architecture) :
Ce service NE SE CONNECTE JAMAIS DIRECTEMENT à PostgreSQL. Toute donnée
transite exclusivement par l'API REST de l'équipe stockage
(`backend_equipe_stockage`, voir STORAGE_API_BASE_URL). Voir
`app/storage_client.py`, seule couche d'accès aux données du service.
"""

from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Application ---
    APP_NAME: str = "Water Quality Monitoring - Service Monitoring"
    LOG_LEVEL: str = "INFO"
    PORT: int = 8001

    # --- API de l'équipe stockage (SEULE source de données) ---
    STORAGE_API_BASE_URL: str = "http://localhost:8000"
    STORAGE_API_TIMEOUT_SECONDS: float = 20.0

    # --- CORS (frontend Next.js) ---
    CORS_ORIGINS: list[str] = [
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]

    # --- Poller (rafraîchissement quasi temps-réel côté monitoring) ---
    POLL_INTERVAL_SECONDS: int = 15

    # --- Pagination interne lors de l'agrégation de raw-data sur une plage ---
    STORAGE_PAGE_SIZE: int = 1000
    STORAGE_MAX_PAGES: int = 100  # garde-fou : 100 x 1000 = 100 000 lignes max / requête

    # --- Sets de capteurs connus ---
    KNOWN_SET_NUMBERS: list[int] = [1, 2]

    # --- Détection d'anomalies ---
    ZSCORE_THRESHOLD: float = 3.0
    ISOLATION_FOREST_CONTAMINATION: float = 0.05
    AUTOENCODER_ERROR_PERCENTILE: float = 97.5
    ANOMALY_MIN_POINTS: int = 30  # nb minimal de points pour entraîner IsolationForest/Autoencoder

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
