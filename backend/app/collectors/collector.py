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
from app.services import alert_service
from app.utils.logger import get_logger
from app.utils.timezone import now_utc

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
    # 1bis. Récupération de TOUT l'historique (pagination par date)
    # ------------------------------------------------------------------
    def fetch_all_feeds(self, page_size: int = 8000, max_pages: int = 1000) -> list[dict]:
        """
        Récupère l'intégralité de l'historique disponible sur ThingSpeak
        pour ce channel, en paginant par date en remontant dans le temps
        (du plus récent vers le plus ancien).

        Pourquoi remonter dans le temps plutôt qu'avancer :
        l'API ThingSpeak a un comportement contre-intuitif dès qu'on
        combine `results` avec une bornes de date : lorsqu'une plage
        `start`/`end` contient plus d'entrées que `results`, ThingSpeak
        ne renvoie PAS les `results` premières entrées de la plage mais
        les `results` DERNIÈRES (les plus proches de `end`, ou de
        maintenant si `end` n'est pas fourni). C'est pour cela que
        l'ancienne implémentation, qui avançait `start` juste après la
        dernière entrée reçue, recevait en réalité presque toujours les
        mêmes entrées récentes (proches de "maintenant") : après 8000
        entrées, elle croyait avoir fini alors qu'il restait des
        dizaines de milliers d'entrées plus anciennes jamais demandées.

        Stratégie fiable : partir de `end` = maintenant (implicite, pas
        de paramètre) et redescendre. À chaque page reçue, on note le
        timestamp de l'entrée la plus ancienne du lot et on relance la
        requête avec `end` = ce timestamp (borne INCLUSE côté
        ThingSpeak). Les entrées à cheval sur la frontière peuvent donc
        réapparaître d'une page à l'autre, mais elles sont filtrées via
        `seen_entry_ids` (et de toute façon protégées par la contrainte
        d'unicité `entry_id + set_number` au moment du `store()`), donc
        aucun doublon n'est conservé.

        Conditions d'arrêt (aucune ne suppose que `last_entry_id`
        correspond au nombre réel d'enregistrements) :
            - page vide -> plus rien à récupérer, historique épuisé ;
            - page strictement plus petite que `page_size` -> la fenêtre
              [-inf, end] contient désormais moins d'entrées que la
              taille de page demandée, donc on a atteint le tout début
              de l'historique ;
            - aucune entrée nouvelle sur deux itérations consécutives
              (protection anti-boucle-infinie si `created_at` ne
              progresse plus, ce qui ne devrait jamais arriver en
              pratique) ;
            - `max_pages` itérations atteintes (garde-fou absolu).
        """
        url = f"{settings.THINGSPEAK_BASE_URL}/channels/{self.channel_id}/feeds.json"
        all_feeds: list[dict] = []
        seen_entry_ids: set[int] = set()

        end: Optional[str] = None  # None -> pas de borne, ThingSpeak part de "maintenant"
        previous_end: Optional[str] = None
        pages_fetched = 0

        while True:
            pages_fetched += 1
            if pages_fetched > max_pages:
                logger.error(
                    "SET %s (channel %s) : backfill interrompu après %d pages "
                    "(garde-fou max_pages atteint, historique probablement incomplet)",
                    self.set_number, self.channel_id, max_pages,
                )
                break

            params = {"results": page_size}
            if end is not None:
                params["end"] = end
            if self.api_key:
                params["api_key"] = self.api_key

            try:
                response = requests.get(url, params=params, timeout=30)
                response.raise_for_status()
            except requests.exceptions.RequestException as exc:
                logger.error(
                    "Erreur lors du backfill ThingSpeak (SET %s, channel %s) : %s",
                    self.set_number, self.channel_id, exc,
                )
                break

            try:
                payload = response.json()
            except ValueError as exc:
                logger.error(
                    "Réponse ThingSpeak invalide (non-JSON) pendant le backfill SET %s : %s",
                    self.set_number, exc,
                )
                break

            page = payload.get("feeds", [])
            if not page:
                logger.info(
                    "SET %s (channel %s) : page vide reçue, fin de l'historique atteinte",
                    self.set_number, self.channel_id,
                )
                break

            new_on_this_page = 0
            earliest_created_at = None
            for entry in page:
                entry_id = entry.get("entry_id")
                created_at = entry.get("created_at")
                if earliest_created_at is None or (created_at and created_at < earliest_created_at):
                    earliest_created_at = created_at
                if entry_id is not None and entry_id in seen_entry_ids:
                    continue
                if entry_id is not None:
                    seen_entry_ids.add(entry_id)
                all_feeds.append(entry)
                new_on_this_page += 1

            logger.info(
                "SET %s (channel %s) : backfill page %d reçue (%d entrées, %d nouvelles, total=%d, end=%s)",
                self.set_number, self.channel_id, pages_fetched, len(page), new_on_this_page,
                len(all_feeds), end,
            )

            page_is_short = len(page) < page_size

            if new_on_this_page == 0 and pages_fetched > 1:
                # Toute la page était déjà connue : on ne progresse plus,
                # on s'arrête pour éviter de boucler indéfiniment.
                logger.info(
                    "SET %s (channel %s) : aucune entrée nouvelle sur cette page, arrêt du backfill",
                    self.set_number, self.channel_id,
                )
                break

            if page_is_short:
                # Fenêtre [-inf, end] plus petite que page_size : on a
                # atteint le tout début de l'historique disponible.
                break

            if not earliest_created_at:
                # Pas de timestamp exploitable pour reculer -> on s'arrête
                # pour éviter une boucle infinie.
                logger.warning(
                    "SET %s (channel %s) : aucun timestamp exploitable pour continuer le backfill",
                    self.set_number, self.channel_id,
                )
                break

            new_end = earliest_created_at.replace("T", " ").replace("Z", "")
            if new_end == previous_end:
                # La fenêtre ne recule plus : garde-fou anti-boucle-infinie.
                logger.warning(
                    "SET %s (channel %s) : la fenêtre de dates ne progresse plus (end=%s), arrêt",
                    self.set_number, self.channel_id, new_end,
                )
                break

            previous_end = end
            end = new_end

        # Tri chronologique croissant par entry_id pour un stockage propre
        # (les pages ont été récupérées en remontant du plus récent au
        # plus ancien).
        all_feeds.sort(key=lambda e: (e.get("entry_id") is None, e.get("entry_id")))

        logger.info(
            "SET %s (channel %s) : backfill terminé, %d entrée(s) au total en %d page(s)",
            self.set_number, self.channel_id, len(all_feeds), pages_fetched,
        )
        return all_feeds

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
        inserted = self.store(df, db)

        # Détecteur "No Data Collected" : doit s'exécuter à chaque
        # tentative de collecte pour CE set, qu'il y ait eu 0 ou
        # plusieurs lignes insérées. Il ne regarde jamais la valeur des
        # paramètres — seulement si une nouvelle ligne a été insérée.
        try:
            alert_service.detect_no_data(db, self.set_number, inserted)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Erreur lors de la détection 'No Data Collected' (SET %s) : %s", self.set_number, exc
            )

        return inserted

    # ------------------------------------------------------------------
    # 5. Pipeline de backfill complet : fetch_all -> clean -> store
    # ------------------------------------------------------------------
    def run_backfill(self, db: Session) -> int:
        """Récupère et stocke tout l'historique disponible pour ce channel.

        Utilise le même nettoyage/insertion (dédoublonnage sur
        `entry_id` + `set_number`) que la collecte régulière : rejouer
        un backfill sur un channel déjà partiellement collecté n'insère
        jamais de doublons.
        """
        feeds = self.fetch_all_feeds()
        df = self.clean_feeds(feeds)
        return self.store(df, db)


