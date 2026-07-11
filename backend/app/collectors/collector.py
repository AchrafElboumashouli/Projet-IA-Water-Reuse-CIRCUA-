"""
Collecteur de données ThingSpeak.

Responsabilités :
    - Interroger périodiquement l'API ThingSpeak pour les deux channels
      (SET 1 et SET 2)
    - Mapper les champs ThingSpeak (field1..field5) vers les colonnes
      du modèle `raw_sensor_data`
    - Nettoyer les données (types, valeurs manquantes)
    - Supprimer les doublons (basé sur entry_id + set_number)
    - Insérer les nouvelles données en base PostgreSQL

Ce module peut être exécuté :
    - directement par APScheduler (voir app/main.py)
    - manuellement : `python -m app.collectors.collector`
"""

from datetime import datetime
from typing import Optional

import pandas as pd
import requests
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.database.session import SessionLocal
from app.models.raw_sensor_data import RawSensorData
from app.utils.logger import get_logger

logger = get_logger(__name__)

# Mapping des champs ThingSpeak -> colonnes de la table raw_sensor_data
FIELD_MAPPING = {
    "field1": "ph",
    "field2": "temperature",
    "field3": "ec",
    "field4": "turbidity",
    "field5": "do",
}

NUMERIC_COLUMNS = ["ph", "temperature", "ec", "turbidity", "do"]


class ThingSpeakCollector:
    """Collecteur de données pour un channel ThingSpeak donné."""

    def __init__(self, set_number: int, channel_id: str, api_key: Optional[str] = None,
                 results: Optional[int] = None):
        self.set_number = set_number
        self.channel_id = channel_id
        self.api_key = api_key
        self.results = results or settings.THINGSPEAK_RESULTS_COUNT

    # ------------------------------------------------------------------
    # 1. Récupération des données brutes depuis ThingSpeak
    # ------------------------------------------------------------------
    def fetch_feeds(self) -> list[dict]:
        """Interroge l'API ThingSpeak et retourne la liste brute des 'feeds'."""
        url = f"{settings.THINGSPEAK_BASE_URL}/channels/{self.channel_id}/feeds.json"
        params = {"results": self.results}
        if self.api_key:
            params["api_key"] = self.api_key

        try:
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
        except requests.exceptions.RequestException as exc:
            logger.error("Erreur lors de l'appel à ThingSpeak (SET %s, channel %s) : %s",
                         self.set_number, self.channel_id, exc)
            return []

        try:
            payload = response.json()
        except ValueError as exc:
            logger.error("Réponse ThingSpeak invalide (non-JSON) pour SET %s : %s", self.set_number, exc)
            return []

        feeds = payload.get("feeds", [])
        logger.info("SET %s (channel %s) : %d entrées récupérées depuis ThingSpeak",
                    self.set_number, self.channel_id, len(feeds))
        return feeds

    # ------------------------------------------------------------------
    # 2. Nettoyage et transformation des données
    # ------------------------------------------------------------------
    def clean_feeds(self, feeds: list[dict]) -> pd.DataFrame:
        """
        Transforme la liste brute de 'feeds' ThingSpeak en DataFrame propre :
            - renommage des colonnes field1..field5 -> ph, temperature, ec, turbidity, do
            - conversion des types (numérique / datetime)
            - suppression des lignes sans entry_id ou created_at
            - suppression des doublons (entry_id)
        """
        if not feeds:
            return pd.DataFrame(
                columns=["created_at", "entry_id", "ph", "temperature", "ec", "turbidity", "do", "set_number"]
            )

        df = pd.DataFrame(feeds)

        # Renommage des champs ThingSpeak -> colonnes du modèle
        df = df.rename(columns=FIELD_MAPPING)

        # S'assurer que toutes les colonnes attendues existent (certaines peuvent être absentes)
        for col in NUMERIC_COLUMNS:
            if col not in df.columns:
                df[col] = None

        # Conversion des types numériques (les valeurs invalides deviennent NaN -> NULL)
        for col in NUMERIC_COLUMNS:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # Conversion de la date de création
        df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce", utc=True)

        # Conversion de entry_id en entier
        df["entry_id"] = pd.to_numeric(df["entry_id"], errors="coerce")

        # Suppression des lignes invalides (created_at ou entry_id manquants)
        df = df.dropna(subset=["created_at", "entry_id"])
        df["entry_id"] = df["entry_id"].astype(int)

        # Ajout du numéro de set
        df["set_number"] = self.set_number

        # Suppression des doublons sur entry_id (au sein du même batch)
        df = df.drop_duplicates(subset=["entry_id", "set_number"], keep="last")

        # On ne garde que les colonnes utiles
        df = df[["created_at", "entry_id", "ph", "temperature", "ec", "turbidity", "do", "set_number"]]

        return df

    # ------------------------------------------------------------------
    # 3. Stockage en base de données (avec gestion des doublons)
    # ------------------------------------------------------------------
    def store(self, df: pd.DataFrame, db: Session) -> int:
        """
        Insère le DataFrame dans la table `raw_sensor_data`.

        Utilise un "upsert" PostgreSQL (INSERT ... ON CONFLICT DO NOTHING)
        basé sur la contrainte d'unicité (entry_id, set_number), afin
        d'éviter d'insérer des doublons déjà présents en base.
        """
        if df.empty:
            logger.info("SET %s : aucune nouvelle donnée à insérer", self.set_number)
            return 0

        records = df.to_dict(orient="records")

        # Remplacement des NaN par None pour psycopg2 / SQLAlchemy
        for record in records:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = None

        stmt = pg_insert(RawSensorData).values(records)
        stmt = stmt.on_conflict_do_nothing(constraint="uq_raw_sensor_entry_set")

        result = db.execute(stmt)
        db.commit()

        inserted = result.rowcount or 0
        logger.info("SET %s : %d nouvelle(s) ligne(s) insérée(s) en base", self.set_number, inserted)
        return inserted

    # ------------------------------------------------------------------
    # 4. Pipeline complet : fetch -> clean -> store
    # ------------------------------------------------------------------
    def run(self, db: Session) -> int:
        feeds = self.fetch_feeds()
        df = self.clean_feeds(feeds)
        return self.store(df, db)


def collect_all() -> dict:
    """
    Exécute la collecte pour tous les channels configurés (SET 1 et SET 2).

    Retourne un résumé du nombre de lignes insérées par set.
    """
    summary = {}
    db = SessionLocal()
    try:
        for set_number, conf in settings.channel_map.items():
            collector = ThingSpeakCollector(
                set_number=set_number,
                channel_id=conf["channel_id"],
                api_key=conf["api_key"],
            )
            try:
                inserted = collector.run(db)
                summary[f"set_{set_number}"] = inserted
            except Exception as exc:  # noqa: BLE001
                logger.exception("Erreur inattendue lors de la collecte du SET %s : %s", set_number, exc)
                db.rollback()
                summary[f"set_{set_number}"] = 0
    finally:
        db.close()

    logger.info("Résumé de la collecte (%s) : %s", datetime.utcnow().isoformat(), summary)
    return summary


if __name__ == "__main__":
    collect_all()
