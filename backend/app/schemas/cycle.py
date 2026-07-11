"""
Schémas Pydantic pour le système de cycles de laboratoire
(`cycles` / `cycle_results`), rattachés à une étude (`study_id`).

La liste canonique des paramètres et étapes vit ici, afin que le backend
valide que le client a bien envoyé exactement les lignes attendues
(8 paramètres x 3 étapes = 24 lignes), indépendamment du frontend.
"""

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

PARAMETERS: List[str] = [
    "COD (mg/L)",
    "BOD (mg/L)",
    "TSS (mg/L)",
    "pH",
    "Temperature (°C)",
    "EC (µS/cm)",
    "Turbidity (NTU)",
    "DO (mg/L)",
]

STAGES: List[str] = ["Wastewater", "Planted Series", "Control Series"]


# ---------------------------------------------------------------------------
# Cycles
# ---------------------------------------------------------------------------
class CycleRowIn(BaseModel):
    """One editable row coming from the client: only the raw replicates."""

    parameter: str
    stage: str
    replicate_1: Optional[float] = None
    replicate_2: Optional[float] = None
    replicate_3: Optional[float] = None

    @field_validator("parameter")
    @classmethod
    def parameter_must_be_known(cls, v: str) -> str:
        if v not in PARAMETERS:
            raise ValueError(f"Unknown parameter '{v}'. Must be one of: {PARAMETERS}")
        return v

    @field_validator("stage")
    @classmethod
    def stage_must_be_known(cls, v: str) -> str:
        if v not in STAGES:
            raise ValueError(f"Unknown stage '{v}'. Must be one of: {STAGES}")
        return v


class CycleCreate(BaseModel):
    study_id: int
    cycle_name: str = Field(..., min_length=1, max_length=255)
    start_date: date
    end_date: date
    rows: List[CycleRowIn]

    @field_validator("rows")
    @classmethod
    def rows_must_cover_every_parameter_stage_pair(
        cls, rows: List[CycleRowIn]
    ) -> List[CycleRowIn]:
        expected = {(p, s) for p in PARAMETERS for s in STAGES}
        got = {(r.parameter, r.stage) for r in rows}
        missing = expected - got
        extra = got - expected
        if missing:
            raise ValueError(f"Missing rows for: {sorted(missing)}")
        if extra:
            raise ValueError(f"Unexpected rows for: {sorted(extra)}")
        return rows

    @field_validator("end_date")
    @classmethod
    def end_after_start(cls, v: date, info):
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must be on or after start_date")
        return v


class CycleResultOut(BaseModel):
    id: int
    parameter: str
    stage: str
    replicate_1: Optional[float] = None
    replicate_2: Optional[float] = None
    replicate_3: Optional[float] = None
    average: Optional[float] = None
    std: Optional[float] = None
    removal_1: Optional[float] = None
    removal_2: Optional[float] = None
    removal_3: Optional[float] = None
    removal_percent: Optional[float] = None
    removal_std: Optional[float] = None

    class Config:
        from_attributes = True


class CycleOut(BaseModel):
    id: int
    study_id: int
    cycle_name: str
    start_date: date
    end_date: date
    created_at: datetime
    results: List[CycleResultOut] = []

    class Config:
        from_attributes = True


class CycleSummaryOut(BaseModel):
    """Lightweight cycle representation for list views (no results)."""

    id: int
    study_id: int
    cycle_name: str
    start_date: date
    end_date: date
    created_at: datetime

    class Config:
        from_attributes = True
