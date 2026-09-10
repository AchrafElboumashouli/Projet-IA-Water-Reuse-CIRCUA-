"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { AlertType, SensorAlert, SensorSet, SensorSetLabel } from "@/lib/types";

const ALERT_TYPES: { value: AlertType; label: string; icon: string; description: string }[] = [
  {
    value: "no_data",
    label: "No Data Collected",
    icon: "\u{1F534}",
    description:
      "No new records have been received from ThingSpeak for N consecutive collection attempts.",
  },
  {
    value: "capture_failure",
    label: "Capture Failure",
    icon: "\u{1F7E0}",
    description:
      "One or more sensor parameter sets returned only zero values for N consecutive captures.",
  },
  {
    value: "anomaly",
    label: "Anomaly Detection (Future)",
    icon: "\u{1F7E1}",
    description: "Reserved for configurable sensor threshold violations.",
  },
];

function alertTypeLabel(t: AlertType): string {
  return ALERT_TYPES.find((a) => a.value === t)?.label ?? t;
}

function sensorSetLabel(s: SensorSetLabel | null, sensorSets: SensorSet[]): string {
  if (s === null || s === undefined || s === "") return "—";
  if (s === "both") return "Both";
  const known = sensorSets.find((set) => String(set.set_number) === s);
  return known ? `Set ${known.set_number}` : `Set ${s}`;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SensorAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sensorSets, setSensorSets] = useState<SensorSet[]>([]);

  const [alertType, setAlertType] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [sensorSet, setSensorSet] = useState("");

  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdInput, setThresholdInput] = useState("");
  const [savingThreshold, setSavingThreshold] = useState(false);

  async function refresh() {
    try {
      setError(null);
      const data = await api.listAlerts({
        alert_type: alertType || undefined,
        severity: severity || undefined,
        status: status || undefined,
        sensor_set: sensorSet || undefined,
      });
      setAlerts(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertType, severity, status, sensorSet]);

  useEffect(() => {
    api
      .getAlertConfig()
      .then((c) => {
        setThreshold(c.null_capture_threshold);
        setThresholdInput(String(c.null_capture_threshold));
      })
      .catch(() => {
        /* non-blocking */
      });
  }, []);

  useEffect(() => {
    // Sensor sets are configurable (see settings.SENSOR_SETS); fetch
    // the actual list rather than assuming there are exactly two, so
    // the filter dropdown and labels stay correct if a set is added
    // or removed.
    api
      .getSensorSets()
      .then((res) => setSensorSets(res.sensor_sets))
      .catch(() => {
        /* non-blocking */
      });
  }, []);

  async function handleSaveThreshold(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(thresholdInput);
    if (!Number.isInteger(n) || n < 1) return;
    setSavingThreshold(true);
    try {
      const updated = await api.updateAlertConfig(n);
      setThreshold(updated.null_capture_threshold);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingThreshold(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Alerts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Alerts fire after N consecutive failed events. Three independent
          categories are tracked: missing collections, all-zero captures, and
          (in the future) sensor-value anomalies.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-signal-low/30 bg-signal-low/5 px-4 py-3 text-sm text-signal-low">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSaveThreshold}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-line bg-white p-4"
      >
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">
            Consecutive Failed Captures Threshold (N)
          </label>
          <input
            type="number"
            min={1}
            className="mt-1 w-28 rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={savingThreshold}
          className="whitespace-nowrap rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          {savingThreshold ? "Saving…" : "Save Threshold"}
        </button>
        {threshold !== null && (
          <span className="text-xs text-slate-400">
            Currently: Alert after {threshold} consecutive failed captures.
          </span>
        )}
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        {ALERT_TYPES.map((t) => (
          <div key={t.value} className="rounded-lg border border-slate-line bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t.description}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-line bg-white p-4">
        <select
          className="rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
          value={alertType}
          onChange={(e) => setAlertType(e.target.value)}
        >
          <option value="">All alert types</option>
          {ALERT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          className="rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">All severities</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <select
          className="rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
          value={sensorSet}
          onChange={(e) => setSensorSet(e.target.value)}
        >
          <option value="">All sensor sets</option>
          {sensorSets.map((s) => (
            <option key={s.set_number} value={String(s.set_number)}>
              Set {s.set_number}
            </option>
          ))}
          <option value="both">Both</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading alerts…</p>
      ) : alerts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-line px-4 py-10 text-center text-sm text-slate-500">
          No alerts match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-line text-left text-2xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Alert Type</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Sensor Set</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Consecutive Failures</th>
                <th className="px-4 py-3">Detection Time</th>
                <th className="px-4 py-3">Resolution Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-line">
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    <div className="flex items-center gap-2">
                      <span>{ALERT_TYPES.find((t) => t.value === a.alert_type)?.icon}</span>
                      <span>{alertTypeLabel(a.alert_type)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.message}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{sensorSetLabel(a.sensor_set, sensorSets)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-2xs font-semibold uppercase " +
                        (a.severity === "critical"
                          ? "bg-signal-low/10 text-signal-low"
                          : "bg-amber-100 text-amber-700")
                      }
                    >
                      {a.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-2xs font-semibold uppercase " +
                        (a.status === "active"
                          ? "bg-signal-low/10 text-signal-low"
                          : "bg-emerald-100 text-emerald-700")
                      }
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular">{a.consecutive_count}</td>
                  <td className="px-4 py-3 tabular text-xs text-slate-500">
                    {formatDateTime(a.created_at)}
                  </td>
                  <td className="px-4 py-3 tabular text-xs text-slate-500">
                    {formatDateTime(a.resolved_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
