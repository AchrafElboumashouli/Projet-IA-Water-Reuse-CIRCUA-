"""
Service métier : import de cycles de laboratoire depuis UN SEUL fichier
Excel.

Format de fichier attendu (une ligne par réplicat, format "long") :

    Cycle Name | Start Date       | End Date          | Parameter | Stage | Replicate | Value | Plant 1 | Plant 2 | Plant 3
    Cycle A    | 05/06/2026 18:33 | 11/06/2026 19:55  | pH        | 1     | 1         | 7.2   | Tomato  | Lettuce | Mint
    Cycle A    | 05/06/2026 18:33 | 11/06/2026 19:55  | pH        | 1     | 2         | 7.1   |         |         |
    Cycle A    | 05/06/2026 18:33 | 11/06/2026 19:55  | pH        | 2     | 1         | 6.8   |         |         |
    ...

- `Stage` identifies which of the three stable stage roles the row
  belongs to: 1, 2, or 3 (see app/schemas/cycle.py::STAGE_ROLES). Stage
  1 is always the reference/untreated sample used to compute Removal %
  for stages 2 and 3.
- `Plant 1` / `Plant 2` / `Plant 3` are OPTIONAL columns. The Excel
  file itself carries NO relationship between plants and results: a
  plant name only needs to be present ONCE per cycle (e.g. on its first
  row) — the importer reads whichever non-blank value it first
  encounters for that cycle and writes it to the STANDALONE
  `cycle_plants` table (see app/models/cycle_plants.py), linked to the
  cycle via `cycle_id`. Plant values are NEVER duplicated onto, or read
  from, individual `cycle_results` rows: this table has no plant
  columns at all. If a file omits these columns entirely, cycles are
  simply created without plant names (fillable later at the cycle
  level).

Cycle-level columns (`Cycle Name`, `Start Date`, `End Date`, `Plant
1/2/3`) do NOT need to be repeated on every row. A blank cell in one of
these columns means "same cycle as the row(s) above", not "missing":
the importer carries the last non-blank value of each of these columns
forward until a row supplies a new one. A row that (re)supplies any of
`Cycle Name` / `Start Date` / `End Date` starts a new cycle stanza --
its plant carry-forward is reset first, so a new cycle never silently
inherits the previous cycle's plant names. This also means the OLD
format (metadata repeated on every row) keeps working unchanged, since
every row simply "updates" the carried-forward context to its own
values.

`Parameter` follows the SAME carry-forward rule, but reset at the
(cycle, stage) grouping level described below: a row that leaves
`Parameter` blank continues the previous non-blank `Parameter` seen for
the CURRENT cycle. This lets a file write each parameter once, at the
top of its group of 9 rows (3 stages x 3 replicates), instead of
repeating it on every replicate row -- see the module-level example
above. Starting a new cycle stanza also resets the parameter
carry-forward, so a new cycle never silently inherits the previous
cycle's last parameter when its own first row happens to leave
`Parameter` blank (which would be a malformed file in practice, since
every cycle's first data row should always state its own parameter).

Backward compatibility: files using the OLD text `Stage` labels
("Wastewater" / "Planted Series" / "Control Series") are still accepted
and mapped to stage roles 1/2/3 respectively -- see
_LEGACY_STAGE_LABEL_TO_ROLE below.

Dates support `DD/MM/YYYY HH:mm` (ex. 05/06/2026 18:33), native Excel
datetime cells, and ISO 8601.

All rows for the same (Cycle Name, Start Date, End Date) are grouped,
pivoted into the shape `CycleCreate` expects (replicate_1/2/3 per
parameter+stage, plus at most one plant name triple for the whole
cycle), then created via the SAME
`cycle_service.create_cycle_with_results()` function the manual form
uses — no business logic is duplicated, and the plant/result
separation is enforced by that same function (it writes plants to
`cycle_plants` and results to `cycle_results` in two distinct steps).

An invalid row (bad date, unknown parameter/stage, duplicate...) is
reported in `row_errors` without interrupting the rest of the import. A
cycle whose name already exists for this study is skipped (reported in
`cycles_skipped`) to avoid duplicate imports.
"""

