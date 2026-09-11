const BASE_URL = process.env.NEXT_PUBLIC_MONITORING_API_URL || "http://localhost:8001";

export class APIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new APIError(text, res.status);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
  
}

export const api = {
  // --- Raw data / monitoring temps réel ---
  latest: (setNumber?: number) => request(`/api/monitoring/raw-data/latest${qs({ set_number: setNumber })}`),
  norms: () => request(`/api/monitoring/raw-data/norms`),
  history: (params: { set_number?: number; start_date?: string; end_date?: string; plant_type?: string; limit?: number }) =>
    request(`/api/monitoring/raw-data/history${qs(params)}`),
  qualityReport: (params: { set_number?: number; start_date?: string; end_date?: string }) =>
    request(`/api/monitoring/raw-data/quality-report${qs(params)}`),

  // --- Analytics ---
  globalStats: (params: { set_number?: number; start_date?: string; end_date?: string }) =>
    request(`/api/monitoring/analytics/global-stats${qs(params)}`),
  histogram: (params: { parameter: string; set_number?: number; start_date?: string; end_date?: string; bins?: number }) =>
    request(`/api/monitoring/analytics/histogram${qs(params)}`),
  boxplot: (params: { set_number?: number; start_date?: string; end_date?: string }) =>
    request(`/api/monitoring/analytics/boxplot${qs(params)}`),
  correlation: (params: { method?: string; set_number?: number; start_date?: string; end_date?: string }) =>
    request(`/api/monitoring/analytics/correlation${qs(params)}`),
  timeline: (params: { parameter: string; set_number?: number; start_date?: string; end_date?: string; window?: number }) =>
  request(`/api/monitoring/analytics/timeline${qs(params)}`),
  pca: (params: { set_number?: number; start_date?: string; end_date?: string; n_components?: number }) =>
  request(`/api/monitoring/analytics/pca${qs(params)}`),

  // --- Anomalies ---
  zscore: (params: { parameter: string; set_number?: number; start_date?: string; end_date?: string; threshold?: number }) =>
    request(`/api/monitoring/anomalies/zscore${qs(params)}`),
  isolationForest: (params: { set_number?: number; start_date?: string; end_date?: string; contamination?: number }) =>
    request(`/api/monitoring/anomalies/isolation-forest${qs(params)}`),
  autoencoder: (params: { set_number?: number; start_date?: string; end_date?: string; error_percentile?: number }) =>
    request(`/api/monitoring/anomalies/autoencoder${qs(params)}`),
  drift: (params: { start_date?: string; end_date?: string }) => request(`/api/monitoring/anomalies/drift${qs(params)}`),
  compareSets: (params: { parameter: string; start_date?: string; end_date?: string }) =>
    request(`/api/monitoring/anomalies/compare-sets${qs(params)}`),

  // --- Alerts / Journal ---
  alerts: (params: Record<string, unknown> = {}) => request(`/api/monitoring/alerts${qs(params)}`),
  alertConfig: () => request(`/api/monitoring/alerts/config`),
  setAlertConfig: (threshold: number) =>
    request(`/api/monitoring/alerts/config${qs({ threshold })}`, { method: "PUT" }),
  calendar: (params: { date_from?: string; date_to?: string; include_anomalies?: boolean } = {}) =>
    request(`/api/monitoring/alerts/calendar${qs(params)}`),
  calendarDay: (day: string, includeAnomalies = true) =>
    request(`/api/monitoring/alerts/calendar/${day}${qs({ include_anomalies: includeAnomalies })}`),

  // --- Studies / Cycles ---
  createStudy: (payload: unknown) => request(`/api/monitoring/studies`, { method: "POST", body: JSON.stringify(payload) }),
  listStudies: () => request(`/api/monitoring/studies`),
  getStudy: (id: number) => request(`/api/monitoring/studies/${id}`),
  assignStudy: (id: number, setNumber: number) =>
    request(`/api/monitoring/studies/${id}/assign${qs({ set_number: setNumber })}`, { method: "POST" }),
  cycleMeta: () => request(`/api/monitoring/studies/meta/definitions`),
  createCycle: (studyId: number, payload: unknown) =>
    request(`/api/monitoring/studies/${studyId}/cycles`, { method: "POST", body: JSON.stringify(payload) }),
  listCycles: (studyId: number) => request(`/api/monitoring/studies/${studyId}/cycles`),
  getCycle: (cycleId: number) => request(`/api/monitoring/studies/cycles/${cycleId}`),
  comparisonDescriptive: (studyId: number, parameter: string, cycleIds?: string) =>
    request(`/api/monitoring/studies/${studyId}/comparison/descriptive${qs({ parameter, cycle_ids: cycleIds })}`),
  comparisonAnova: (studyId: number, parameter: string, cycleIds?: string) =>
    request(`/api/monitoring/studies/${studyId}/comparison/anova-tukey${qs({ parameter, cycle_ids: cycleIds })}`),
  comparisonPca: (studyId: number, cycleIds?: string) =>
    request(`/api/monitoring/studies/${studyId}/comparison/pca${qs({ cycle_ids: cycleIds })}`),
  removalSummary: (studyId: number, cycleIds?: string) =>
    request(`/api/monitoring/studies/${studyId}/comparison/removal-summary${qs({ cycle_ids: cycleIds })}`),
  studyGlobalStats: (studyId: number, cycleIds?: string) =>
    request(`/api/monitoring/studies/${studyId}/global-stats${qs({ cycle_ids: cycleIds })}`),
  studyBoxplot: (studyId: number, parameter: string, cycleIds?: string) =>
    request(`/api/monitoring/studies/${studyId}/analysis/boxplot${qs({ parameter, cycle_ids: cycleIds })}`),
  studyHistogram: (studyId: number, parameter: string, cycleIds?: string, bins?: number) =>
    request(`/api/monitoring/studies/${studyId}/analysis/histogram${qs({ parameter, cycle_ids: cycleIds, bins })}`),
  studyHeatmap: (studyId: number, cycleIds?: string, method?: string) =>
    request(`/api/monitoring/studies/${studyId}/analysis/heatmap${qs({ cycle_ids: cycleIds, method })}`),
  studyParameterSummary: (studyId: number, parameter: string, cycleIds?: string) =>
    request(`/api/monitoring/studies/${studyId}/analysis/parameter-summary${qs({ parameter, cycle_ids: cycleIds })}`),
  studyProgression: (studyId: number, parameter: string, cycleIds?: string) =>
    request(`/api/monitoring/studies/${studyId}/analysis/progression${qs({ parameter, cycle_ids: cycleIds })}`),

  // --- Data table ---
  dataTable: (params: { set_number?: number; start_date?: string; end_date?: string; skip?: number; limit?: number }) =>
    request(`/api/monitoring/data-table${qs(params)}`),

  exportUrl: (params: { set_number?: number; start_date?: string; end_date?: string }) =>
    `${BASE_URL}/api/monitoring/data-table/export${qs(params)}`,
  studyExportUrl: (params: { start_date: string; end_date: string; plant_type: string; set_number: number }) =>
    `${BASE_URL}/api/monitoring/studies/export/csv${qs(params)}`,
};

export { BASE_URL as MONITORING_API_BASE_URL };
