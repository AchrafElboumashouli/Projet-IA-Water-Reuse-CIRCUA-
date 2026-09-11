export type ParameterKey = "ph" | "temperature" | "ec" | "turbidity" | "do";

export const PARAMETER_LABELS: Record<ParameterKey, string> = {
  ph: "pH",
  temperature: "Température (°C)",
  ec: "Conductivité EC (µS/cm)",
  turbidity: "Turbidité (NTU)",
  do: "Oxygène dissous (mg/L)",
};

export const PARAMETER_KEYS: ParameterKey[] = ["ph", "temperature", "ec", "turbidity", "do"];

export interface RawSensorData {
  id: number;
  study_id: number | null;
  created_at: string;
  entry_id: number;
  ph: number | null;
  temperature: number | null;
  ec: number | null;
  turbidity: number | null;
  do: number | null;
  set_number: number;
  inserted_at: string;
}

export interface ComplianceStatus {
  morocco_ok: boolean | null;
  europe_ok: boolean | null;
  status: "both" | "morocco" | "europe" | "none" | "unknown";
}

export interface LatestReading extends RawSensorData {
  compliance: Record<ParameterKey, ComplianceStatus>;
}

export interface NormsSpec {
  label: string;
  unit: string;
  morocco: { min: number | null; max: number | null };
  europe: { min: number | null; max: number | null };
}

export interface DescriptiveStats {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  std: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
}

export interface GlobalStats {
  total_rows: number;
  date_range?: { from: string | null; to: string | null };
  [key: string]: DescriptiveStats | number | { from: string | null; to: string | null } | undefined;
}

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

export interface CycleResultRow {
  id: number;
  parameter: string;
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

export interface CycleDetail extends CycleSummary {
  results: CycleResultRow[];
}

export interface SensorAlert {
  id: number;
  set_number: number;
  parameter: string;
  study_id: number | null;
  consecutive_count: number;
  severity: "warning" | "critical";
  status: "active" | "resolved";
  message: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface AnomalyEvent {
  created_at: string;
  set_number: number;
  method: "zscore" | "isolation_forest" | "autoencoder";
  severity: "warning" | "critical";
  cause: string;
}

export interface CalendarDay {
  count: number;
  critical: number;
  warning: number;
  null_alert_count: number;
  anomaly_count: number;
  alerts: SensorAlert[];
  anomalies: AnomalyEvent[];
}

export interface DayDetail {
  day: string;
  alerts: SensorAlert[];
  anomalies: AnomalyEvent[];
}
