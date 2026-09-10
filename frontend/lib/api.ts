import {
  AlertConfig,
  Cycle,
  CycleCreatePayload,
  CycleImportResult,
  CycleSummary,
  ImportableCycle,
  SensorAlert,
  SensorSet,
  Study,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Request to ${path} failed (${res.status}): ${body || res.statusText}`
    );
  }

  // 204 / empty body guard
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

// NOTE: base paths below (/api/study, singular) match the merged
// study-centric backend (app/routes/study.py + app/routes/cycle.py),
// not the old standalone cycle-results service (/api/studies, plural).
export const api = {
  listStudies: () => request<Study[]>("/api/study"),

  createStudy: (payload: {
    study_name: string;
    start_date: string;
    end_date?: string;
  }) =>
    request<Study>("/api/study", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getStudy: (studyId: number | string) =>
    request<Study>(`/api/study/${studyId}`),

  // Permanently deletes the study. Only its `study_cycles` association
  // rows are removed by the backend cascade — the cycles themselves,
  // their cycle_results, and their cycle_plants are preserved and can
  // still be used by other studies. raw_sensor_data is never deleted —
  // its study_id becomes NULL (ON DELETE SET NULL).
  // 204 No Content on success — the `request` helper's empty-body guard
  // returns `undefined` for that.
  deleteStudy: (studyId: number | string) =>
    request<void>(`/api/study/${studyId}`, { method: "DELETE" }),

  listCycles: (studyId: number | string) =>
    request<CycleSummary[]>(`/api/study/${studyId}/cycles`),

  getCycle: (cycleId: number | string) =>
    request<Cycle>(`/api/cycles/${cycleId}`),

  createCycle: (payload: CycleCreatePayload) =>
    // Everything — cycle metadata AND all 24 rows — travels in this ONE
    // POST request, as required by the spec.
    request<Cycle>("/api/cycles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Links already-collected ESP32/ThingSpeak readings to a study, in
  // place, via study_id (replaces the old /populate copy-based flow).
  // `setNumber` accepts any configured sensor set, not just 1 or 2 — see
  // getSensorSets() below for the current list.
  assignRawData: (studyId: number | string, setNumber: number) =>
    request<{ study_id: number; assigned_rows: number; message: string }>(
      `/api/study/${studyId}/assign?set_number=${setNumber}`,
      { method: "POST" }
    ),

  // Configured sensor sets (see backend app/config.py::SENSOR_SETS). The
  // frontend uses this instead of hardcoding "Set 1" / "Set 2", so the
  // number of sets stays fully driven by backend configuration.
  getSensorSets: () =>
    request<{ sensor_sets: SensorSet[] }>("/api/sensor-sets"),

  // -- Alerts (No Data Collected / Capture Failure / Anomaly) --------------
  listAlerts: (filters?: {
    alert_type?: string;
    study_id?: number;
    sensor_set?: string;
    severity?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== "") params.set(key, String(value));
      });
    }
    const qs = params.toString();
    return request<SensorAlert[]>(`/api/alerts${qs ? `?${qs}` : ""}`);
  },

  getAlertConfig: () => request<AlertConfig>("/api/alerts/config"),

  updateAlertConfig: (threshold: number) =>
    request<AlertConfig>("/api/alerts/config", {
      method: "PUT",
      body: JSON.stringify({ null_capture_threshold: threshold }),
    }),

  // -- Excel cycle import ---------------------------------------------------
  importCycles: async (
    studyId: number | string,
    file: File,
    skipDuplicates = true
  ): Promise<CycleImportResult> => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(
      `${API_BASE_URL}/api/study/${studyId}/cycles/import?skip_duplicates=${skipDuplicates}`,
      { method: "POST", body: formData }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Import failed (${res.status}): ${body || res.statusText}`);
    }
    return res.json() as Promise<CycleImportResult>;
  },

  // -- Import Existing Cycle (reuse a cycle already in the DB) --------------
  // Returns EVERY cycle in the database — no filtering. The cycle is a
  // permanent repository: cycles used by other studies, cycles used by
  // no study, and cycles used by several studies all show up here (see
  // backend app/routes/cycle.py).
  listAvailableCyclesForImport: (opts?: { search?: string }) => {
    const params = new URLSearchParams();
    if (opts?.search) params.set("search", opts.search);
    const qs = params.toString();
    return request<ImportableCycle[]>(`/api/cycles/available-for-import${qs ? `?${qs}` : ""}`);
  },

  importExistingCycle: (studyId: number | string, cycleId: number | string) =>
    request<{ cycle: Cycle; message: string }>(
      `/api/study/${studyId}/cycles/${cycleId}/import`,
      { method: "POST" }
    ),

  // "Delete" on a Study's Cycles page: removes ONLY this Study<->Cycle
  // association (the study_cycles row). The Cycle itself, its
  // cycle_results, and its cycle_plants are never touched, and any
  // other Study associated with the same Cycle is unaffected — see
  // backend app/routes/study.py::remove_cycle_from_study. 204 No
  // Content on success.
  removeCycleFromStudy: (studyId: number | string, cycleId: number | string) =>
    request<void>(`/api/study/${studyId}/cycles/${cycleId}`, {
      method: "DELETE",
    }),
};