import io
import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.cycle import Cycle
from app.models.study_cycle import StudyCycle
from app.schemas.cycle import PARAMETERS, STAGE_ROLES, CycleCreate, CyclePlantsIn, CycleRowIn
from app.schemas.cycle_import import CycleImportResult, RowError, SkippedCycle
from app.services import cycle_service
from app.utils.logger import get_logger
from app.utils.timezone import to_utc

logger = get_logger(__name__)

REQUIRED_COLUMNS = ["cycle_name", "start_date", "end_date", "parameter", "stage", "replicate", "value"]
# Plant 1/2/3 columns are OPTIONAL: a file with none of them is still
# valid (cycles are simply created with no plant names). When present,
# they carry a plant name for the WHOLE cycle, not for the individual
# row/replicate — see PLANT_COLUMNS and the grouping logic below.
PLANT_COLUMNS = ["plant_1", "plant_2", "plant_3"]

# Normalise "Cycle Name", " cycle  name ", "cycle_name" -> "cycle_name", etc.
_COLUMN_ALIASES = {
    "cyclename": "cycle_name",
    "cycle_name": "cycle_name",
    "startdate": "start_date",
    "start_date": "start_date",
    "enddate": "end_date",
    "end_date": "end_date",
    "parameter": "parameter",
    "stage": "stage",
    "plant1": "plant_1",
    "plantname1": "plant_1",
    "plant2": "plant_2",
    "plantname2": "plant_2",
    "plant3": "plant_3",
    "plantname3": "plant_3",
    "replicate": "replicate",
    "value": "value",
}

