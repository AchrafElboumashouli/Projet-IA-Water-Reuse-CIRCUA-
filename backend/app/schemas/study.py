"""
Schémas Pydantic pour l'entité racine `studies`.
"""

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------------------
# Studies
# --------------------------------------------------------------------------
class StudyBase(BaseModel):
    study_name: str = Field(..., max_length=255)
    plant_type: str = Field(..., max_length=100)
    start_date: date
    end_date: Optional[date] = None


class StudyCreate(StudyBase):
    pass


class StudyOut(StudyBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# Assignment of existing raw_sensor_data rows to a study
# (replaces the old "populate study_results" workflow: rows are now
#  linked in place via study_id instead of being copied to another table)
# --------------------------------------------------------------------------
class StudyAssignResponse(BaseModel):
    study_id: int
    assigned_rows: int
    message: str


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------
class StudyExportParams(BaseModel):
    start_date: date
    end_date: date
    plant_type: str
    set_number: int
