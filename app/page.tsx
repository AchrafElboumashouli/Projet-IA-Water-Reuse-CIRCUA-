"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Download, Radio, Waves } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCSV, downloadPlotAsPNG } from "@/lib/exportUtils";
import { useLiveSocket } from "@/hooks/useLiveSocket";
import FilterBar, { Filters } from "@/components/FilterBar";
import ComplianceBadge from "@/components/ComplianceBadge";
import Plot from "@/components/PlotlyChart";
import { PageHeader, StatCard, LoadingState, ErrorState, EmptyState } from "@/components/ui";
import { LatestReading, PARAMETER_KEYS, PARAMETER_LABELS, ParameterKey, RawSensorData } from "@/types";

export default function OverviewPage() {
  const [filters, setFilters] = useState<Filters>({});
  const [liveTick, setLiveTick] = useState(0);
  const plotRefs = useRef<Record<string, HTMLElement | null>>({});

  const { connected } = useLiveSocket(() => setLiveTick((t) => t + 1));

  const { data: latest, error: latestErr, mutate: refetchLatest } = useSWR<LatestReading[]>(
    ["latest", filters.setNumber],
    () => api.latest(filters.setNumber) as Promise<LatestReading[]>,
    { refreshInterval: 20000 }
  );

  useEffect(() => {
    refetchLatest();
  }, [liveTick, refetchLatest]);

  const { data: history, error: historyErr, isLoading: historyLoading } = useSWR(
    ["history", filters],
    () =>
      api.history({
        set_number: filters.setNumber,
        start_date: filters.startDate,
        end_date: filters.endDate,
        plant_type: filters.plantType,
        limit: 5000,
      }) as Promise<{ count: number; data: RawSensorData[] }>
  );

  const rows = history?.data ?? [];

  function exportParamCSV(param: ParameterKey) {
    downloadCSV(
      `${param}_historique`,
      rows.map((r) => ({ created_at: r.created_at, set_number: r.set_number, [param]: r[param] }))
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader
          title="Monitoring en temps réel"
          subtitle="Suivi live & historique des paramètres capteurs"
          icon={Waves}
        />
        <span className={`pill ${connected ? "bg-aqua-500/15 text-aqua-400 border border-aqua-500/30" : "bg-ink-700/50 text-ink-600 border border-ink-600"}`}>
          <Radio size={12} className={connected ? "animate-pulse" : ""} />
          {connected ? "Flux temps réel actif" : "Reconnexion..."}
        </span>
      </div>

      <FilterBar filters={filters} onChange={setFilters} showPlantType />

      {/* Cartes de conformité — dernière donnée reçue */}
      {latestErr ? (
        <ErrorState message={String(latestErr.message || latestErr)} />
      ) : !latest ? (
        <LoadingState message="Chargement des dernières mesures..." />
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {latest.map((entry) => (
            <div key={entry.set_number} className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">SET {entry.set_number}</h3>
                <span className="text-[11px] text-ink-600">{new Date(entry.created_at).toLocaleString("fr-FR")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PARAMETER_KEYS.map((param) => (
                  <div key={param} className="rounded-xl border border-ink-700 bg-ink-800/50 p-3">
                    <p className="text-[11px] text-ink-600">{PARAMETER_LABELS[param]}</p>
                    <p className="stat-value text-lg text-white">{entry[param] ?? "—"}</p>
                    <div className="mt-1.5">
                      <ComplianceBadge compliance={entry.compliance[param]} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Graphes historiques par paramètre */}
      {historyErr ? (
        <ErrorState message={String(historyErr.message || historyErr)} />
      ) : historyLoading ? (
        <LoadingState message="Chargement de l'historique..." />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucune donnée pour les filtres sélectionnés." />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {PARAMETER_KEYS.map((param) => {
            const bySet = new Map<number, RawSensorData[]>();
            rows.forEach((r) => {
              const arr = bySet.get(r.set_number) ?? [];
              arr.push(r);
              bySet.set(r.set_number, arr);
            });

            return (
              <div key={param} className="card">
                <div className="card-header">
                  <h3 className="text-sm font-semibold text-white">{PARAMETER_LABELS[param]}</h3>
                  <div className="flex gap-2">
                    <button
                      className="btn-ghost !px-2 !py-1 text-xs"
                      onClick={() => downloadPlotAsPNG(plotRefs.current[param], `${param}_courbe`)}
                    >
                      <Download size={13} /> PNG
                    </button>
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => exportParamCSV(param)}>
                      <Download size={13} /> Excel/CSV
                    </button>
                  </div>
                </div>
                <div ref={(el) => { plotRefs.current[param] = el; }} className="px-2 py-2">
                  <Plot
                    data={Array.from(bySet.entries()).map(([setNum, data]) => ({
                      x: data.map((d) => d.created_at),
                      y: data.map((d) => d[param]),
                      type: "scatter",
                      mode: "lines",
                      name: `SET ${setNum}`,
                      line: { width: 2 },
                    }))}
                    layout={{
                      autosize: true,
                      height: 300,
                      margin: { t: 10, r: 10, l: 45, b: 35 },
                      paper_bgcolor: "transparent",
                      plot_bgcolor: "transparent",
                      font: { color: "#9fb8b3", size: 11 },
                      xaxis: { gridcolor: "#173430" },
                      yaxis: { gridcolor: "#173430" },
                      legend: { orientation: "h", y: -0.2 },
                    }}
                    useResizeHandler
                    style={{ width: "100%" }}
                    config={{ displaylogo: false }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
