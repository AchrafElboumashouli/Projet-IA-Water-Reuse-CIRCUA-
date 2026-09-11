"use client";

import { useState } from "react";
import useSWR from "swr";
import { GitCompare } from "lucide-react";
import { api } from "@/lib/api";
import Plot from "@/components/PlotlyChart";
import { PageHeader, LoadingState, ErrorState, EmptyState, StatCard } from "@/components/ui";
import { PARAMETER_KEYS, PARAMETER_LABELS, ParameterKey, Study } from "@/types";

const CYCLE_PARAMETERS = ["COD (mg/L)", "BOD (mg/L)", "TSS (mg/L)", "pH", "Temperature (°C)", "EC (µS/cm)", "Turbidity (NTU)", "DO (mg/L)"];

export default function ComparaisonPage() {
  const [tab, setTab] = useState<"sets" | "inout">("sets");

  return (
    <div>
      <PageHeader title="Comparaison" subtitle="SET 1 vs SET 2, et IN vs OUT CONTROL vs OUT PLANT" icon={GitCompare} />

      <div className="mb-6 flex gap-2 border-b border-ink-700 pb-px">
        <button
          onClick={() => setTab("sets")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === "sets" ? "border-b-2 border-aqua-500 text-aqua-400" : "text-ink-600"}`}
        >
          SET 1 vs SET 2
        </button>
        <button
          onClick={() => setTab("inout")}
          className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === "inout" ? "border-b-2 border-aqua-500 text-aqua-400" : "text-ink-600"}`}
        >
          IN vs OUT CONTROL vs OUT PLANT
        </button>
      </div>

      {tab === "sets" ? <SetsComparison /> : <InOutComparison />}
    </div>
  );
}

