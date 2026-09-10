"""
Package des modèles SQLAlchemy.

Tous les modèles sont importés ici afin qu'Alembic puisse
détecter automatiquement les tables lors de la génération
des migrations (`Base.metadata`).
"""

from app.models.study import Study  # noqa: F401
from app.models.raw_sensor_data import RawSensorData  # noqa: F401
from app.models.cycle import Cycle  # noqa: F401
from app.models.cycle_result import CycleResult  # noqa: F401
from app.models.cycle_plants import CyclePlants  # noqa: F401
from app.models.study_cycle import StudyCycle  # noqa: F401
from app.models.sensor_alert import SensorAlert, AlertConfig, CollectorRunState  # noqa: F401

__all__ = [
    "Study",
    "RawSensorData",
    "Cycle",
    "CycleResult",
    "CyclePlants",
    "StudyCycle",
    "SensorAlert",
    "AlertConfig",
    "CollectorRunState",
]
