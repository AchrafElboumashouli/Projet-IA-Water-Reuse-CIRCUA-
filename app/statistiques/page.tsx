"use client";

import { useState } from "react";
import useSWR from "swr";
import { BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import FilterBar, { Filters } from "@/components/FilterBar";
import { PageHeader, StatCard, LoadingState, ErrorState } from "@/components/ui";
import { GlobalStats, DescriptiveStats, PARAMETER_KEYS, PARAMETER_LABELS } from "@/types";

export default function StatistiquesPage() {
  const [filters, setFilters] = useState<Filters>({});

  const { data, error, isLoading } = useSWR(["global-stats", filters], () =>
    api.globalStats({ set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate }) as Promise<GlobalStats>
  );

  return (
    <div>
      <PageHeader title="Statistiques globales" subtitle="Vue d'ensemble quantitative de toutes les mesures" icon={BarChart3} />
      <FilterBar filters={filters} onChange={setFilters} />

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total mesures" value={data.total_rows} tone="good" />
            <StatCard
              label="Période"
              value={data.date_range?.from ? new Date(data.date_range.from).toLocaleDateString("fr-FR") : "—"}
              hint={data.date_range?.to ? `au ${new Date(data.date_range.to).toLocaleDateString("fr-FR")}` : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {PARAMETER_KEYS.map((param) => {
              const stats = data[param] as DescriptiveStats | undefined;
              if (!stats) return null;
              return (
                <div key={param} className="card p-5">
                  <h3 className="mb-3 text-sm font-semibold text-white">{PARAMETER_LABELS[param]}</h3>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <MiniStat label="Min" value={stats.min} />
                    <MiniStat label="Moyenne" value={stats.mean} tone="good" />
                    <MiniStat label="Max" value={stats.max} />
                    <MiniStat label="Médiane" value={stats.median} />
                    <MiniStat label="Écart-type" value={stats.std} />
                    <MiniStat label="IQR" value={stats.iqr} />
                    <MiniStat label="Q1" value={stats.q1} />
                    <MiniStat label="Q3" value={stats.q3} />
                    <MiniStat label="N" value={stats.count} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number | null | undefined; tone?: "good" }) {
  return (
    <div className="rounded-lg bg-ink-800/60 py-2">
      <p className="text-[10px] uppercase text-ink-600">{label}</p>
      <p className={`font-mono text-sm font-semibold ${tone === "good" ? "text-aqua-400" : "text-white"}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}
