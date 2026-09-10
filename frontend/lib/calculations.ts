import { DraftRow, StageRole } from "./types";

// stage_1 is always the reference/untreated sample used as the Removal %
// baseline for stage_2 and stage_3 — mirrors backend
// app/schemas/cycle.py::BASELINE_STAGE_ROLE. Plant names have no bearing
// on this at all (they live in a fully separate note).
const BASELINE_STAGE_ROLE: StageRole = "stage_1";

export interface ComputedFields {
  average: number | null;
  std: number | null;
  removal_1: number | null;
  removal_2: number | null;
  removal_3: number | null;
  removal_percent: number | null;
  removal_std: number | null;
}

function mean(values: (number | null)[]): number | null {
  const vals = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Sample standard deviation (ddof=1), matching backend/app/calculations.py
function sampleStd(values: (number | null)[]): number | null {
  const vals = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (vals.length < 2) return null;
  const m = mean(vals) as number;
  const variance =
    vals.reduce((sum, v) => sum + (v - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(variance);
}

function removal(
  baseline: number | null,
  current: number | null
): number | null {
  if (baseline === null || current === null || baseline === 0) return null;
  return ((baseline - current) / baseline) * 100;
}

function round4(v: number | null): number | null {
  if (v === null) return null;
  return Math.round(v * 10000) / 10000;
}

/**
 * Mirrors backend/app/services/cycle_service.py::build_cycle_results for
 * instant client-side preview. The backend recomputes authoritatively on
 * save — this is purely so the table can show live numbers as the user
 * types.
 */
export function computeAllRows(
  rows: DraftRow[]
): Record<string, ComputedFields> {
  const byKey = new Map<string, DraftRow>();
  for (const row of rows) byKey.set(`${row.parameter}|${row.stage}`, row);

  const result: Record<string, ComputedFields> = {};

  for (const row of rows) {
    const key = `${row.parameter}|${row.stage}`;
    const reps = [row.replicate_1, row.replicate_2, row.replicate_3];
    const average = mean(reps);
    const std = sampleStd(reps);

    let removal_1: number | null = null;
    let removal_2: number | null = null;
    let removal_3: number | null = null;
    let removal_percent: number | null = null;
    let removal_std: number | null = null;

    if (row.stage !== BASELINE_STAGE_ROLE) {
      const baseline = byKey.get(`${row.parameter}|${BASELINE_STAGE_ROLE}`);
      if (baseline) {
        removal_1 = removal(baseline.replicate_1, row.replicate_1);
        removal_2 = removal(baseline.replicate_2, row.replicate_2);
        removal_3 = removal(baseline.replicate_3, row.replicate_3);
        removal_percent = mean([removal_1, removal_2, removal_3]);
        removal_std = sampleStd([removal_1, removal_2, removal_3]);
      }
    }

    result[key] = {
      average: round4(average),
      std: round4(std),
      removal_1: round4(removal_1),
      removal_2: round4(removal_2),
      removal_3: round4(removal_3),
      removal_percent: round4(removal_percent),
      removal_std: round4(removal_std),
    };
  }

  return result;
}