function SetsComparison() {
  const [param, setParam] = useState<ParameterKey>("ph");

  const { data, error, isLoading } = useSWR(["compare-sets", param], () =>
    api.compareSets({ parameter: param }) as Promise<{
      error?: string;
      set1?: { count: number; mean: number; std: number };
      set2?: { count: number; mean: number; std: number };
      t_statistic?: number;
      p_value?: number;
      significant_difference?: boolean;
    }>
  );


  const { data: drift } = useSWR("drift", () =>
    api.drift({}) as Promise<Record<string, { ks_statistic?: number; p_value?: number; drift_detected?: boolean; status?: string }>>
  );

  return (
    <div>
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

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : data.error ? (
        <EmptyState message={data.error} />
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="SET 1 — moyenne" value={data.set1!.mean} hint={`n=${data.set1!.count}, σ=${data.set1!.std}`} />
          <StatCard label="SET 2 — moyenne" value={data.set2!.mean} hint={`n=${data.set2!.count}, σ=${data.set2!.std}`} />
          <StatCard label="Test t (Welch)" value={data.t_statistic!} hint={`p=${data.p_value}`} />
          <StatCard
            label="Différence significative"
            value={data.significant_difference ? "Oui (p<0.05)" : "Non"}
            tone={data.significant_difference ? "warn" : "good"}
          />
        </div>
      )}

      <h3 className="mb-3 text-sm font-semibold text-white">Dérive entre SET 1 et SET 2 (test Kolmogorov-Smirnov)</h3>
      {!drift ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PARAMETER_KEYS.map((p) => {
            const d = drift[p];
            if (!d) return null;
            return (
              <div key={p} className="card p-4">
                <p className="text-xs text-ink-600">{PARAMETER_LABELS[p]}</p>
                {d.status === "insufficient_data" ? (
                  <p className="mt-1 text-xs text-ink-600">Données insuffisantes</p>
                ) : (
                  <>
                    <p className={`stat-value text-lg ${d.drift_detected ? "text-coral-400" : "text-aqua-400"}`}>
                      {d.drift_detected ? "Dérive détectée" : "Stable"}
                    </p>
                    <p className="text-[11px] text-ink-600">KS={d.ks_statistic}, p={d.p_value}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InOutComparison() {
  const [studyId, setStudyId] = useState<number | null>(null);
  const [param, setParam] = useState(CYCLE_PARAMETERS[3]); // pH by default

  const { data: studies } = useSWR("studies-list", () => api.listStudies() as Promise<Study[]>);

  const { data: descriptive, isLoading: loadingDesc } = useSWR(
    studyId ? ["comp-desc", studyId, param] : null,
    () => api.comparisonDescriptive(studyId as number, param) as Promise<Record<string, { count: number; mean?: number; std?: number; min?: number; max?: number }>>
  );

  const { data: anova, isLoading: loadingAnova } = useSWR(
    studyId ? ["comp-anova", studyId, param] : null,
    () => api.comparisonAnova(studyId as number, param) as Promise<{
      error?: string;
      anova_f_statistic?: number;
      anova_p_value?: number;
      significant_difference?: boolean;
      tukey_hsd?: { group1: string; group2: string; meandiff: number; p_adj: number; reject_h0: boolean }[] | { error: string };
    }>
  );

  const { data: removal } = useSWR(studyId ? ["removal", studyId] : null, () =>
    api.removalSummary(studyId as number) as Promise<{ parameter: string; stage: string; mean: number; std: number; count: number }[]>
  );


  const { data: pca, isLoading: loadingPca } = useSWR(studyId ? ["comp-pca", studyId] : null, () =>
  api.comparisonPca(studyId as number) as Promise<{
    error?: string;
    explained_variance_ratio?: number[];
    components?: { cycle_id: number; stage: string; [key: `PC${number}`]: number }[];
    loadings?: Record<string, number[]>;
  }>
);
  return (
    <div>
      <div className="card mb-6 flex flex-wrap items-end gap-4 px-5 py-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-ink-600">Étude</label>
          <select className="input" value={studyId ?? ""} onChange={(e) => setStudyId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sélectionner une étude...</option>
            {studies?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.study_name} ({s.plant_type})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-ink-600">Paramètre (cycle labo)</label>
          <select className="input" value={param} onChange={(e) => setParam(e.target.value)}>
            {CYCLE_PARAMETERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!studyId ? (
        <EmptyState message="Choisissez une étude pour lancer la comparaison IN vs OUT CONTROL vs OUT PLANT." />
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {loadingDesc || !descriptive
              ? <LoadingState />
              : (["IN", "OUT_CONTROL", "OUT_PLANT"] as const).map((stage) => {
                  const s = descriptive[stage];
                  return (
                    <div key={stage} className="card p-4">
                      <p className="text-xs font-semibold text-aqua-400">{stage.replace("_", " ")}</p>
                      {!s || s.count === 0 ? (
                        <p className="mt-1 text-xs text-ink-600">Pas de données</p>
                      ) : (
                        <>
                          <p className="stat-value text-lg text-white">{s.mean}</p>
                          <p className="text-[11px] text-ink-600">
                            n={s.count}, σ={s.std}, [{s.min} — {s.max}]
                          </p>
                        </>
                      )}
                    </div>
                  );
                })}
          </div>

          <div className="card mb-8 p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">ANOVA + Tukey HSD — différence IN / OUT CONTROL / OUT PLANT</h3>
            {loadingAnova || !anova ? (
              <LoadingState />
            ) : anova.error ? (
              <EmptyState message={anova.error} />
            ) : (
              <>
                <div className="mb-4 grid grid-cols-3 gap-4">
                  <StatCard label="F-statistique" value={anova.anova_f_statistic!} />
                  <StatCard label="p-value" value={anova.anova_p_value!} />
                  <StatCard
                    label="Hypothèse validée"
                    value={anova.significant_difference ? "Différence significative" : "Pas de différence"}
                    tone={anova.significant_difference ? "good" : "warn"}
                  />
                </div>
                {Array.isArray(anova.tukey_hsd) && (
                  <table className="w-full text-left text-xs">
                    <thead className="text-ink-600">
                      <tr>
                        <th className="py-1.5">Groupe 1</th>
                        <th className="py-1.5">Groupe 2</th>
                        <th className="py-1.5">Diff. moyenne</th>
                        <th className="py-1.5">p (ajusté)</th>
                        <th className="py-1.5">Significatif</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anova.tukey_hsd.map((row, i) => (
                        <tr key={i} className="border-t border-ink-700">
                          <td className="py-1.5">{row.group1}</td>
                          <td className="py-1.5">{row.group2}</td>
                          <td className="py-1.5 font-mono">{row.meandiff}</td>
                          <td className="py-1.5 font-mono">{row.p_adj}</td>
                          <td className={`py-1.5 ${row.reject_h0 ? "text-aqua-400" : "text-ink-600"}`}>{row.reject_h0 ? "Oui" : "Non"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>

          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold text-white">% d&apos;abattement (removal) moyen par paramètre / stage</h3>
            {!removal ? (
              <LoadingState />
            ) : removal.length === 0 ? (
              <EmptyState message="Pas de données de removal pour cette étude." />
            ) : (
              <Plot
                data={["OUT_CONTROL", "OUT_PLANT"].map((stage) => ({
                  x: removal.filter((r) => r.stage === stage).map((r) => r.parameter),
                  y: removal.filter((r) => r.stage === stage).map((r) => r.mean),
                  type: "bar",
                  name: stage,
                }))}
                layout={{
                  autosize: true,
                  height: 340,
                  barmode: "group",
                  margin: { t: 20, r: 20, l: 50, b: 90 },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  font: { color: "#9fb8b3", size: 11 },
                  xaxis: { gridcolor: "#173430" },
                  yaxis: { gridcolor: "#173430", title: "% abattement" },
                }}
                useResizeHandler
                style={{ width: "100%" }}
                config={{ displaylogo: false }}
              />
            )}
          </div>
          <div className="card mt-8 p-5">
  <h3 className="mb-3 text-sm font-semibold text-white">
    ACP (PCA) — variance expliquée sur l&apos;ensemble des paramètres du cycle
  </h3>
  {loadingPca || !pca ? (
    <LoadingState />
  ) : pca.error ? (
    <EmptyState message={pca.error} />
  ) : (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {pca.explained_variance_ratio?.map((v, i) => (
          <StatCard key={i} label={`Variance PC${i + 1}`} value={`${(v * 100).toFixed(1)}%`} />
        ))}
      </div>
      <Plot
        data={["IN", "OUT_CONTROL", "OUT_PLANT"].map((stage) => {
          const pts = pca.components?.filter((c) => c.stage === stage) ?? [];
          return {
            x: pts.map((c) => c["PC1"]),
            y: pts.map((c) => c["PC2"]),
            text: pts.map((c) => `Cycle ${c.cycle_id}`),
            mode: "markers",
            type: "scatter",
            marker: { size: 10 },
            name: stage,
          };
        })}
        layout={{
          autosize: true,
          height: 380,
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
      {pca.loadings && (
        <table className="mt-4 w-full text-left text-xs">
          <thead className="text-ink-600">
            <tr>
              <th className="py-1.5">Paramètre</th>
              {pca.explained_variance_ratio?.map((_, i) => (
                <th key={i} className="py-1.5">PC{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(pca.loadings).map(([parameter, vals]) => (
              <tr key={parameter} className="border-t border-ink-700">
                <td className="py-1.5">{parameter}</td>
                {vals.map((v, i) => (
                  <td key={i} className="py-1.5 font-mono">{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )}
</div>
        </>
      
      )}
    </div>
  );
}
