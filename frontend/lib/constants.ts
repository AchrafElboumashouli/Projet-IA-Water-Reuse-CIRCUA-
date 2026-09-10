import { DraftRow, StageRole, STAGE_ROLES } from "./types";

// Must stay in sync with backend/app/schemas/cycle.py (PARAMETERS,
// PARAMETER_UNITS, STAGE_ROLES). The /api/meta endpoint returns the
// source of truth at runtime; these are used as an immediate fallback so
// the table renders instantly.
//
// Parameter names are shown WITHOUT their unit (ex. "COD", not
// "COD (mg/L)") — the unit is shown once, in the column header, via
// PARAMETER_UNITS.
export const PARAMETERS: string[] = [
  "COD",
  "BOD",
  "TSS",
  "pH",
  "Temperature",
  "EC",
  "Turbidity",
  "DO",
];

export const PARAMETER_UNITS: Record<string, string> = {
  COD: "mg/L",
  BOD: "mg/L",
  TSS: "mg/L",
  pH: "",
  Temperature: "°C",
  EC: "µS/cm",
  Turbidity: "NTU",
  DO: "mg/L",
};

/** "COD" + "mg/L" -> "COD (mg/L)"; "pH" + "" -> "pH". For the rare place
 * (e.g. a chart axis title) that wants the unit inlined instead of in a
 * separate header cell. */
export function parameterWithUnit(parameter: string): string {
  const unit = PARAMETER_UNITS[parameter];
  return unit ? `${parameter} (${unit})` : parameter;
}

export { STAGE_ROLES };

export function buildEmptyRows(
  parameters: string[] = PARAMETERS,
  stages: StageRole[] = STAGE_ROLES
): DraftRow[] {
  const rows: DraftRow[] = [];
  for (const parameter of parameters) {
    for (const stage of stages) {
      rows.push({
        parameter,
        stage,
        replicate_1: null,
        replicate_2: null,
        replicate_3: null,
      });
    }
  }
  return rows;
}

// Visual accent per stage ROLE (stable regardless of which plant name is
// displayed for that role in a given cycle).
export const STAGE_ACCENT: Record<StageRole, string> = {
  stage_1: "border-stage-wastewater",
  stage_2: "border-stage-planted",
  stage_3: "border-stage-control",
};

// Real stage labels shown in the "Stage" column — must match backend
// app/schemas/cycle.py::STAGE_LABELS exactly. These are the actual
// experimental stages, NOT plant names and NOT generic placeholders
// like "Stage 1 (raw)". Used for the editable (draft) form; saved rows
// use the label the backend already resolved (CycleResultRow.stage).
export const STAGE_ROLE_LABELS: Record<StageRole, string> = {
  stage_1: "Wastewater",
  stage_2: "Planted Series",
  stage_3: "Control Series",
};
