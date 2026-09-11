"use client";

import { useState } from "react";
import useSWR from "swr";
import { AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import FilterBar, { Filters } from "@/components/FilterBar";
import { PageHeader, LoadingState, ErrorState, EmptyState, StatCard } from "@/components/ui";
import { PARAMETER_KEYS, PARAMETER_LABELS, ParameterKey, SensorAlert } from "@/types";

export default function AlertesPage() {
  const [tab, setTab] = useState<"anomalies" | "null">("anomalies");

  return (
    <div>
      <PageHeader title="Alertes" subtitle="Détection intelligente d'anomalies & captures nulles consécutives" icon={AlertTriangle} />

      <div className="mb-6 flex gap-2 border-b border-ink-700 pb-px">
        <button
          onClick={() => setTab("anomalies")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === "anomalies" ? "border-b-2 border-aqua-500 text-aqua-400" : "text-ink-600"}`}
        >
          Anomalies intelligentes (Z-score / Isolation Forest / Autoencoder)
        </button>
        <button
          onClick={() => setTab("null")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === "null" ? "border-b-2 border-aqua-500 text-aqua-400" : "text-ink-600"}`}
        >
          Captures nulles consécutives
        </button>
      </div>

      {tab === "anomalies" ? <AnomaliesTab /> : <NullAlertsTab />}
    </div>
  );
}

function AnomaliesTab() {
  const [filters, setFilters] = useState<Filters>({});
  const [param, setParam] = useState<ParameterKey>("ph");
  const [method, setMethod] = useState<"zscore" | "isolation_forest" | "autoencoder">("zscore");

  const { data, error, isLoading } = useSWR(["anomalies", method, filters, param], () => {
    if (method === "zscore") {
      return api.zscore({ parameter: param, set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate });
    }
    if (method === "isolation_forest") {
      return api.isolationForest({ set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate });
    }
    return api.autoencoder({ set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate });
  }) as { data: any[] | undefined; error: any; isLoading: boolean };

  return (
    <div>
      <FilterBar filters={filters} onChange={setFilters} />

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { key: "zscore", label: "Z-score (univarié)" },
          { key: "isolation_forest", label: "Isolation Forest (multivarié)" },
          { key: "autoencoder", label: "Autoencoder (erreur de reconstruction)" },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMethod(m.key as typeof method)}
            className={`pill cursor-pointer border ${method === m.key ? "border-aqua-500 bg-aqua-500/15 text-aqua-400" : "border-ink-600 text-ink-600"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {method === "zscore" && (
        <div className="mb-4 flex gap-2">
          {PARAMETER_KEYS.map((p) => (
            <button
              key={p}
              onClick={() => setParam(p)}
              className={`pill cursor-pointer border ${param === p ? "border-aqua-500 bg-aqua-500/15 text-aqua-400" : "border-ink-600 text-ink-600"}`}
            >
              {PARAMETER_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : data.length === 0 ? (
        <EmptyState message="Aucune anomalie détectée sur la période sélectionnée (ou données insuffisantes pour entraîner le modèle)." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-800/60 text-ink-600">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                {method === "zscore" ? (
                  <>
                    <th className="px-4 py-2.5">Valeur</th>
                    <th className="px-4 py-2.5">Z-score</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-2.5">Valeurs</th>
                    <th className="px-4 py-2.5">{method === "isolation_forest" ? "Score d'anomalie" : "Erreur de reconstruction"}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-t border-ink-700">
                  <td className="px-4 py-2">{new Date(row.created_at).toLocaleString("fr-FR")}</td>
                  {method === "zscore" ? (
                    <>
                      <td className="px-4 py-2 font-mono text-coral-400">{row.value}</td>
                      <td className="px-4 py-2 font-mono">{row.z_score}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono">
                        {Object.entries(row.values as Record<string, number>)
                          .map(([k, v]) => `${k}=${v.toFixed(2)}`)
                          .join(", ")}
                      </td>
                      <td className="px-4 py-2 font-mono text-coral-400">
                        {method === "isolation_forest" ? row.anomaly_score : row.reconstruction_error}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NullAlertsTab() {
  const [status, setStatus] = useState<string>("");
  const { data, error, isLoading } = useSWR(["null-alerts", status], () =>
    api.alerts({ status: status || undefined, limit: 500 }) as Promise<SensorAlert[]>
  );

  const { data: config } = useSWR("alert-config", () => api.alertConfig() as Promise<{ null_capture_threshold: number }>);

  const active = data?.filter((a) => a.status === "active") ?? [];
  const critical = active.filter((a) => a.severity === "critical");

  return (
    <div>
      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Alertes actives" value={active.length} tone={active.length ? "warn" : "good"} />
        <StatCard label="Critiques" value={critical.length} tone={critical.length ? "bad" : "good"} />
        <StatCard label="Seuil configuré" value={config?.null_capture_threshold ?? "—"} hint="captures nulles consécutives" />
      </div>

      <div className="mb-4 flex gap-2">
        {[
          { key: "", label: "Toutes" },
          { key: "active", label: "Actives" },
          { key: "resolved", label: "Résolues" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setStatus(s.key)}
            className={`pill cursor-pointer border ${status === s.key ? "border-aqua-500 bg-aqua-500/15 text-aqua-400" : "border-ink-600 text-ink-600"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : data.length === 0 ? (
        <EmptyState message="Aucune alerte." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-800/60 text-ink-600">
              <tr>
                <th className="px-4 py-2.5">Capteur</th>
                <th className="px-4 py-2.5">Captures nulles</th>
                <th className="px-4 py-2.5">Sévérité</th>
                <th className="px-4 py-2.5">Statut</th>
                <th className="px-4 py-2.5">Message</th>
                <th className="px-4 py-2.5">Déclenchée le</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-t border-ink-700">
                  <td className="px-4 py-2">SET {a.set_number} / {a.parameter}</td>
                  <td className="px-4 py-2 font-mono">{a.consecutive_count}</td>
                  <td className="px-4 py-2">
                    <span className={`pill ${a.severity === "critical" ? "bg-coral-500/15 text-coral-400 border border-coral-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30"}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`pill ${a.status === "active" ? "bg-coral-500/15 text-coral-400 border border-coral-500/30" : "bg-aqua-500/15 text-aqua-400 border border-aqua-500/30"}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-ink-500">{a.message}</td>
                  <td className="px-4 py-2">{new Date(a.created_at).toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
