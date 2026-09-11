"use client";

import { useState } from "react";
import useSWR from "swr";
import { Activity } from "lucide-react";
import { api } from "@/lib/api";
import FilterBar, { Filters } from "@/components/FilterBar";
import Plot from "@/components/PlotlyChart";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/ui";
import { PARAMETER_KEYS, PARAMETER_LABELS, ParameterKey } from "@/types";

const TABS = ["Histogrammes", "Corrélations (Heatmap)", "Boxplots", "Timeline", "ACP (PCA)"] as const;
type Tab = (typeof TABS)[number];

export default function AnalysePage() {
  const [filters, setFilters] = useState<Filters>({});
  const [tab, setTab] = useState<Tab>("Histogrammes");
  const [param, setParam] = useState<ParameterKey>("ph");
  const [corrMethod, setCorrMethod] = useState<"pearson" | "spearman">("pearson");

  return (
    <div>
      <PageHeader title="Analyse scientifique avancée" subtitle="EDA : histogrammes, corrélations, boxplot, timeline" icon={Activity} />
      <FilterBar filters={filters} onChange={setFilters} />

      <div className="mb-6 flex gap-2 border-b border-ink-700 pb-px">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              tab === t ? "border-b-2 border-aqua-500 text-aqua-400" : "text-ink-600 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {(tab === "Histogrammes" || tab === "Timeline") && (
        <div className="mb-4 flex gap-2">
          {PARAMETER_KEYS.map((p) => (
            <button
              key={p}
              onClick={() => setParam(p)}
              className={`pill cursor-pointer border ${
                param === p ? "border-aqua-500 bg-aqua-500/15 text-aqua-400" : "border-ink-600 text-ink-600 hover:text-white"
              }`}
            >
              {PARAMETER_LABELS[p]}
            </button>
          ))}
        </div>
      )}

      {tab === "Histogrammes" && <HistogramView filters={filters} param={param} />}
      {tab === "Corrélations (Heatmap)" && <CorrelationView filters={filters} method={corrMethod} setMethod={setCorrMethod} />}
      {tab === "Boxplots" && <BoxplotView filters={filters} />}
      {tab === "Timeline" && <TimelineView filters={filters} param={param} />}
      {tab === "ACP (PCA)" && <PcaView filters={filters} />}
    </div>
  );
}

function HistogramView({ filters, param }: { filters: Filters; param: ParameterKey }) {
  const { data, error, isLoading } = useSWR(["hist", filters, param], () =>
    api.histogram({ parameter: param, set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate, bins: 25 }) as Promise<{
      bin_edges: number[];
      counts: number[];
    }>
  );
  if (error) return <ErrorState message={String(error.message || error)} />;
  if (isLoading || !data) return <LoadingState />;
  if (!data.counts.length) return <EmptyState message="Pas assez de données." />;

  const centers = data.bin_edges.slice(0, -1).map((e, i) => (e + data.bin_edges[i + 1]) / 2);

  return (
    <div className="card p-4">
      <Plot
        data={[{ x: centers, y: data.counts, type: "bar", marker: { color: "#2dd4bf" } }]}
        layout={chartLayout(320)}
        useResizeHandler
        style={{ width: "100%" }}
        config={{ displaylogo: false }}
      />
    </div>
  );
}

function CorrelationView({
  filters,
  method,
  setMethod,
}: {
  filters: Filters;
  method: "pearson" | "spearman";
  setMethod: (m: "pearson" | "spearman") => void;
}) {
  const { data, error, isLoading } = useSWR(["corr", filters, method], () =>
    api.correlation({ method, set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate }) as Promise<{
      parameters: string[];
      matrix: number[][];
    }>
  );

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(["pearson", "spearman"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`pill cursor-pointer border ${
              method === m ? "border-aqua-500 bg-aqua-500/15 text-aqua-400" : "border-ink-600 text-ink-600"
            }`}
          >
            {m === "pearson" ? "Pearson" : "Spearman"}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : !data.matrix.length ? (
        <EmptyState message="Pas assez de données." />
      ) : (
        <div className="card p-4">
          <Plot
            data={[
              {
                z: data.matrix,
                x: data.parameters.map((p) => PARAMETER_LABELS[p as ParameterKey] ?? p),
                y: data.parameters.map((p) => PARAMETER_LABELS[p as ParameterKey] ?? p),
                type: "heatmap",
                colorscale: "Viridis",
                zmin: -1,
                zmax: 1,
                text: data.matrix.map((row) => row.map((v) => v.toFixed(2))),
                texttemplate: "%{text}",
              },
            ]}
            layout={chartLayout(400)}
            useResizeHandler
            style={{ width: "100%" }}
            config={{ displaylogo: false }}
          />
        </div>
      )}
    </div>
  );
}

