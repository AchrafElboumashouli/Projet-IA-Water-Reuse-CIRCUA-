"""
Service métier : détection et cycle de vie des alertes.

Trois catégories d'alerte indépendantes (voir app.services.alert_types.AlertType) :

    - NO_DATA          : le collecteur n'a reçu/inséré aucune nouvelle
                          ligne depuis ThingSpeak pour un set donné,
                          pendant N tentatives de collecte consécutives.
                          N'inspecte jamais la valeur des paramètres.
    - CAPTURE_FAILURE   : une capture (ligne raw_sensor_data) est
                          considérée en échec pour un set si TOUTES ses
                          valeurs de paramètres (ph, temperature, ec,
                          turbidity, do) valent 0 — un 0 individuel est
                          une valeur légitime et ne déclenche rien.
                          L'alerte devient active après N captures en
                          échec consécutives pour ce set. Si les deux
                          sets échouent en même temps, une alerte unique
                          "both" est levée plutôt que deux alertes
                          séparées par set.
    - ANOMALY           : placeholder pour une future détection basée
                          sur des seuils de capteurs configurables.

Chaque détecteur maintient son propre compteur de "consécutif" et
utilise le même seuil configurable N (voir get_threshold/set_threshold).
Ce module ne mélange pas les détections dans une seule fonction : chaque
catégorie a sa propre fonction dédiée, appelée indépendamment par le
collecteur (voir app/collectors/collector.py).
"""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.raw_sensor_data import RawSensorData
from app.models.sensor_alert import AlertConfig, CollectorRunState, SensorAlert
from app.services import notification_service
from app.services.alert_types import CAPTURE_PARAMETERS, AlertType
from app.utils.logger import get_logger
from app.utils.timezone import now_utc

logger = get_logger(__name__)

# Nombre de captures récentes examinées pour compter la série de captures
# en échec.
LOOKBACK_LIMIT = 200


# --------------------------------------------------------------------------
# Seuil configurable (commun à tous les types d'alerte)
# --------------------------------------------------------------------------
def get_threshold(db: Session) -> int:
    """
    Retourne le seuil N d'événements consécutifs en échec requis avant
    qu'une alerte ne devienne active. Ce seuil est commun aux alertes
    "No Data Collected" et "Capture Failure" (et, plus tard, aux
    anomalies).

    Priorité : valeur persistée dans `alert_config` (modifiable via
    PUT /api/alerts/config) > valeur par défaut des settings
    (NULL_CAPTURE_THRESHOLD, .env).
    """
    from app.config import settings

    row = db.get(AlertConfig, 1)
    if row is not None:
        return row.null_capture_threshold
    return settings.NULL_CAPTURE_THRESHOLD


def set_threshold(db: Session, threshold: int) -> AlertConfig:
    row = db.get(AlertConfig, 1)
    if row is None:
        row = AlertConfig(id=1, null_capture_threshold=threshold)
        db.add(row)
    else:
        row.null_capture_threshold = threshold
    db.commit()
    db.refresh(row)
    logger.info("Seuil d'alerte (événements consécutifs en échec) mis à jour : %d", threshold)
    return row


# --------------------------------------------------------------------------
# Etat interne commun : trouver/résoudre l'alerte active d'un type+set
# --------------------------------------------------------------------------
def _get_active_alert(db: Session, alert_type: str, sensor_set: Optional[str]) -> Optional[SensorAlert]:
    return db.execute(
        select(SensorAlert).where(
            SensorAlert.alert_type == alert_type,
            SensorAlert.sensor_set == sensor_set,
            SensorAlert.status == "active",
        )
    ).scalars().first()


def _resolve_alert(db: Session, alert: SensorAlert, log_context: str) -> None:
    alert.status = "resolved"
    alert.resolved_at = now_utc()
    db.commit()
    logger.info("%s : alerte résolue.", log_context)


def _latest_study_id(db: Session, set_number: int) -> Optional[int]:
    """Best-effort study_id of the most recent capture, for context on the alert."""
    query = (
        select(RawSensorData.study_id)
        .where(RawSensorData.set_number == set_number)
        .order_by(RawSensorData.created_at.desc())
        .limit(1)
    )
    return db.execute(query).scalars().first()


