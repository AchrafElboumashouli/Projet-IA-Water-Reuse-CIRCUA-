"""
Schémas Pydantic pour les alertes (`sensor_alerts`) et leur
configuration (`alert_config`).

Trois catégories d'alerte (voir app.services.alert_types.AlertType) :
"no_data", "capture_failure", "anomaly" (placeholder). `sensor_set` vaut
le numéro d'un set configuré (voir GET /api/sensor-sets, ex. "1", "2",
"3"...), le sentinel spécial "both" (utilisé par
detect_capture_failure() quand TOUS les sets configurés échouent
simultanément — voir app/services/alert_service.py), ou None si non
applicable. `sensor_set` est un `str` simple plutôt qu'un `Literal`
figé : le nombre de sets est configurable via `settings.SENSOR_SETS`
(voir GET /api/sensor-sets), donc une liste fermée de valeurs
autorisées ici redeviendrait fausse dès qu'un set est ajouté ou retiré.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

AlertTypeLiteral = Literal["no_data", "capture_failure", "anomaly"]
# Volontairement un str libre, pas un Literal : voir docstring ci-dessus.
SensorSetLiteral = str


class SensorAlertOut(BaseModel):
    id: int
    alert_type: AlertTypeLiteral
    sensor_set: Optional[SensorSetLiteral] = None
    study_id: Optional[int] = None
    consecutive_count: int
    severity: str
    status: str
    message: str
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AlertConfigOut(BaseModel):
    null_capture_threshold: int


class AlertConfigUpdate(BaseModel):
    null_capture_threshold: int = Field(..., ge=1, le=1000)
