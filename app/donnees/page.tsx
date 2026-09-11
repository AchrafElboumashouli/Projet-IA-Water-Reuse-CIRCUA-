"use client";

import { useState } from "react";
import useSWR from "swr";
import { Database, Download } from "lucide-react";
import { api } from "@/lib/api";
import FilterBar, { Filters } from "@/components/FilterBar";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/ui";
import { RawSensorData } from "@/types";

const PAGE_SIZE = 50;

export default function DonneesPage() {
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);

  const { data, error, isLoading } = useSWR(["data-table", filters, page], () =>
    api.dataTable({
      set_number: filters.setNumber,
      start_date: filters.startDate,
      end_date: filters.endDate,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    }) as Promise<{ count: number; data: RawSensorData[] }>
  );

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Tableau de données" subtitle="Toutes les mesures entrées dans le système depuis le début" icon={Database} />
        <a
          href={api.exportUrl({ set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate })}
          className="btn"
        >
          <Download size={15} /> Exporter en CSV
        </a>
      </div>

      <FilterBar filters={filters} onChange={(f) => { setFilters(f); setPage(0); }} />

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : data.data.length === 0 ? (
        <EmptyState message="Aucune donnée pour les filtres sélectionnés." />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-ink-800/60 text-ink-600">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Set</th>
                  <th className="px-3 py-2">Étude</th>
                  <th className="px-3 py-2">pH</th>
                  <th className="px-3 py-2">Temp. (°C)</th>
                  <th className="px-3 py-2">EC (µS/cm)</th>
                  <th className="px-3 py-2">Turbidité</th>
                  <th className="px-3 py-2">DO (mg/L)</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => (
                  <tr key={r.id} className="border-t border-ink-700">
                    <td className="px-3 py-1.5 font-mono">{r.id}</td>
                    <td className="px-3 py-1.5">{new Date(r.created_at).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-1.5">SET {r.set_number}</td>
                    <td className="px-3 py-1.5">{r.study_id ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{r.ph ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{r.temperature ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{r.ec ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{r.turbidity ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono">{r.do ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-ink-600">
            <span>
              {data.count} ligne(s) au total — page {page + 1} / {Math.max(totalPages, 1)}
            </span>
            <div className="flex gap-2">
              <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Précédent
              </button>
              <button className="btn-ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Suivant
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
