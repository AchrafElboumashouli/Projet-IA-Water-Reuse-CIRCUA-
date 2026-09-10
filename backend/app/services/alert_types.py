"""
Catégories d'alerte partagées par tous les détecteurs
(app.services.alert_service) et par l'API (app.routes.alerts).

Ajouter un nouveau type d'alerte (ex. une vraie détection d'anomalie
plus tard) ne nécessite que d'ajouter une entrée ici et un détecteur
dédié dans alert_service.py — aucune autre partie du système ne doit
être modifiée pour "connaître" le nouveau type.
"""

from enum import Enum


class AlertType(str, Enum):
    NO_DATA = "no_data"
    CAPTURE_FAILURE = "capture_failure"
    ANOMALY = "anomaly"  # placeholder — voir alert_service.detect_anomalies


class SensorSetLabel(str, Enum):
    """Valeur stockée dans SensorAlert.sensor_set."""

    SET_1 = "1"
    SET_2 = "2"
    BOTH = "both"


# Paramètres numériques d'une capture (doit rester en phase avec
# app.collectors.collector.NUMERIC_COLUMNS).
CAPTURE_PARAMETERS = ["ph", "temperature", "ec", "turbidity", "do"]
