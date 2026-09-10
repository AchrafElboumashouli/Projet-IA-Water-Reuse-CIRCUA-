"""
Schémas Pydantic pour la réponse de l'import de cycles depuis Excel
(POST /api/study/{study_id}/cycles/import).
"""

from typing import List, Optional

from pydantic import BaseModel

from app.schemas.cycle import CycleSummaryOut


class RowError(BaseModel):
    """Erreur localisée à une ligne du fichier Excel (n'interrompt pas l'import)."""

    row: int
    error: str


class SkippedCycle(BaseModel):
    cycle_name: str
    reason: str


class CycleImportResult(BaseModel):
    total_rows: int
    cycles_created: List[CycleSummaryOut] = []
    cycles_skipped: List[SkippedCycle] = []
    row_errors: List[RowError] = []

    @property
    def has_errors(self) -> bool:
        return bool(self.row_errors or self.cycles_skipped)