def _upsert_active_alert(
    db: Session,
    *,
    alert_type: str,
    sensor_set: Optional[str],
    consecutive: int,
    threshold: int,
    study_id: Optional[int],
    message: str,
    log_label: str,
) -> SensorAlert:
    """
    Crée ou met à jour l'alerte active pour (alert_type, sensor_set),
    avec sévérité "warning" au seuil et "critical" au-delà. N'écrit (et
    ne journalise) que si le compteur a progressé, pour éviter de
    ré-écrire à chaque cycle de collecte tant que rien n'a changé.
    """
    active = _get_active_alert(db, alert_type, sensor_set)
    severity = "warning" if consecutive == threshold else "critical"
    log_tag = "WARNING" if severity == "warning" else "ALERT"

    if active is not None:
        if consecutive == active.consecutive_count and severity == active.severity:
            return active
        active.consecutive_count = consecutive
        active.severity = severity
        active.message = message
        active.study_id = study_id
        db.commit()
        db.refresh(active)
    else:
        active = SensorAlert(
            alert_type=alert_type,
            sensor_set=sensor_set,
            study_id=study_id,
            consecutive_count=consecutive,
            severity=severity,
            status="active",
            message=message,
        )
        db.add(active)
        db.commit()
        db.refresh(active)

        # Notify (email + Telegram) only on the transition into "active"
        # (this branch), never on a mere update of an already-active
        # alert's counters — see notification_service.notify_new_alert.
        # A notification failure must never break the collector run.
        try:
            notification_service.notify_new_alert(active)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Échec de l'envoi des notifications pour l'alerte id=%s : %s",
                active.id, exc,
            )

    logger.warning("[%s] %s", log_tag, message)
    return active


# --------------------------------------------------------------------------
# Détecteur 1 : No Data Collected
# --------------------------------------------------------------------------
def detect_no_data(db: Session, set_number: int, inserted_rows: int) -> Optional[SensorAlert]:
    """
    Détecte l'absence de nouvelle donnée reçue de ThingSpeak pour un set.

    `inserted_rows` est le nombre de lignes effectivement insérées par le
    collecteur lors de la tentative de collecte courante pour ce set
    (voir ThingSpeakCollector.store()). Ce détecteur ne regarde jamais la
    valeur des paramètres : seul le fait qu'une nouvelle ligne ait été
    insérée ou non compte.

    Le compteur de tentatives consécutives sans insertion est persisté
    dans `collector_run_state` (une alerte "active" ne peut pas porter ce
    compteur avant même d'exister).
    """
    threshold = get_threshold(db)
    sensor_set = str(set_number)

    state = db.get(CollectorRunState, set_number)
    if state is None:
        state = CollectorRunState(set_number=set_number, consecutive_empty_runs=0)
        db.add(state)

    if inserted_rows > 0:
        state.consecutive_empty_runs = 0
        db.commit()

        active = _get_active_alert(db, AlertType.NO_DATA.value, sensor_set)
        if active is not None:
            _resolve_alert(db, active, f"SET {set_number} (No Data Collected)")
        return None

    state.consecutive_empty_runs += 1
    consecutive = state.consecutive_empty_runs
    db.commit()

    if consecutive < threshold:
        return None

    message = (
        f"SET {set_number} : no new records received from ThingSpeak for "
        f"{consecutive} consecutive collection attempts."
    )
    study_id = _latest_study_id(db, set_number)
    return _upsert_active_alert(
        db,
        alert_type=AlertType.NO_DATA.value,
        sensor_set=sensor_set,
        consecutive=consecutive,
        threshold=threshold,
        study_id=study_id,
        message=message,
        log_label=f"SET {set_number} No Data Collected",
    )


# --------------------------------------------------------------------------
# Détecteur 2 : Capture Failure
# --------------------------------------------------------------------------
def _is_capture_all_zero(row: RawSensorData) -> bool:
    """A capture is a failure for its set only if EVERY parameter value
    equals 0. A row with some zeros and some non-zero/None values is
    still a valid collection — individual zero readings are legitimate
    and must never trigger an alert on their own."""
    values = [getattr(row, param) for param in CAPTURE_PARAMETERS]
    return all(v == 0 for v in values)


def _count_consecutive_capture_failures(db: Session, set_number: int) -> int:
    """
    Compte les captures en échec (toutes valeurs à 0) les plus récentes
    pour un set, en s'arrêtant à la première capture valide.
    """
    query = (
        select(RawSensorData)
        .where(RawSensorData.set_number == set_number)
        .order_by(RawSensorData.created_at.desc())
        .limit(LOOKBACK_LIMIT)
    )
    rows = db.execute(query).scalars().all()

    count = 0
    for row in rows:
        if _is_capture_all_zero(row):
            count += 1
        else:
            break
    return count


