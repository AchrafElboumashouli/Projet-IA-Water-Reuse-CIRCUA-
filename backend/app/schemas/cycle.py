"""
Schémas Pydantic pour le système de cycles de laboratoire
(`cycles` / `cycle_plants` / `cycle_results`), utilisables par une ou
plusieurs études à la fois via la table d'association `study_cycles`
(many-to-many — voir app/models/study_cycle.py).

La liste canonique des paramètres et des rôles d'étape vit ici, afin que
le backend valide que le client a bien envoyé exactement les lignes
attendues (8 paramètres x 3 rôles = 24 lignes), indépendamment du
frontend.

Chaque paramètre a un NOM (affiché dans les tableaux) et une UNITÉ
(affichée une seule fois, dans l'en-tête de colonne) — voir PARAMETERS
et PARAMETER_UNITS.

Chaque ligne persiste un rôle d'étape stable ("stage_1" / "stage_2" /
"stage_3" — voir STAGE_ROLES), utilisé comme identifiant interne pour
le calcul de Removal %. Le libellé d'étape RÉEL affiché au client
("Wastewater" / "Planted Series" / "Control Series" — voir
STAGE_LABELS) est persisté directement sur la ligne (CycleResultOut.stage)
: ce n'est jamais un nom de plante, et ce n'est jamais remplacé par un
libellé générique type "Stage 1 (raw)".

Les noms de plante (`plant_1` / `plant_2` / `plant_3`) sont un concept
ENTIÈREMENT SÉPARÉ des résultats expérimentaux : ce sont les plantes
utilisées pour un cycle donné, gérées une seule fois par cycle et
stockées dans leur propre table `cycle_plants` (voir
app/models/cycle_plants.py), reliée au cycle via `cycle_id` — jamais
dupliquées sur les lignes de `cycle_results`, et jamais présentes dans
le fichier Excel comme donnée liée à un résultat. `stage_1` reste le
rôle de référence (l'échantillon brut/non traité) utilisé comme base de
calcul du Removal % pour `stage_2` et `stage_3` — voir
app/services/calculations.py::compute_removal.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

# Nom court du paramètre, sans unité (affiché dans les tableaux/graphiques).
PARAMETERS: List[str] = [
    "COD",
    "BOD",
    "TSS",
    "pH",
    "Temperature",
    "EC",
    "Turbidity",
    "DO",
]

# Unité de chaque paramètre, affichée une seule fois (en-tête de colonne),
# jamais répétée dans le nom du paramètre lui-même. Chaîne vide pour les
# paramètres sans unité (pH).
PARAMETER_UNITS: dict[str, str] = {
    "COD": "mg/L",
    "BOD": "mg/L",
    "TSS": "mg/L",
    "pH": "",
    "Temperature": "°C",
    "EC": "µS/cm",
    "Turbidity": "NTU",
    "DO": "mg/L",
}

# Rôles d'étape stables (identifiants internes). `stage_1` est toujours
# le rôle de référence ("brut"/non traité) utilisé comme base du calcul
# de Removal % pour stage_2 et stage_3.
STAGE_ROLES: List[str] = ["stage_1", "stage_2", "stage_3"]

# Libellé d'étape RÉEL pour chaque rôle stable — la valeur affichée dans
# la colonne "Stage" du tableau (CycleResultOut.stage). Ce n'est PAS un
# nom de plante et ce n'est jamais un libellé générique type "Stage 1
# (raw)".
STAGE_LABELS: dict[str, str] = {
    "stage_1": "Wastewater",
    "stage_2": "Planted Series",
    "stage_3": "Control Series",
}

# Alias conservé pour compatibilité avec du code appelant l'ancien nom.
DEFAULT_STAGE_LABELS = STAGE_LABELS

# Rôle utilisé comme base ("brut"/non traité) pour le calcul du Removal %.
BASELINE_STAGE_ROLE: str = "stage_1"


# ---------------------------------------------------------------------------
# Cycle plants (separate concept from cycle_results)
# ---------------------------------------------------------------------------
class CyclePlantsIn(BaseModel):
    """Plant names for a cycle, entered/managed once per cycle.

    Never part of `CycleRowIn`/`cycle_results`: these values are
    persisted in the standalone `cycle_plants` table (see
    app/models/cycle_plants.py), linked to the cycle via `cycle_id`.
    """

    plant_1: str = Field("", max_length=100)
    plant_2: str = Field("", max_length=100)
    plant_3: str = Field("", max_length=100)


class CyclePlantsOut(BaseModel):
    id: int
    cycle_id: int
    plant_1: str = ""
    plant_2: str = ""
    plant_3: str = ""

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Cycles
# ---------------------------------------------------------------------------
class CycleRowIn(BaseModel):
    """One editable row coming from the client: only the raw replicates.

    `stage` here is the STABLE ROLE ("stage_1"/"stage_2"/"stage_3"). It
    is persisted as-is in `cycle_results.stage_role` — no plant name is
    ever resolved or stored on this row (see cycle_service.py). Plant
    names never travel on this row: they belong to `CyclePlantsIn`.
    """

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
        if v not in STAGE_ROLES:
            raise ValueError(f"Unknown stage '{v}'. Must be one of: {STAGE_ROLES}")
        return v


class CycleCreate(BaseModel):
    # The study this brand-new cycle is created under (this schema is
    # only used by POST /api/cycles). This creates BOTH the Cycle row
    # AND its first `study_cycles` association row — see
    # cycle_service.create_cycle_with_results. A cycle can later be
    # associated with additional studies too, via "Import Existing
    # Cycle" (see CycleImportIntoStudyResponse below) — the
    # Study<->Cycle relationship is many-to-many.
    study_id: int
    cycle_name: str = Field(..., min_length=1, max_length=255)
    start_date: datetime
    end_date: datetime
    # Plant names for THIS cycle only — stored in the separate
    # `cycle_plants` table (see app/models/cycle_plants.py), linked via
    # cycle_id. Independent per cycle: saving another cycle never
    # affects these. Optional: a cycle can be created/imported without
    # plant names and have them filled in later.
    plants: CyclePlantsIn = Field(default_factory=CyclePlantsIn)
    rows: List[CycleRowIn]

    @field_validator("rows")
    @classmethod
    def rows_must_cover_every_parameter_stage_pair(
        cls, rows: List[CycleRowIn]
    ) -> List[CycleRowIn]:
        expected = {(p, s) for p in PARAMETERS for s in STAGE_ROLES}
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
    def end_after_start(cls, v: datetime, info):
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("end_date must be on or after start_date")
        return v


class CycleResultOut(BaseModel):
    id: int
    parameter: str
    # Stable internal role ("stage_1"/"stage_2"/"stage_3"), used for the
    # Removal % baseline calculation.
    stage_role: str
    # Real stage label ("Wastewater"/"Planted Series"/"Control Series"),
    # read directly from the persisted `cycle_results.stage` column
    # (see app/models/cycle_result.py). This is what the "Stage" column
    # must display — never a generic "Stage 1 (raw)" placeholder, never
    # the internal stage_role, and never a plant name. No plant fields
    # exist on this row anymore: see CycleOut.plants.
    stage: str = ""
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

    @model_validator(mode="after")
    def resolve_stage_label(self) -> "CycleResultOut":
        # `stage` is normally read straight from the persisted column
        # (single source of truth, written once in build_cycle_results).
        # This only acts as a safety net for a row that somehow has no
        # `stage` value yet, falling back to deriving it from stage_role.
        if not self.stage:
            self.stage = STAGE_LABELS.get(self.stage_role, self.stage_role)
        return self


class StudyRefOut(BaseModel):
    """Minimal Study reference, used to list which Studies use a Cycle."""

    id: int
    study_name: str

    class Config:
        from_attributes = True


class CycleOut(BaseModel):
    id: int
    cycle_name: str
    start_date: datetime
    end_date: datetime
    created_at: datetime
    # Every Study currently associated with this cycle, via the
    # many-to-many `study_cycles` table (see app/models/study_cycle.py).
    # Can contain zero, one, or several studies at once — a cycle is
    # never deleted or duplicated when a study using it is deleted or
    # when it's imported into another study.
    studies: List[StudyRefOut] = []
    # Plant information for this cycle, read from the separate
    # `cycle_plants` table (cycle_plants.cycle_id -> cycles.id). `None`
    # if no plant names have been entered for this cycle yet.
    plants: Optional[CyclePlantsOut] = None
    results: List[CycleResultOut] = []

    class Config:
        from_attributes = True


class CycleSummaryOut(BaseModel):
    """Lightweight cycle representation for list views (no results)."""

    id: int
    cycle_name: str
    start_date: datetime
    end_date: datetime
    created_at: datetime
    studies: List[StudyRefOut] = []

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# "Import Existing Cycle" — reusing ANY cycle already in the database
# ---------------------------------------------------------------------------
class ImportableCycleOut(BaseModel):
    """One row of GET /api/cycles/available-for-import.

    Lists EVERY cycle in the database, with no filtering: cycles
    currently used by other studies, cycles no longer used by any study,
    and cycles never associated with a study are all shown side by side.
    `studies` lists every Study currently associated with this cycle (may
    be empty). The frontend is responsible for flagging cycles the
    current study is already associated with (via `study_ids`) so the
    user gets a clear "already used by this study" state instead of a
    failed import call.
    """

    id: int
    cycle_name: str
    studies: List[StudyRefOut] = []
    start_date: datetime
    end_date: datetime
    created_at: datetime
    plants: Optional[CyclePlantsOut] = None
    plant_count: int = 0

    class Config:
        from_attributes = True


class CycleImportIntoStudyResponse(BaseModel):
    """Response of POST /api/study/{study_id}/cycles/{cycle_id}/import."""

    cycle: CycleOut
    message: str
