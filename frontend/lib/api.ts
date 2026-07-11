import {
  Cycle,
  CycleCreatePayload,
  CycleSummary,
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
    plant_type: string;
    start_date: string;
    end_date?: string;
  }) =>
    request<Study>("/api/study", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getStudy: (studyId: number | string) =>
    request<Study>(`/api/study/${studyId}`),

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
  assignRawData: (studyId: number | string, setNumber: 1 | 2) =>
    request<{ study_id: number; assigned_rows: number; message: string }>(
      `/api/study/${studyId}/assign?set_number=${setNumber}`,
      { method: "POST" }
    ),
};
