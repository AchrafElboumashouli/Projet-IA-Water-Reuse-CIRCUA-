"""
Module Journal (section 6) : agrège pour le calendrier deux sources
d'événements par jour civil :

    1. Les alertes de captures nulles consécutives (déjà calculées côté
       équipe stockage, cf. sensor_alerts).
    2. Les anomalies détectées par le module 5 (Z-score, Isolation
       Forest, Autoencoder — cf. anomaly_service.detect_anomaly_events).

Règle de coloration du calendrier (appliquée côté frontend, mais fixée
et documentée ici pour que les deux restent cohérents) :
    - ROUGE  : au moins une alerte "critical" (captures nulles) OU une
               anomalie détectée par Isolation Forest / Autoencoder
               (méthodes multivariées, jugées plus fiables).
    - ORANGE : au moins une alerte "warning" (captures nulles) OU une
               anomalie Z-score seule (méthode univariée, plus
               sensible mais moins spécifique) sans alerte critique.
"""

from collections import defaultdict
from datetime import datetime


def _bucket() -> dict:
    return {
        "count": 0,
        "critical": 0,
        "warning": 0,
        "null_alert_count": 0,
        "anomaly_count": 0,
        "alerts": [],
        "anomalies": [],
    }


def build_calendar(alerts: list[dict], anomalies: list[dict] | None = None) -> dict:
    """
    Retourne { "YYYY-MM-DD": { count, critical, warning, null_alert_count,
    anomaly_count, alerts: [...], anomalies: [...] } }, en fusionnant les
    alertes de captures nulles (created_at) et les événements d'anomalie
    (created_at) sur le même jour civil.
    """
    by_day: dict[str, dict] = defaultdict(_bucket)

    for alert in alerts:
        created_at = alert.get("created_at")
        if not created_at:
            continue
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        day_key = dt.date().isoformat()

        bucket = by_day[day_key]
        bucket["count"] += 1
        bucket["null_alert_count"] += 1
        if alert.get("severity") == "critical":
            bucket["critical"] += 1
        elif alert.get("severity") == "warning":
            bucket["warning"] += 1
        bucket["alerts"].append(alert)

    for anomaly in anomalies or []:
        created_at = anomaly.get("created_at")
        if not created_at:
            continue
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        day_key = dt.date().isoformat()

        bucket = by_day[day_key]
        bucket["count"] += 1
        bucket["anomaly_count"] += 1
        if anomaly.get("severity") == "critical":
            bucket["critical"] += 1
        else:
            bucket["warning"] += 1
        bucket["anomalies"].append(anomaly)

    return dict(by_day)


def day_detail(alerts: list[dict], anomalies: list[dict] | None, day: str) -> dict:
    """
    Détail complet d'un jour civil (YYYY-MM-DD) : alertes de captures
    nulles ET anomalies détectées, chacune avec sa cause.
    """
    def _on_day(created_at: str | None) -> bool:
        if not created_at:
            return False
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        except ValueError:
            return False
        return dt.date().isoformat() == day

    return {
        "day": day,
        "alerts": [a for a in alerts if _on_day(a.get("created_at"))],
        "anomalies": [a for a in (anomalies or []) if _on_day(a.get("created_at"))],
    }
