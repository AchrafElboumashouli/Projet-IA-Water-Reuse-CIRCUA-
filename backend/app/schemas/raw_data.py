"""
Schémas Pydantic pour les données brutes des capteurs (raw_sensor_data).
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RawSensorDataBase(BaseModel):
    created_at: datetime
    entry_id: int
    ph: Optional[float] = Field(default=None, description="pH de l'eau")
    temperature: Optional[float] = Field(default=None, description="Température (°C)")
    ec: Optional[float] = Field(default=None, description="Conductivité électrique (EC)")
    turbidity: Optional[float] = Field(default=None, description="Turbidité")
    do: Optional[float] = Field(default=None, description="Oxygène dissous (DO)")
    set_number: int = Field(description="Numéro du set de capteurs (1 ou 2)")


class RawSensorDataCreate(RawSensorDataBase):
    pass


class RawSensorDataOut(RawSensorDataBase):
    id: int
    study_id: Optional[int] = None
    inserted_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RawSensorDataListResponse(BaseModel):
    count: int
    data: list[RawSensorDataOut]
