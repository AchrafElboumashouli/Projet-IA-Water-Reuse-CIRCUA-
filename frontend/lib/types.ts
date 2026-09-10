// Stable stage roles (internal identifiers, used for the Removal %
// baseline calculation). stage_1 is always the reference/untreated
// sample — see backend app/schemas/cycle.py::BASELINE_STAGE_ROLE. The
// REAL, human-readable stage label ("Wastewater" / "Planted Series" /
// "Control Series") is derived from the role — see STAGE_ROLE_LABELS
// in lib/constants.ts (frontend draft rows) and CycleResultRow.stage
// (backend-computed, saved rows).
export type StageRole = "stage_1" | "stage_2" | "stage_3";

export const STAGE_ROLES: StageRole[] = ["stage_1", "stage_2", "stage_3"];

// Matches the merged backend's `studies` table (app/models/study.py /
// app/schemas/study.py). A study no longer carries plant information —
// each cycle now owns its own plant names (see Cycle below).
export interface Study {
  id: number;
  study_name: string;
  start_date: string;
  end_date: string | null;
}

/** Minimal Study reference used to list which studies use a Cycle. */
export interface StudyRef {
  id: number;
  study_name: string;
}

export interface CycleSummary {
  id: number;
  cycle_name: string;
  start_date: string;
  end_date: string;
  created_at: string;
  // Every study currently associated with this cycle (many-to-many —
  // see backend app/models/study_cycle.py). Can be empty, or contain
  // several studies at once.
  studies: StudyRef[];
}

/** One row of GET /api/cycles/available-for-import — EVERY cycle in the
 * database, with no filtering (see backend app/routes/cycle.py). */
export interface ImportableCycle {
  id: number;
  cycle_name: string;
  studies: StudyRef[];
  start_date: string;
  end_date: string;
  created_at: string;
  plants: CyclePlants | null;
  plant_count: number;
}

/** A row as the user edits it, before saving. */
export interface DraftRow {
  parameter: string;
  stage: StageRole;
  replicate_1: number | null;
  replicate_2: number | null;
  replicate_3: number | null;
}

/** A row as returned by the backend after calculation. `stage_role` is
 * the stable internal identifier (used for the Removal % baseline);
 * `stage` is the real, human-readable label ("Wastewater" / "Planted
 * Series" / "Control Series") the backend derives from it — this is
 * what must be displayed in the Stage column. This row carries NO
 * plant information: plant names live entirely separately, on
 * `Cycle.plants` (see CyclePlants below), related only through the
 * cycle — never duplicated per result row. */
export interface CycleResultRow {
  id: number;
  parameter: string;
  stage_role: StageRole;
  stage: string;
  replicate_1: number | null;
  replicate_2: number | null;
  replicate_3: number | null;
  average: number | null;
  std: number | null;
  removal_1: number | null;
  removal_2: number | null;
  removal_3: number | null;
  removal_percent: number | null;
  removal_std: number | null;
}

/** Plant names for ONE cycle, stored in the backend's standalone
 * `cycle_plants` table (cycle_plants.cycle_id -> cycles.id). Fully
 * independent from another cycle's plant names, and never duplicated
 * onto `CycleResultRow`. */
export interface CyclePlants {
  id: number;
  cycle_id: number;
  plant_1: string;
  plant_2: string;
  plant_3: string;
}

export interface Cycle {
  id: number;
  cycle_name: string;
  start_date: string;
  end_date: string;
  created_at: string;
  studies: StudyRef[];
  // null if no plant names have been entered for this cycle yet.
  plants: CyclePlants | null;
  results: CycleResultRow[];
}

// Three independent alert categories (see backend
// app/services/alert_types.py::AlertType). "anomaly" is currently a
// placeholder — no anomaly alerts are generated yet, but the type
// exists so the dashboard and filters are ready for it.
export type AlertType = "no_data" | "capture_failure" | "anomaly";

// Which sensor set(s) an alert concerns: the string form of a
// configured set's `set_number` (see GET /api/sensor-sets — the
// number of sets is configurable via SENSOR_SETS, so this is
// intentionally a plain string rather than a fixed "1" | "2" union),
// or the sentinel "both" used for capture_failure alerts when ALL
// configured sensor sets fail simultaneously.
export type SensorSetLabel = string;

export const BOTH_SENSOR_SETS = "both";

export interface SensorAlert {
  id: number;
  alert_type: AlertType;
  sensor_set: SensorSetLabel | null;
  study_id: number | null;
  consecutive_count: number;
  severity: "warning" | "critical";
  status: "active" | "resolved";
  message: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

// N = number of consecutive failed events (missing collections or
// all-zero captures) required before an alert becomes active. Shared
// by every alert type — see backend app/services/alert_service.py.
export interface AlertConfig {
  null_capture_threshold: number;
}

export interface RowError {
  row: number;
  error: string;
}

export interface SkippedCycle {
  cycle_name: string;
  reason: string;
}

export interface CycleImportResult {
  total_rows: number;
  cycles_created: CycleSummary[];
  cycles_skipped: SkippedCycle[];
  row_errors: RowError[];
}

export interface CycleCreatePayload {
  study_id: number;
  cycle_name: string;
  start_date: string;
  end_date: string;
  // Plant names for THIS cycle only, entered once on the "Enter Data
  // for Replicate" form. Persisted by the backend into the standalone
  // `cycle_plants` table (linked via cycle_id) — never onto
  // cycle_results rows. Independent from every other cycle's plant
  // names.
  plants: {
    plant_1: string;
    plant_2: string;
    plant_3: string;
  };
  rows: DraftRow[];
}

// A single configured sensor set, as returned by GET /api/sensor-sets.
// The frontend must never hardcode "Set 1" / "Set 2": the number of
// configured sets is arbitrary (see backend app/config.py::SENSOR_SETS).
export interface SensorSet {
  set_number: number;
  channel_id: string;
}
