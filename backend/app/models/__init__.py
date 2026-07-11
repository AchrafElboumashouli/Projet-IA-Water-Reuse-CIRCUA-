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

__all__ = ["Study", "RawSensorData", "Cycle", "CycleResult"]
