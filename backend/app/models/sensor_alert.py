"""
Modèles SQLAlchemy : `sensor_alerts`, `alert_config`, `collector_run_state`.

`sensor_alerts` conserve l'historique des alertes, tous types confondus
(voir `app.services.alert_types.AlertType`) :
    - "no_data"          : aucune nouvelle ligne reçue de ThingSpeak
                            pendant N tentatives de collecte consécutives.
    - "capture_failure"  : un (ou les deux) set(s) de capteurs a renvoyé
                            uniquement des zéros pendant N captures
                            consécutives.
    - "anomaly"          : réservé à la détection d'anomalies future
                            (placeholder, voir alert_service.detect_anomalies).

Une alerte reste "active" tant que la condition qui l'a déclenchée n'est
pas résolue ; elle passe alors à "resolved". `sensor_set` identifie le(s)
set(s) concerné(s) : "1", "2", "both", ou NULL si non applicable (ex. une
future anomalie qui ne serait pas rattachée à un set).

`alert_config` est une table à une seule ligne (id=1) qui persiste le
seuil configurable N (nombre d'événements consécutifs en échec avant
qu'une alerte ne devienne active), commun à tous les types d'alerte,
modifiable via l'API sans redémarrer le serveur ni éditer le .env.

`collector_run_state` garde, par set de capteurs, le compteur de
tentatives de collecte consécutives n'ayant inséré aucune nouvelle ligne
(nécessaire pour détecter "No Data Collected" : tant que le seuil N n'est
pas atteint, aucune alerte n'existe encore, donc ce compteur ne peut pas
vivre sur une ligne de `sensor_alerts`).
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database.session import Base
from app.utils.timezone import now_utc


class SensorAlert(Base):
    __tablename__ = "sensor_alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Catégorie d'alerte : "no_data" | "capture_failure" | "anomaly".
    # Voir app.services.alert_types.AlertType.
    alert_type = Column(String(30), nullable=False, index=True)

    # Set(s) de capteurs concerné(s) : "1", "2", "both", ou NULL si
    # l'alerte n'est pas rattachée à un set particulier (ex. anomalie
    # globale future). Stocké en texte pour pouvoir représenter "both"
    # sans détourner la colonne entière set_number historique.
    sensor_set = Column(String(10), nullable=True, index=True)

    # Etude à laquelle la donnée était rattachée au moment de la détection
    # (peut être NULL : les mesures ThingSpeak arrivent souvent avant
    # d'être assignées à une étude via /api/study/{id}/assign, ou
    # l'alerte n'est pas rattachable à une étude, ex. no_data).
    study_id = Column(
        Integer,
        ForeignKey("studies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    consecutive_count = Column(Integer, nullable=False)
    severity = Column(String(20), nullable=False, default="warning")  # warning | critical
    status = Column(String(20), nullable=False, default="active", index=True)  # active | resolved

    message = Column(String(500), nullable=False)

    created_at = Column(DateTime(timezone=True), default=now_utc, nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    study = relationship("Study")

    def __repr__(self) -> str:
        return (
            f"<SensorAlert id={self.id} type={self.alert_type} set={self.sensor_set} "
            f"count={self.consecutive_count} status={self.status}>"
        )


class AlertConfig(Base):
    """Singleton row (id=1) holding the runtime-configurable alert threshold.

    Shared by every detector (no_data, capture_failure, future anomaly):
    the same N = number of consecutive failed events required before an
    alert becomes active.
    """

    __tablename__ = "alert_config"

    id = Column(Integer, primary_key=True)
    null_capture_threshold = Column(Integer, nullable=False)


class CollectorRunState(Base):
    """Per-set running counter of consecutive collector runs that
    inserted zero new rows. Backs the "No Data Collected" detector,
    which must keep counting *before* any alert row exists (an alert
    only gets created once the threshold is reached).
    """

    __tablename__ = "collector_run_state"

    set_number = Column(Integer, primary_key=True, autoincrement=False)
    consecutive_empty_runs = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)

    def __repr__(self) -> str:
        return (
            f"<CollectorRunState set={self.set_number} "
            f"empty_runs={self.consecutive_empty_runs}>"
        )
