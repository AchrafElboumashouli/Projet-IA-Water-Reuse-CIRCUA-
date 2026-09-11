import { ParameterKey, PARAMETER_KEYS, PARAMETER_LABELS, RawSensorData } from "@/types";

export interface NormsSpec {
  label: string;
  unit: string;
  morocco: { min: number | null; max: number | null };
  europe: { min: number | null; max: number | null };
}

function inRange(value: number, range: { min: number | null; max: number | null }): boolean {
  if (range.min !== null && value < range.min) return false;
  if (range.max !== null && value > range.max) return false;
  return true;
}

export function evaluateCompliance(
  param: ParameterKey,
  value: number,
  spec: NormsSpec | undefined
): "both" | "morocco" | "europe" | "none" {
  if (!spec) return "none";
  const moroccoOk = inRange(value, spec.morocco);
  const europeOk = inRange(value, spec.europe);
  if (moroccoOk && europeOk) return "both";
  if (moroccoOk) return "morocco";
  if (europeOk) return "europe";
  return "none";
}

export { PARAMETER_KEYS, PARAMETER_LABELS };
export type { RawSensorData };
