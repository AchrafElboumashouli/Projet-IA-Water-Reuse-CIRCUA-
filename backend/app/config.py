"""
Configuration centrale de l'application.

Toutes les variables sont chargées depuis le fichier `.env`
(voir `.env.example` pour la liste complète des variables disponibles).
"""

import json
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class SensorSetConfig:
    """One configured ThingSpeak channel (a 'sensor set')."""

    def __init__(self, set_number: int, channel_id: str, api_key: Optional[str] = None):
        self.set_number = set_number
        self.channel_id = channel_id
        self.api_key = api_key

    def __repr__(self) -> str:
        return f"SensorSetConfig(set_number={self.set_number}, channel_id={self.channel_id!r})"


class Settings(BaseSettings):
    # --- Application ---
    # No hardcoded value here: `.env` is the only source of truth for
    # these — if `.env` doesn't define them, startup fails fast with a
    # clear pydantic "Field required" error instead of silently falling
    # back to a value baked into the code (see `.env.example`).
    APP_NAME: str
    LOG_LEVEL: str

    # --- Fuseau horaire ---
    # Fuseau "métier" unique utilisé dans toute l'application (formulaires,
    # import Excel, logs, scheduler, affichage). Toutes les données restent
    # stockées en base en UTC (TIMESTAMP WITH TIME ZONE) ; c'est uniquement
    # la conversion affichage/saisie <-> UTC qui dépend de ce réglage.
    # Modifier cette seule valeur dans `.env` suffit à changer le fuseau
    # horaire de toute l'application, sans toucher au code. Doit être un
    # nom de zone IANA valide (ex. "Africa/Casablanca", "UTC", "Europe/Paris").
    TIMEZONE: str

    # --- Base de données ---
    DATABASE_URL: str

    # --- CORS ---
    # Origines autorisées à appeler l'API (frontend Next.js en dev + prod).
    # Défini en JSON dans `.env` : CORS_ORIGINS=["https://mondomaine.com"]
    CORS_ORIGINS: list[str]

    # --- ThingSpeak ---
    THINGSPEAK_BASE_URL: str

    # --- Sensor sets (capteurs) ---
    # Le nombre de sets de capteurs est entièrement configurable : chaque
    # entrée décrit un channel ThingSpeak (numéro de set, id de channel,
    # clé API optionnelle si le channel est privé). Fourni en JSON via
    # `.env` (voir `.env.example`). Ajouter/retirer un set ne nécessite
    # aucune modification de code, uniquement cette variable.
    SENSOR_SETS: str

    @field_validator("SENSOR_SETS")
    @classmethod
    def _validate_sensor_sets_json(cls, v: str) -> str:
        """Fails fast at startup if SENSOR_SETS isn't valid JSON, rather
        than surfacing a cryptic error later from `sensor_sets`."""
        try:
            parsed = json.loads(v)
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError(f"SENSOR_SETS must be valid JSON: {exc}") from exc
        if not isinstance(parsed, list) or not parsed:
            raise ValueError("SENSOR_SETS must be a non-empty JSON list of sensor set objects.")
        for entry in parsed:
            if "set_number" not in entry or "channel_id" not in entry:
                raise ValueError(
                    "Each SENSOR_SETS entry needs at least 'set_number' and 'channel_id'."
                )
        return v

    # --- Collector / Scheduler ---
    COLLECTOR_INTERVAL_MINUTES: int
    THINGSPEAK_RESULTS_COUNT: int

    # --- Alerts ---
    # Number of consecutive NULL captures (per sensor = set_number +
    # parameter) required before an alert is raised. Defined in `.env`
    # (NULL_CAPTURE_THRESHOLD=...) and, at runtime, overridable via the
    # persisted AlertConfig row (GET/PUT /api/alerts/config), which takes
    # precedence once it has been saved at least once.
    NULL_CAPTURE_THRESHOLD: int

    # --- Alert notifications: SMTP email ---
    # These stay genuinely optional (default None/"") rather than required:
    # a deployment with no email notifications configured is a valid,
    # intentional state, not a missing `.env` value — see
    # app/services/notification_service.py, which silently skips email if
    # SMTP_HOST, SMTP_FROM_EMAIL, or ALERT_EMAIL_RECIPIENTS is absent.
    # SMTP_USERNAME / SMTP_PASSWORD are only used if both are set (some
    # relays allow anonymous send). ALERT_EMAIL_RECIPIENTS is a
    # comma-separated list. SMTP_PORT/SMTP_USE_TLS keep the standard
    # SMTP-over-TLS defaults (587/true) since those are protocol
    # constants, not project-specific values.
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    SMTP_USE_TLS: bool = True
    ALERT_EMAIL_RECIPIENTS: str = ""

    # --- Alert notifications: Telegram ---
    # Both must be set for Telegram notifications to fire; otherwise they
    # are silently skipped. TELEGRAM_CHAT_ID can be a user, group, or
    # channel chat id (as returned by the Bot API).
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def alert_email_recipients(self) -> list[str]:
        """Parsed, trimmed list of email recipients from
        ALERT_EMAIL_RECIPIENTS (comma-separated in .env)."""
        return [addr.strip() for addr in self.ALERT_EMAIL_RECIPIENTS.split(",") if addr.strip()]

    @property
    def sensor_sets(self) -> list[SensorSetConfig]:
        """Parsed, ordered list of configured sensor sets."""
        parsed = json.loads(self.SENSOR_SETS)
        return [
            SensorSetConfig(
                set_number=entry["set_number"],
                channel_id=str(entry["channel_id"]),
                api_key=entry.get("api_key") or None,
            )
            for entry in parsed
        ]

    @property
    def channel_map(self) -> dict:
        """Retourne la correspondance set_number -> (channel_id, read_api_key)."""
        return {
            s.set_number: {"channel_id": s.channel_id, "api_key": s.api_key}
            for s in self.sensor_sets
        }

    @property
    def valid_set_numbers(self) -> list[int]:
        """Every configured set_number, for API validation (replaces the
        old hardcoded `ge=1, le=2` bounds on set_number query params)."""
        return [s.set_number for s in self.sensor_sets]


settings = Settings()