def detect_capture_failure(db: Session, set_numbers: list[int]) -> list[SensorAlert]:
    """
    Détecte les échecs de capture (toutes valeurs de paramètres à 0)
    pour chaque set configuré, puis lève :
        - une alerte combinée "all" si TOUS les sets configurés échouent
          simultanément (ex. "both" avec 2 sets, mais reste correct avec
          3+ sets si le système est étendu plus tard — voir
          app.config.settings.sensor_sets) ;
        - sinon, une alerte individuelle par set en échec (les sets
          valides voient leur éventuelle alerte active résolue).

    Important : l'alerte combinée ne se déclenche QUE si l'ensemble des
    sets configurés échoue en même temps, jamais pour "2 sets sur 3+".
    Un sous-ensemble de sets en échec reste signalé individuellement.
    """
    threshold = get_threshold(db)
    triggered: list[SensorAlert] = []

    # 1) Compteur consécutif par set, indépendant du seuil.
    counts: dict[int, int] = {
        set_number: _count_consecutive_capture_failures(db, set_number)
        for set_number in set_numbers
    }

    failing_sets = [s for s, c in counts.items() if c >= threshold]
    passing_sets = [s for s in set_numbers if s not in failing_sets]

    all_sets_failing = bool(set_numbers) and len(failing_sets) == len(set_numbers)

    # 2) Résoudre les alertes par-set et "all" qui ne s'appliquent plus.
    for set_number in passing_sets:
        active = _get_active_alert(db, AlertType.CAPTURE_FAILURE.value, str(set_number))
        if active is not None:
            _resolve_alert(db, active, f"SET {set_number} (Capture Failure)")

    if not all_sets_failing:
        combined_active = _get_active_alert(db, AlertType.CAPTURE_FAILURE.value, "both")
        if combined_active is not None:
            _resolve_alert(db, combined_active, "Capture Failure (All Sets)")

    if not failing_sets:
        return triggered

    # 3) Lever l'alerte adaptée : combinée uniquement si TOUS les sets
    #    configurés échouent ensemble, sinon une alerte individuelle par
    #    set en échec (un sous-ensemble reste signalé par set, jamais
    #    regroupé).
    if all_sets_failing:
        consecutive = min(counts[s] for s in failing_sets)
        sets_label = ", ".join(str(s) for s in sorted(failing_sets))
        message = (
            f"All sensor sets ({sets_label}) returned only zero values for "
            f"{consecutive} consecutive captures."
        )
        alert = _upsert_active_alert(
            db,
            alert_type=AlertType.CAPTURE_FAILURE.value,
            sensor_set="both",
            consecutive=consecutive,
            threshold=threshold,
            study_id=None,
            message=message,
            log_label="Capture Failure (All Sets)",
        )
        triggered.append(alert)

        # Un set individuel ne doit pas rester actif quand l'alerte
        # combinée est levée.
        for set_number in failing_sets:
            individual = _get_active_alert(db, AlertType.CAPTURE_FAILURE.value, str(set_number))
            if individual is not None:
                _resolve_alert(db, individual, f"SET {set_number} (superseded by All Sets)")
    else:
        for set_number in failing_sets:
            consecutive = counts[set_number]
            message = (
                f"SET {set_number} returned only zero values for "
                f"{consecutive} consecutive captures."
            )
            study_id = _latest_study_id(db, set_number)
            alert = _upsert_active_alert(
                db,
                alert_type=AlertType.CAPTURE_FAILURE.value,
                sensor_set=str(set_number),
                consecutive=consecutive,
                threshold=threshold,
                study_id=study_id,
                message=message,
                log_label=f"SET {set_number} Capture Failure",
            )
            triggered.append(alert)

    return triggered


# --------------------------------------------------------------------------
# Détecteur 3 : Anomaly Detection (placeholder)
# --------------------------------------------------------------------------
def detect_anomalies(db: Session, set_numbers: list[int]) -> list[SensorAlert]:
    """
    Placeholder pour la future détection d'anomalies basée sur des
    seuils de capteurs configurables (ex. pH hors plage, EC anormal...).

    Ne fait rien pour l'instant — conserve la même signature que les
    autres détecteurs pour pouvoir être branché de la même façon dans
    evaluate_capture_failure_for_all_sets() une fois implémenté.
    """
    return []


# --------------------------------------------------------------------------
# Listing / filtres (pour le dashboard)
# --------------------------------------------------------------------------
def list_alerts(
    db: Session,
    alert_type: Optional[str] = None,
    study_id: Optional[int] = None,
    sensor_set: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    date_from=None,
    date_to=None,
    skip: int = 0,
    limit: int = 200,
) -> list[SensorAlert]:
    query = select(SensorAlert)

    if alert_type is not None:
        query = query.where(SensorAlert.alert_type == alert_type)
    if study_id is not None:
        query = query.where(SensorAlert.study_id == study_id)
    if sensor_set is not None:
        query = query.where(SensorAlert.sensor_set == sensor_set)
    if severity is not None:
        query = query.where(SensorAlert.severity == severity)
    if status is not None:
        query = query.where(SensorAlert.status == status)
    if date_from is not None:
        query = query.where(SensorAlert.created_at >= date_from)
    if date_to is not None:
        query = query.where(SensorAlert.created_at <= date_to)

    query = query.order_by(SensorAlert.created_at.desc()).offset(skip).limit(limit)
    return list(db.execute(query).scalars().all())
