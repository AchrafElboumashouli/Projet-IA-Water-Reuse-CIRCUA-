"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Droplets } from "lucide-react";
import { api } from "@/lib/api";
import FilterBar, { Filters } from "@/components/FilterBar";
import Plot from "@/components/PlotlyChart";
import { PageHeader, LoadingState, ErrorState, StatCard, EmptyState } from "@/components/ui";
import { NormsSpec, PARAMETER_KEYS, PARAMETER_LABELS, RawSensorData, evaluateCompliance } from "@/lib/compliance";

export default function QualitePage() {
  const [filters, setFilters] = useState<Filters>({});

  const { data: norms } = useSWR("norms", () => api.norms() as Promise<Record<string, NormsSpec>>);
  const { data: history, error, isLoading } = useSWR(["quality-history", filters], () =>
    api.history({
      set_number: filters.setNumber,
      start_date: filters.startDate,
      end_date: filters.endDate,
      plant_type: filters.plantType,
      limit: 5000,
    }) as Promise<{ count: number; data: RawSensorData[] }>
  );

  const { data: qualityReport } = useSWR(["quality-report", filters], () =>
    api.qualityReport({ set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate })
  );

  const complianceRates = useMemo(() => {
    if (!history?.data || !norms) return null;
    const rows = history.data;
    const rates: Record<string, { both: number; partial: number; none: number; total: number }> = {};
    PARAMETER_KEYS.forEach((param) => {
      let both = 0, partial = 0, none = 0, total = 0;
      rows.forEach((r) => {
        const value = r[param];
        if (value === null || value === undefined) return;
        total++;
        const status = evaluateCompliance(param, value, norms[param]);
        if (status === "both") both++;
        else if (status === "none") none++;
        else partial++;
      });
      rates[param] = { both, partial, none, total };
    });
    return rates;
  }, [history, norms]);

  return (
    <div>
      <PageHeader title="Qualité de l'eau" subtitle="Taux de conformité aux normes & qualité des données sur la période" icon={Droplets} />
      <FilterBar filters={filters} onChange={setFilters} showPlantType />

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !complianceRates ? (
        <LoadingState />
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {PARAMETER_KEYS.map((param) => {
            const r = complianceRates[param];
            if (!r || r.total === 0) return <EmptyState key={param} message={`${PARAMETER_LABELS[param]} : pas de données`} />;
            const pctBoth = Math.round((r.both / r.total) * 100);
            const pctPartial = Math.round((r.partial / r.total) * 100);
            const pctNone = 100 - pctBoth - pctPartial;
            return (
              <div key={param} className="card p-5">
                <h3 className="mb-3 text-sm font-semibold text-white">{PARAMETER_LABELS[param]}</h3>
                <Plot
                  data={[
                    {
                      values: [r.both, r.partial, r.none],
                      labels: ["Conforme MA+EU", "Conforme partiel", "Non conforme"],
                      type: "pie",
                      hole: 0.6,
                      marker: { colors: ["#2dd4bf", "#f59e0b", "#f43f5e"] },
                      textinfo: "percent",
                    },
                  ]}
                  layout={{
                    autosize: true,
                    height: 220,
                    margin: { t: 10, r: 10, l: 10, b: 10 },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    font: { color: "#9fb8b3", size: 10 },
                    showlegend: true,
                    legend: { orientation: "h", y: -0.1, font: { size: 9 } },
                  }}
                  useResizeHandler
                  style={{ width: "100%" }}
                  config={{ displaylogo: false }}
                />
                <p className="mt-2 text-center text-xs text-ink-600">
                  {pctBoth}% conforme aux deux normes · n={r.total}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Rapport de qualité des données</h3>
        {!qualityReport ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {PARAMETER_KEYS.map((param) => {
              const p = (qualityReport as any).parameters?.[param];
              if (!p) return null;
              return (
                <StatCard
                  key={param}
                  label={PARAMETER_LABELS[param]}
                  value={`${p.completeness_pct ?? "—"}%`}
                  hint={`${p.missing} valeur(s) manquante(s)`}
                  tone={p.completeness_pct >= 95 ? "good" : p.completeness_pct >= 80 ? "warn" : "bad"}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