def backfill_all() -> dict:
    """
    Récupère l'intégralité de l'historique disponible pour chaque
    channel configuré (SET 1, SET 2, ...), une seule fois au démarrage
    du backend (voir app/main.py::lifespan).

    Après ce backfill, la collecte régulière (`collect_all`, appelée par
    le scheduler toutes les `COLLECTOR_INTERVAL_MINUTES` minutes)
    continue de ne récupérer que les `THINGSPEAK_RESULTS_COUNT`
    dernières entrées, comme avant.
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
                inserted = collector.run_backfill(db)
                summary[f"set_{set_number}"] = inserted
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "Erreur inattendue lors du backfill du SET %s : %s", set_number, exc
                )
                db.rollback()
                summary[f"set_{set_number}"] = 0
    finally:
        db.close()

    logger.info("Résumé du backfill initial (%s) : %s", now_utc().isoformat(), summary)
    return summary


def collect_all() -> dict:
    """
    Exécute la collecte pour tous les channels configurés (SET 1 et SET 2).

    Retourne un résumé du nombre de lignes insérées par set.
    """
    summary = {}
    db = SessionLocal()
    try:
        set_numbers = list(settings.channel_map.keys())
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

        # Détecteur "Capture Failure" (+ futur "Anomaly Detection") :
        # exécuté une seule fois par cycle de collecte complet, une fois
        # que tous les sets configurés ont été traités, afin de pouvoir
        # distinguer un échec isolé ("Set 1"/"Set 2") d'un échec
        # simultané des deux sets ("Both Sets").
        try:
            alert_service.detect_capture_failure(db, set_numbers)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Erreur lors de la détection 'Capture Failure' : %s", exc)
    finally:
        db.close()

    logger.info("Résumé de la collecte (%s) : %s", now_utc().isoformat(), summary)
    return summary


if __name__ == "__main__":
    collect_all()
