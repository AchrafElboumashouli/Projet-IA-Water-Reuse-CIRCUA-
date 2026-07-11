import { DraftRow, Stage } from "./types";

// Must stay in sync with backend/app/schemas.py (PARAMETERS, STAGES).
// The /api/meta endpoint returns the source of truth at runtime; these
// are used as an immediate fallback so the table renders instantly.
export const PARAMETERS: string[] = [
  "COD (mg/L)",
  "BOD (mg/L)",
  "TSS (mg/L)",
  "pH",
  "Temperature (°C)",
  "EC (µS/cm)",
  "Turbidity (NTU)",
  "DO (mg/L)",
];

export const STAGES: Stage[] = ["Wastewater", "Planted Series", "Control Series"];

export function buildEmptyRows(
  parameters: string[] = PARAMETERS,
  stages: Stage[] = STAGES
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

export const STAGE_ACCENT: Record<Stage, string> = {
  Wastewater: "border-stage-wastewater",
  "Planted Series": "border-stage-planted",
  "Control Series": "border-stage-control",
};