function BoxplotView({ filters }: { filters: Filters }) {
  const { data, error, isLoading } = useSWR(["boxplot", filters], () =>
    api.boxplot({ set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate }) as Promise<
      Record<string, { min: number; q1: number; median: number; q3: number; max: number; outliers: number[] } | null>
    >
  );

  if (error) return <ErrorState message={String(error.message || error)} />;
  if (isLoading || !data) return <LoadingState />;

  const PARAM_COLOR: Record<string, string> = {
    ph: "#2dd4bf", temperature: "#f59e0b", ec: "#818cf8", turbidity: "#fb7185", do: "#4ade80",
  };

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {PARAMETER_KEYS.map((param) => {
        const box = data[param];
        const hasBox = box && box.min !== null && box.min !== undefined;
        const color = PARAM_COLOR[param] ?? "#2dd4bf";
        return (
          <div key={param} className="card p-4">
            <h3 className="mb-2 text-sm font-semibold text-white">{PARAMETER_LABELS[param]}</h3>
            {!hasBox ? (
              <EmptyState message="Pas assez de données pour ce paramètre sur la période sélectionnée." />
            ) : (
              <Plot
                data={[
                  {
                    type: "box",
                    name: PARAMETER_LABELS[param],
                    x: [PARAMETER_LABELS[param]],
                    q1: [box.q1],
                    median: [box.median],
                    q3: [box.q3],
                    lowerfence: [box.min],
                    upperfence: [box.max],
                    y: box.outliers.length ? [box.outliers] : undefined,
                    boxpoints: box.outliers.length ? "outliers" : false,
                    jitter: 0.4,
                    marker: { color, size: 5 },
                    line: { color, width: 2 },
                    fillcolor: color + "40",
                    width: 0.4,
                    showlegend: false,
                  },
                ]}
                layout={{
                  ...chartLayout(280),
                  xaxis: { gridcolor: "#173430", type: "category" },
                  yaxis: { gridcolor: "#173430", zeroline: false },
                }}
                useResizeHandler
                style={{ width: "100%" }}
                config={{ displaylogo: false }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimelineView({ filters, param }: { filters: Filters; param: ParameterKey }) {
  const { data, error, isLoading } = useSWR(["timeline", filters, param], () =>
    api.timeline({ parameter: param, set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate, window: 10 }) as Promise<
      { created_at: string; value: number; rolling_avg: number }[]
    >
  );

  if (error) return <ErrorState message={String(error.message || error)} />;
  if (isLoading || !data) return <LoadingState />;
  if (!data.length) return <EmptyState message="Pas assez de données." />;

  return (
    <div className="card p-4">
      <Plot
        data={[
          { x: data.map((d) => d.created_at), y: data.map((d) => d.value), type: "scatter", mode: "markers", name: "Mesures", marker: { size: 4, color: "#173430" } },
          { x: data.map((d) => d.created_at), y: data.map((d) => d.rolling_avg), type: "scatter", mode: "lines", name: "Tendance (moy. mobile)", line: { color: "#2dd4bf", width: 2 } },
        ]}
        layout={chartLayout(380)}
        useResizeHandler
        style={{ width: "100%" }}
        config={{ displaylogo: false }}
      />
    </div>
  );
}

function chartLayout(height: number) {
  return {
    autosize: true,
    height,
    margin: { t: 20, r: 20, l: 50, b: 40 },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { color: "#9fb8b3", size: 11 },
    xaxis: { gridcolor: "#173430" },
    yaxis: { gridcolor: "#173430" },
    legend: { orientation: "h" as const, y: -0.2 },
  };
}function PcaView({ filters }: { filters: Filters }) {
  const { data, error, isLoading } = useSWR(["pca", filters], () =>
    api.pca({ set_number: filters.setNumber, start_date: filters.startDate, end_date: filters.endDate }) as Promise<{
      error?: string;
      explained_variance_ratio?: number[];
      components?: { created_at: string | null; set_number: number | null; [key: `PC${number}`]: number }[];
      loadings?: Record<string, number[]>;
    }>
  );

  if (isLoading || !data) return <LoadingState />;
  if (error) return <ErrorState message="Erreur lors du calcul de l'ACP." />;
  if (data.error) return <EmptyState message={data.error} />;

  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold text-white">
        ACP sur les 5 paramètres (pH, température, EC, turbidité, OD)
      </h3>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {data.explained_variance_ratio?.map((v, i) => (
          <div key={i} className="rounded-lg border border-ink-700 p-3">
            <p className="text-xs text-ink-600">Variance PC{i + 1}</p>
            <p className="stat-value text-lg text-white">{(v * 100).toFixed(1)}%</p>
          </div>
        ))}
      </div>
      <Plot
        data={[1, 2].map((setNum) => {
          const pts = data.components?.filter((c) => c.set_number === setNum) ?? [];
          return {
            x: pts.map((c) => c["PC1"]),
            y: pts.map((c) => c["PC2"]),
            text: pts.map((c) => c.created_at ?? ""),
            mode: "markers",
            type: "scatter",
            marker: { size: 6, opacity: 0.7 },
            name: `SET ${setNum}`,
          };
        })}
        layout={{
          autosize: true,
          height: 420,
          margin: { t: 20, r: 20, l: 50, b: 50 },
          paper_bgcolor: "transparent",
          plot_bgcolor: "transparent",
          font: { color: "#9fb8b3", size: 11 },
          xaxis: { title: "PC1", gridcolor: "#173430" },
          yaxis: { title: "PC2", gridcolor: "#173430" },
        }}
        useResizeHandler
        style={{ width: "100%" }}
        config={{ displaylogo: false }}
      />
      {data.loadings && (
        <table className="mt-4 w-full text-left text-xs">
          <thead className="text-ink-600">
            <tr>
              <th className="py-1.5">Paramètre</th>
              {data.explained_variance_ratio?.map((_, i) => (
                <th key={i} className="py-1.5">PC{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.loadings).map(([parameter, vals]) => (
              <tr key={parameter} className="border-t border-ink-700">
                <td className="py-1.5">{PARAMETER_LABELS[parameter as ParameterKey] ?? parameter}</td>
                {vals.map((v, i) => (
                  <td key={i} className="py-1.5 font-mono">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}