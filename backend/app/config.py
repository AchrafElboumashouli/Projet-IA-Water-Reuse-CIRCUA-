"""
Configuration centrale de l'application.

Toutes les variables sont chargées depuis le fichier `.env`
(voir `.env.example` pour la liste complète des variables disponibles).
"""

from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Application ---
    APP_NAME: str = "Water Quality Monitoring API"
    LOG_LEVEL: str = "INFO"

    # --- Base de données ---
    DATABASE_URL: str = "postgresql://postgres:?@localhost:5432/water_quality_db"

    # --- CORS ---
    # Origines autorisées à appeler l'API (frontend Next.js en dev + prod).
    # Peut être surchargé via .env : CORS_ORIGINS=["https://mondomaine.com"]
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # --- ThingSpeak ---
    THINGSPEAK_BASE_URL: str = "https://api.thingspeak.com"

    THINGSPEAK_CHANNEL_SET1_ID: str = "3111290"
    THINGSPEAK_READ_API_KEY_SET1: Optional[str] = None

    THINGSPEAK_CHANNEL_SET2_ID: str = "3243723"
    THINGSPEAK_READ_API_KEY_SET2: Optional[str] = None

    # --- Collector / Scheduler ---
    COLLECTOR_INTERVAL_MINUTES: int = 5
    THINGSPEAK_RESULTS_COUNT: int = 10

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def channel_map(self) -> dict:
        """Retourne la correspondance set_number -> (channel_id, read_api_key)."""
        return {
            1: {
                "channel_id": self.THINGSPEAK_CHANNEL_SET1_ID,
                "api_key": self.THINGSPEAK_READ_API_KEY_SET1,
            },
            2: {
                "channel_id": self.THINGSPEAK_CHANNEL_SET2_ID,
                "api_key": self.THINGSPEAK_READ_API_KEY_SET2,
            },
        }


settings = Settings()
