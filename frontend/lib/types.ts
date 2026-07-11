export type Stage = "Wastewater" | "Planted Series" | "Control Series";

// Matches the merged backend's `studies` table (app/models/study.py /
// app/schemas/study.py) — integer id, no more title/description.
export interface Study {
  id: number;
  study_name: string;
  plant_type: string;
  start_date: string;
  end_date: string | null;
}

export interface CycleSummary {
  id: number;
  study_id: number;
  cycle_name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

/** A row as the user edits it, before saving. */
export interface DraftRow {
  parameter: string;
  stage: Stage;
  replicate_1: number | null;
  replicate_2: number | null;
  replicate_3: number | null;
}

/** A row as returned by the backend after calculation. */
export interface CycleResultRow extends DraftRow {
  id: number;
  average: number | null;
  std: number | null;
  removal_1: number | null;
  removal_2: number | null;
  removal_3: number | null;
  removal_percent: number | null;
  removal_std: number | null;
}

export interface Cycle {
  id: number;
  study_id: number;
  cycle_name: string;
  start_date: string;
  end_date: string;
  created_at: string;
  results: CycleResultRow[];
}

export interface CycleCreatePayload {
  study_id: number;
  cycle_name: string;
  start_date: string;
  end_date: string;
  rows: DraftRow[];
}