# Legacy stage labels (pre-plant-names format) -> stage role. Kept only
# for backward compatibility with files exported/authored before this
# change; new files should use numeric Stage values (1/2/3).
_LEGACY_STAGE_LABEL_TO_ROLE: Dict[str, str] = {
    "wastewater": "stage_1",
    "planted series": "stage_2",
    "control series": "stage_3",
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = {}
    for col in df.columns:
        key = str(col).strip().lower().replace(" ", "").replace("-", "").replace("_", "")
        renamed[col] = _COLUMN_ALIASES.get(key, key)
    return df.rename(columns=renamed)


def _parse_stage(raw_value) -> Optional[str]:
    """Resolves a `stage` cell to a stable stage role ("stage_1/2/3").

    Accepts the new numeric form (1, 2, 3, "1", "Stage 1", ...) as well
    as the legacy text labels ("Wastewater", "Planted Series", "Control
    Series") for backward compatibility with older files. Returns None
    if the value doesn't map to any known stage.
    """
    if _is_blank(raw_value):
        return None

    text = str(raw_value).strip().lower()

    # Legacy text label.
    if text in _LEGACY_STAGE_LABEL_TO_ROLE:
        return _LEGACY_STAGE_LABEL_TO_ROLE[text]

    # Numeric form: "1", "1.0", "Stage 1", etc. -- pull out the first digit.
    match = re.search(r"[123]", text)
    if match:
        return f"stage_{match.group(0)}"

    return None


def _parse_datetime(value) -> Optional[datetime]:
    """Parses a cell value into a UTC-aware datetime, supporting
    DD/MM/YYYY HH:mm, native Excel datetimes, and ISO 8601, in that order
    of likelihood.

    Excel cells (and the DD/MM/YYYY HH:mm text format) carry no timezone
    information: they represent a wall-clock time in the application's
    configured business timezone (`settings.TIMEZONE`), exactly as an
    operator would read it off a lab notebook. Such naive values are
    localized to that timezone and converted to UTC before being returned,
    so every datetime leaving this function is UTC-aware and safe to store
    directly. A value that already carries an offset (e.g. an ISO 8601
    string with 'Z' or '+01:00') is trusted and simply converted to UTC.
    """
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return to_utc(value)
    if isinstance(value, pd.Timestamp):
        return to_utc(value.to_pydatetime())

    text = str(value).strip()
    if not text:
        return None

    # DD/MM/YYYY HH:mm (with or without seconds), then dayfirst-general, then ISO.
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
        try:
            return to_utc(datetime.strptime(text, fmt))
        except ValueError:
            continue

    # ISO 8601 (e.g. "2026-06-05T18:33:00+02:00") is unambiguous
    # (YYYY-MM-DD): parsing it with dayfirst=True would silently swap
    # month/day whenever both are <= 12. Detect that shape specifically
    # (leading 4-digit year) and parse it dayfirst=False; anything else
    # (e.g. slash-separated dates) falls through to the dayfirst=True
    # general parse below, matching this importer's documented
    # DD/MM/YYYY convention.
    if re.match(r"^\d{4}-\d{1,2}-\d{1,2}", text):
        try:
            parsed = pd.to_datetime(text, dayfirst=False, errors="raise")
            return to_utc(parsed.to_pydatetime())
        except (ValueError, TypeError):
            pass

    try:
        parsed = pd.to_datetime(text, dayfirst=True, errors="raise")
        return to_utc(parsed.to_pydatetime())
    except (ValueError, TypeError):
        return None


def _is_blank(value) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    try:
        # Catches float NaN as well as pandas' NaT (used for blank cells
        # in datetime-typed columns, e.g. when openpyxl parses Start
        # Date/End Date as native Excel datetimes) -- pd.isna() handles
        # both, unlike a plain `isinstance(value, float)` check.
        if pd.isna(value):
            return True
    except (TypeError, ValueError):
        pass
    return False


def parse_excel(file_bytes: bytes) -> Tuple[pd.DataFrame, List[RowError]]:
    """Reads and validates the raw structure of the uploaded workbook."""
    errors: List[RowError] = []

    try:
        df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Fichier Excel illisible ou corrompu : {exc}") from exc

    df = _normalize_columns(df)

    missing_columns = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_columns:
        raise ValueError(
            f"Colonnes manquantes dans le fichier Excel : {', '.join(missing_columns)}. "
            f"Colonnes attendues : Cycle Name, Start Date, End Date, Parameter, Stage, "
            f"Replicate, Value (Plant 1 / Plant 2 / Plant 3 optionnelles)."
        )

    # Plant columns are optional: ensure they exist (empty) so downstream
    # row access via row.get(...) is uniform regardless of the file.
    for col in PLANT_COLUMNS:
        if col not in df.columns:
            df[col] = None

    return df, errors


def import_cycles_from_excel(
    db: Session,
    study_id: int,
    file_bytes: bytes,
    skip_duplicates: bool = True,
) -> CycleImportResult:
    df, errors = parse_excel(file_bytes)

    # cycle_key -> { "cycle_name":..., "start_date":..., "end_date":...,
    #                "rows": { (parameter, stage_role): {1: value, 2: value, 3: value} } }
    groups: Dict[Tuple[str, Optional[datetime], Optional[datetime]], dict] = {}
    seen_row_keys: Dict[Tuple, int] = {}  # (cycle_key, parameter, stage_role, replicate) -> first excel row number

    total_rows = 0

    # Carries the most recently seen cycle-level values forward onto
    # blank rows, so a cycle's metadata (name, dates, plant names) only
    # needs to appear once -- e.g. on the first row of the group -- and
    # every following row that leaves those cells blank is understood
    # to belong to that SAME cycle. This is purely a "fill down" read of
    # the sheet: it never invents a cycle and never merges two distinct
    # cycles together, since a row supplying its OWN non-blank
    # cycle_name/start_date/end_date always starts a new "current"
    # context instead of being folded into the previous one.
    current_cycle_name: Optional[str] = None
    current_start_date = None  # raw cell value, re-parsed per row on purpose
    current_end_date = None
    current_plants: Dict[str, str] = {"plant_1": "", "plant_2": "", "plant_3": ""}
    current_parameter: Optional[str] = None

    for idx, raw_row in df.iterrows():
        excel_row_number = idx + 2  # +1 for 0-index, +1 for the header row
        row = raw_row.to_dict()

        # Fully empty row -> silently ignored, per spec.
        if all(_is_blank(v) for v in row.values()):
            continue

        total_rows += 1

        # --- Carry-forward of cycle-level columns ------------------------
        # A blank cell here does NOT mean "missing" -- it means "same as
        # the cycle currently in progress". Only a non-blank cell updates
        # the current context (and thus can start a new cycle group).
        #
        # A row that (re)supplies any of cycle_name/start_date/end_date is
        # the start of a new cycle stanza: the plant carry-forward is reset
        # first so a new cycle never silently inherits the previous
        # cycle's plant names when it doesn't repeat its own.
        starts_new_stanza = not (
            _is_blank(row.get("cycle_name"))
            and _is_blank(row.get("start_date"))
            and _is_blank(row.get("end_date"))
        )
        if starts_new_stanza:
            current_plants = {"plant_1": "", "plant_2": "", "plant_3": ""}
            current_parameter = None

        if not _is_blank(row.get("cycle_name")):
            current_cycle_name = str(row["cycle_name"]).strip()
        if not _is_blank(row.get("start_date")):
            current_start_date = row.get("start_date")
        if not _is_blank(row.get("end_date")):
            current_end_date = row.get("end_date")
        for plant_col in PLANT_COLUMNS:
            if not _is_blank(row.get(plant_col)):
                current_plants[plant_col] = str(row[plant_col]).strip()

        cycle_name = current_cycle_name
        if not cycle_name:
            errors.append(RowError(row=excel_row_number, error="Cycle Name manquant."))
            continue

        start_date = _parse_datetime(current_start_date)
        if start_date is None:
            errors.append(RowError(row=excel_row_number, error="Start Date manquante ou invalide (attendu DD/MM/YYYY HH:mm)."))
            continue

        end_date = _parse_datetime(current_end_date)
        if end_date is None:
            errors.append(RowError(row=excel_row_number, error="End Date manquante ou invalide (attendu DD/MM/YYYY HH:mm)."))
            continue

        if end_date < start_date:
            errors.append(RowError(row=excel_row_number, error="End Date antérieure à Start Date."))
            continue

        # Parameter carry-forward: a blank cell continues the previous
        # non-blank Parameter seen for the current cycle (see module
        # docstring). Only a non-blank cell updates the current context.
        if not _is_blank(row.get("parameter")):
            current_parameter = str(row["parameter"]).strip()

        parameter = current_parameter
        if parameter is None:
            errors.append(RowError(row=excel_row_number, error="Parameter manquant (aucun paramètre précédent à poursuivre)."))
            continue
        if parameter not in PARAMETERS:
            errors.append(
                RowError(row=excel_row_number, error=f"Parameter inconnu : '{parameter}'. Attendu : {PARAMETERS}.")
            )
            continue

        stage_role = _parse_stage(row.get("stage"))
        if stage_role not in STAGE_ROLES:
            errors.append(
                RowError(
                    row=excel_row_number,
                    error=(
                        f"Stage invalide : '{row.get('stage')}'. Attendu : 1, 2 ou 3 "
                        f"(ou, pour compatibilité, 'Wastewater' / 'Planted Series' / 'Control Series')."
                    ),
                )
            )
            continue

        replicate_raw = row.get("replicate")
        try:
            replicate = int(float(replicate_raw))
        except (TypeError, ValueError):
            replicate = None
        if replicate not in (1, 2, 3):
            errors.append(
                RowError(row=excel_row_number, error=f"Replicate invalide : '{replicate_raw}'. Attendu : 1, 2 ou 3.")
            )
            continue

        value_raw = row.get("value")
        if _is_blank(value_raw):
            value = None
        else:
            try:
                value = float(value_raw)
            except (TypeError, ValueError):
                errors.append(RowError(row=excel_row_number, error=f"Value non numérique : '{value_raw}'."))
                continue

        cycle_key = (cycle_name, start_date, end_date)
        row_key = (cycle_key, parameter, stage_role, replicate)

        if row_key in seen_row_keys:
            errors.append(
                RowError(
                    row=excel_row_number,
                    error=(
                        f"Ligne dupliquée pour le cycle '{cycle_name}' "
                        f"({parameter} / stage {stage_role} / réplicat {replicate}) : "
                        f"déjà défini à la ligne {seen_row_keys[row_key]}."
                    ),
                )
            )
            continue
        seen_row_keys[row_key] = excel_row_number

        group = groups.setdefault(
            cycle_key,
            {
                "cycle_name": cycle_name,
                "start_date": start_date,
                "end_date": end_date,
                "rows": {},
                # Plant names for the WHOLE cycle. The Excel file carries
                # no relationship between plants and results: whichever
                # row first supplies a non-blank Plant 1/2/3 value wins
                # for that cycle. Never duplicated per (parameter,
                # stage, replicate) — this is purely a cycle-level value
                # captured once here and later written to the separate
                # `cycle_plants` table by cycle_service.
                "plant_1": "",
                "plant_2": "",
                "plant_3": "",
            },
        )

        for plant_col in PLANT_COLUMNS:
            if not group[plant_col] and current_plants[plant_col]:
                group[plant_col] = current_plants[plant_col]

        param_stage_row = group["rows"].setdefault((parameter, stage_role), {})
        param_stage_row[replicate] = value

    # ------------------------------------------------------------------
    # Build one CycleCreate per group, filling any (parameter, stage) pair
    # not present in the file with all-null replicates, so a partial sheet
    # still satisfies CycleCreate's "all 24 rows" completeness check.
    # ------------------------------------------------------------------
    existing_names = {
        name
        for (name,) in db.execute(
            select(Cycle.cycle_name)
            .join(StudyCycle, StudyCycle.cycle_id == Cycle.id)
            .where(StudyCycle.study_id == study_id)
        ).all()
    }

    cycles_created = []
    cycles_skipped: List[SkippedCycle] = []

    for cycle_key, group in groups.items():
        cycle_name = group["cycle_name"]

        if skip_duplicates and cycle_name in existing_names:
            cycles_skipped.append(
                SkippedCycle(cycle_name=cycle_name, reason="Un cycle portant ce nom existe déjà pour cette étude.")
            )
            continue

        rows: List[CycleRowIn] = []
        for parameter in PARAMETERS:
            for stage_role in STAGE_ROLES:
                replicates = group["rows"].get((parameter, stage_role), {})
                rows.append(
                    CycleRowIn(
                        parameter=parameter,
                        stage=stage_role,
                        replicate_1=replicates.get(1),
                        replicate_2=replicates.get(2),
                        replicate_3=replicates.get(3),
                    )
                )

        try:
            cycle_in = CycleCreate(
                study_id=study_id,
                cycle_name=cycle_name,
                start_date=group["start_date"],
                end_date=group["end_date"],
                plants=CyclePlantsIn(
                    plant_1=group["plant_1"],
                    plant_2=group["plant_2"],
                    plant_3=group["plant_3"],
                ),
                rows=rows,
            )
            cycle = cycle_service.create_cycle_with_results(db, cycle_in)
            cycles_created.append(cycle)
            existing_names.add(cycle_name)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Erreur lors de la création du cycle importé '%s' : %s", cycle_name, exc)
            cycles_skipped.append(SkippedCycle(cycle_name=cycle_name, reason=str(exc)))

    logger.info(
        "Import Excel terminé (étude id=%s) : %d ligne(s) lues, %d cycle(s) créé(s), "
        "%d cycle(s) ignoré(s), %d erreur(s) de ligne.",
        study_id, total_rows, len(cycles_created), len(cycles_skipped), len(errors),
    )

    return CycleImportResult(
        total_rows=total_rows,
        cycles_created=cycles_created,
        cycles_skipped=cycles_skipped,
        row_errors=errors,
    )
