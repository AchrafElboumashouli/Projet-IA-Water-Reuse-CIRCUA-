"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Beaker, BarChart3, Plus, Upload } from "lucide-react";
import { api } from "@/lib/api";
import Plot from "@/components/PlotlyChart";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/ui";
import { CycleDetail, CycleSummary, Study } from "@/types";

const PARAMETERS = ["COD (mg/L)", "BOD (mg/L)", "TSS (mg/L)", "pH", "Temperature (°C)", "EC (µS/cm)", "Turbidity (NTU)", "DO (mg/L)"];
const STAGES = ["Wastewater", "Control Series", "Planted Series"];
const STAGE_LABELS: Record<string, string> = { Wastewater: "IN (Wastewater)", "Control Series": "OUT CONTROL", "Planted Series": "OUT PLANT" };

export default function EtudesPage() {
  const [selectedStudy, setSelectedStudy] = useState<number | null>(null);
  const [showNewStudy, setShowNewStudy] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);

  const { data: studies, error, isLoading } = useSWR("studies", () => api.listStudies() as Promise<Study[]>);

  return (
    <div>
      <PageHeader title="Études & Cycles" subtitle="Campagnes expérimentales et cycles de laboratoire (IN / OUT CONTROL / OUT PLANT)" icon={Beaker} />

      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Études</h3>
        <button className="btn" onClick={() => setShowNewStudy(true)}>
          <Plus size={15} /> Nouvelle étude
        </button>
      </div>

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !studies ? (
        <LoadingState />
      ) : studies.length === 0 ? (
        <EmptyState message="Aucune étude créée pour l'instant." />
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {studies.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStudy(s.id)}
              className={`card p-4 text-left transition ${selectedStudy === s.id ? "border-aqua-500" : ""}`}
            >
              <p className="text-sm font-semibold text-white">{s.study_name}</p>
              <p className="text-xs text-ink-600">Plante : {s.plant_type}</p>
              <p className="text-[11px] text-ink-600">
                {new Date(s.start_date).toLocaleDateString("fr-FR")} → {s.end_date ? new Date(s.end_date).toLocaleDateString("fr-FR") : "en cours"}
              </p>
            </button>
          ))}
        </div>
      )}

      {showNewStudy && <NewStudyModal onClose={() => setShowNewStudy(false)} />}

      {selectedStudy && (
        <StudyDetail studyId={selectedStudy} onNewCycle={() => setShowNewCycle(true)} showNewCycle={showNewCycle} onCloseNewCycle={() => setShowNewCycle(false)} />
      )}
    </div>
  );
}

function NewStudyModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ study_name: "", plant_type: "", start_date: "", end_date: "" });
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.createStudy({
        study_name: form.study_name,
        plant_type: form.plant_type,
        start_date: form.start_date,
        end_date: form.end_date || null,
      });
      mutate("studies");
      onClose();
    } catch (e) {
      alert("Erreur lors de la création : " + e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-sm font-semibold text-white">Nouvelle étude</h3>
        <div className="space-y-3">
          <input className="input w-full" placeholder="Nom de l'étude" value={form.study_name} onChange={(e) => setForm({ ...form, study_name: e.target.value })} />
          <input className="input w-full" placeholder="Type de plante" value={form.plant_type} onChange={(e) => setForm({ ...form, plant_type: e.target.value })} />
          <input type="date" className="input w-full" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <input type="date" className="input w-full" placeholder="Date de fin (optionnel)" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn" disabled={submitting || !form.study_name || !form.plant_type || !form.start_date} onClick={submit}>
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}

function StudyDetail({
  studyId,
  onNewCycle,
  showNewCycle,
  onCloseNewCycle,
}: {
  studyId: number;
  onNewCycle: () => void;
  showNewCycle: boolean;
  onCloseNewCycle: () => void;
}) {
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const { data: cycles, error, isLoading } = useSWR(["cycles", studyId], () => api.listCycles(studyId) as Promise<CycleSummary[]>);

  async function handleAssign(setNumber: number) {
    try {
      const res: any = await api.assignStudy(studyId, setNumber);
      alert(res.message || "Mesures assignées.");
    } catch (e) {
      alert("Erreur : " + e);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Cycles de l&apos;étude</h3>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => handleAssign(1)}>Assigner mesures SET 1</button>
          <button className="btn-ghost" onClick={() => handleAssign(2)}>Assigner mesures SET 2</button>
          <ImportCyclesButton studyId={studyId} />
          <button className="btn" onClick={onNewCycle}>
            <Plus size={15} /> Nouveau cycle
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState message={String(error.message || error)} />
      ) : isLoading || !cycles ? (
        <LoadingState />
      ) : cycles.length === 0 ? (
        <EmptyState message="Aucun cycle pour cette étude." />
      ) : (
        <div className="mb-6 flex flex-wrap gap-2">
          {cycles.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCycle(c.id)}
              className={`pill cursor-pointer border ${selectedCycle === c.id ? "border-aqua-500 bg-aqua-500/15 text-aqua-400" : "border-ink-600 text-ink-600"}`}
            >
              {c.cycle_name}
            </button>
          ))}
        </div>
      )}

      {selectedCycle && <CycleResultsView cycleId={selectedCycle} />}
      {cycles && cycles.length > 0 && (
        <StudyAnalysis studyId={studyId} cycleIds={selectedCycle ? String(selectedCycle) : undefined} />
      )}
      {showNewCycle && <NewCycleModal studyId={studyId} onClose={onCloseNewCycle} />}
    </div>
  );
}

function ImportCyclesButton({ studyId }: { studyId: number }) {
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const base = process.env.NEXT_PUBLIC_MONITORING_API_URL || "http://localhost:8001";
      const res = await fetch(`${base}/api/monitoring/studies/${studyId}/cycles/import`, { method: "POST", body: formData });
      const json = await res.json();
      alert(`Import terminé : ${json.cycles_created?.length ?? 0} cycle(s) créé(s), ${json.row_errors?.length ?? 0} erreur(s).`);
      mutate(["cycles", studyId]);
    } catch (err) {
      alert("Erreur d'import : " + err);
    }
    e.target.value = "";
  }

  return (
    <label className="btn-ghost cursor-pointer">
      <Upload size={15} /> Importer Excel
      <input type="file" accept=".xlsx,.xls" hidden onChange={handleFile} />
    </label>
  );
}

function CycleResultsView({ cycleId }: { cycleId: number }) {
  const { data: cycle, isLoading } = useSWR(["cycle", cycleId], () => api.getCycle(cycleId) as Promise<CycleDetail>);

  if (isLoading || !cycle) return <LoadingState />;

  return (
    <div className="card overflow-x-auto p-0">
      <div className="card-header">
        <h3 className="text-sm font-semibold text-white">{cycle.cycle_name}</h3>
        <span className="text-[11px] text-ink-600">
          {new Date(cycle.start_date).toLocaleDateString("fr-FR")} → {new Date(cycle.end_date).toLocaleDateString("fr-FR")}
        </span>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="bg-ink-800/60 text-ink-600">
          <tr>
            <th className="px-3 py-2">Paramètre</th>
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Rép. 1</th>
            <th className="px-3 py-2">Rép. 2</th>
            <th className="px-3 py-2">Rép. 3</th>
            <th className="px-3 py-2">Moyenne</th>
            <th className="px-3 py-2">Écart-type</th>
            <th className="px-3 py-2">% Abattement</th>
          </tr>
        </thead>
        <tbody>
          {cycle.results.map((r) => (
            <tr key={r.id} className="border-t border-ink-700">
              <td className="px-3 py-1.5">{r.parameter}</td>
              <td className="px-3 py-1.5">{STAGE_LABELS[r.stage] ?? r.stage}</td>
              <td className="px-3 py-1.5 font-mono">{r.replicate_1 ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono">{r.replicate_2 ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono">{r.replicate_3 ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono text-aqua-400">{r.average ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono">{r.std ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono">{r.removal_percent ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewCycleModal({ studyId, onClose }: { studyId: number; onClose: () => void }) {
  const [cycleName, setCycleName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [grid, setGrid] = useState<Record<string, [string, string, string]>>(() => {
    const init: Record<string, [string, string, string]> = {};
    PARAMETERS.forEach((p) => STAGES.forEach((s) => (init[`${p}|${s}`] = ["", "", ""])));
    return init;
  });
  const [submitting, setSubmitting] = useState(false);

  function setCell(param: string, stage: string, idx: number, value: string) {
    setGrid((prev) => {
      const key = `${param}|${stage}`;
      const row = [...prev[key]] as [string, string, string];
      row[idx] = value;
      return { ...prev, [key]: row };
    });
  }

  async function submit() {
    setSubmitting(true);
    try {
      const rows = PARAMETERS.flatMap((parameter) =>
        STAGES.map((stage) => {
          const [r1, r2, r3] = grid[`${parameter}|${stage}`];
          return {
            parameter,
            stage,
            replicate_1: r1 ? Number(r1) : null,
            replicate_2: r2 ? Number(r2) : null,
            replicate_3: r3 ? Number(r3) : null,
          };
        })
      );
      await api.createCycle(studyId, { cycle_name: cycleName, start_date: startDate, end_date: endDate, rows });
      mutate(["cycles", studyId]);
      onClose();
    } catch (e) {
      alert("Erreur : " + e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-4xl overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-sm font-semibold text-white">Nouveau cycle (24 lignes : 8 paramètres x IN / OUT CONTROL / OUT PLANT)</h3>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <input className="input" placeholder="Nom du cycle" value={cycleName} onChange={(e) => setCycleName(e.target.value)} />
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <table className="w-full text-left text-xs">
          <thead className="text-ink-600">
            <tr>
              <th className="py-1.5">Paramètre</th>
              <th className="py-1.5">Stage</th>
              <th className="py-1.5">Rép. 1</th>
              <th className="py-1.5">Rép. 2</th>
              <th className="py-1.5">Rép. 3</th>
            </tr>
          </thead>
          <tbody>
            {PARAMETERS.map((param) =>
              STAGES.map((stage) => (
                <tr key={`${param}|${stage}`} className="border-t border-ink-700">
                  <td className="py-1 pr-2">{param}</td>
                  <td className="py-1 pr-2 text-ink-500">{STAGE_LABELS[stage]}</td>
                  {[0, 1, 2].map((i) => (
                    <td key={i} className="py-1 pr-1">
                      <input
                        className="input w-20 !py-1"
                        type="number"
                        step="any"
                        value={grid[`${param}|${stage}`][i]}
                        onChange={(e) => setCell(param, stage, i, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn" disabled={submitting || !cycleName || !startDate || !endDate} onClick={submit}>
            Créer le cycle
          </button>
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Analyse scientifique de l'étude (ou d'un cycle précis si cycleIds fourni) :
// statistiques globales complètes (tous paramètres), boxplots annotés
// (ANOVA + moyennes ± σ + % élimination + comparaisons Tukey) par cycle
// courant, progression cycle par cycle (A→D...), histogrammes, heatmap
// de corrélation. Va au-delà des stats de base pour "impressionner" en
// soutenance : CV%, IC95%, skewness/kurtosis, test de Shapiro-Wilk,
// détection d'outliers (IQR), suivi de tendance multi-cycles.
// ---------------------------------------------------------------------------
const STAT_LABELS: Record<string, string> = {
  count: "N", min: "Min", max: "Max", mean: "Moyenne", median: "Médiane",
  std: "Écart-type", cv_percent: "CV (%)", q1: "Q1", q3: "Q3", iqr: "IQR",
  outlier_count: "Outliers", skewness: "Asymétrie", kurtosis: "Aplatissement",
};

const STAGE_ORDER = ["IN", "OUT_CONTROL", "OUT_PLANT"] as const;
const STAGE_DISPLAY: Record<string, string> = { IN: "Brute (IN)", OUT_CONTROL: "Témoin", OUT_PLANT: "Plantée" };
const STAGE_COLOR: Record<string, string> = { IN: "#94a3b8", OUT_CONTROL: "#f59e0b", OUT_PLANT: "#2dd4bf" };

function StudyAnalysis({ studyId, cycleIds }: { studyId: number; cycleIds?: string }) {
  const [tab, setTab] = useState<"stats" | "percycle" | "progression" | "histogram" | "heatmap">("percycle");
  const [param, setParam] = useState(PARAMETERS[0]);

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 size={16} className="text-aqua-400" />
        <h3 className="text-sm font-semibold text-white">
          Analyse scientifique {cycleIds ? "du cycle sélectionné" : "de l'étude (tous cycles)"}
        </h3>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-ink-700 pb-px">
        {[
          { key: "percycle", label: "Par cycle" },
          { key: "progression", label: "Progression multi-cycles" },
          { key: "stats", label: "Statistiques globales" },
          { key: "histogram", label: "Histogramme" },
          { key: "heatmap", label: "Heatmap corrélation" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`rounded-t-lg px-3 py-2 text-xs font-medium ${tab === t.key ? "border-b-2 border-aqua-500 text-aqua-400" : "text-ink-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "histogram" && (
        <div className="mb-4 flex flex-wrap gap-2">
          {PARAMETERS.map((p) => (
            <button
              key={p}
              onClick={() => setParam(p)}
              className={`pill cursor-pointer border ${param === p ? "border-aqua-500 bg-aqua-500/15 text-aqua-400" : "border-ink-600 text-ink-600"}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {tab === "stats" && <GlobalStatsView studyId={studyId} cycleIds={cycleIds} />}
      {tab === "percycle" && <ParameterCardsGrid studyId={studyId} cycleIds={cycleIds} />}
      {tab === "progression" && <ProgressionGrid studyId={studyId} cycleIds={cycleIds} />}
      {tab === "histogram" && <HistogramView studyId={studyId} cycleIds={cycleIds} parameter={param} />}
      {tab === "heatmap" && <HeatmapView studyId={studyId} cycleIds={cycleIds} />}
    </div>
  );
}

function GlobalStatsView({ studyId, cycleIds }: { studyId: number; cycleIds?: string }) {
  const { data, error, isLoading } = useSWR(["study-global-stats", studyId, cycleIds], () =>
    api.studyGlobalStats(studyId, cycleIds) as Promise<{ parameters: Record<string, any> }>
  );

  if (error) return <ErrorState message={String(error.message || error)} />;
  if (isLoading || !data) return <LoadingState />;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {PARAMETERS.map((param) => {
        const stats = data.parameters[param];
        if (!stats) return null;
        const overall = stats.overall;
        return (
          <div key={param} className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">{param}</h4>
              {overall.normality_test && (
                <span
                  className={`pill text-[10px] ${
                    overall.normality_test.is_normal_distribution
                      ? "bg-aqua-500/15 text-aqua-400 border border-aqua-500/30"
                      : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  }`}
                  title="Test de Shapiro-Wilk"
                >
                  {overall.normality_test.is_normal_distribution ? "Distribution normale" : "Non normale"}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {["mean", "median", "std", "cv_percent", "min", "max", "iqr", "outlier_count"].map((key) => (
                <div key={key} className="rounded-lg bg-ink-800/60 py-1.5">
                  <p className="text-[9px] uppercase text-ink-600">{STAT_LABELS[key]}</p>
                  <p className="font-mono text-xs font-semibold text-white">{overall[key] ?? "—"}</p>
                </div>
              ))}
            </div>
            {overall.ci95_lower !== null && overall.ci95_lower !== undefined && (
              <p className="mt-2 text-[11px] text-ink-600">
                IC 95% de la moyenne : [{overall.ci95_lower} — {overall.ci95_upper}] (n={overall.count})
              </p>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-aqua-400">Détail par stage (IN / OUT_CONTROL / OUT_PLANT)</summary>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {STAGE_ORDER.map((stage) => {
                  const s = stats.by_stage[stage];
                  return (
                    <div key={stage} className="rounded-lg border border-ink-700 p-2 text-center">
                      <p className="text-[9px] text-ink-600">{STAGE_DISPLAY[stage]}</p>
                      <p className="font-mono text-xs text-white">{s?.mean ?? "—"}</p>
                      <p className="text-[9px] text-ink-600">σ={s?.std ?? "—"}</p>
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Par cycle" : une carte par paramètre, boxplot 3 stages + ANOVA + moyennes
// ± σ + % élimination + comparaisons Tukey — tout-en-un, comme la maquette.
// ---------------------------------------------------------------------------
function ParameterCardsGrid({ studyId, cycleIds }: { studyId: number; cycleIds?: string }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {PARAMETERS.map((param) => (
        <ParameterCard key={param} studyId={studyId} cycleIds={cycleIds} parameter={param} />
      ))}
    </div>
  );
}

function ParameterCard({ studyId, cycleIds, parameter }: { studyId: number; cycleIds?: string; parameter: string }) {
  const { data, error, isLoading } = useSWR(["param-summary", studyId, cycleIds, parameter], () =>
    api.studyParameterSummary(studyId, parameter, cycleIds) as Promise<{
      boxplot: Record<string, any>;
      descriptive: Record<string, any>;
      anova: any;
      elimination: Record<string, { mean: number; std: number | null; n_cycles: number }>;
    }>
  );

  if (error) return <div className="card p-4"><ErrorState message={String(error.message || error)} /></div>;
  if (isLoading || !data) return <div className="card p-4"><LoadingState /></div>;

  const stagesWithData = STAGE_ORDER.filter((s) => data.boxplot[s]);
  const unit = parameter.match(/\(([^)]+)\)/)?.[1] ?? "";
  const anova = data.anova;

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{parameter}</h4>
        {anova && !anova.error && (
          <span className="pill border border-aqua-500/30 bg-aqua-500/10 text-[10px] text-aqua-400">
            ANOVA F={anova.anova_f_statistic} · p={anova.anova_p_value < 0.001 ? "<0.001" : anova.anova_p_value}
          </span>
        )}
      </div>

      {stagesWithData.length === 0 ? (
        <EmptyState message="Pas assez de données pour ce paramètre." />
      ) : (
        <Plot
          data={stagesWithData.map((stage) => {
            const b = data.boxplot[stage];
            return {
              type: "box",
              name: STAGE_DISPLAY[stage],
              x: Array(1).fill(STAGE_DISPLAY[stage]),
              q1: [b.q1], median: [b.median], q3: [b.q3],
              lowerfence: [b.min], upperfence: [b.max],
              y: b.outliers.length ? [b.outliers] : undefined,
              marker: { color: STAGE_COLOR[stage] },
              line: { color: STAGE_COLOR[stage] },
              fillcolor: STAGE_COLOR[stage] + "55",
              showlegend: false,
              width: 0.5,
            };
          })}
          layout={{
            autosize: true, height: 260,
            margin: { t: 10, r: 10, l: 45, b: 30 },
            paper_bgcolor: "transparent", plot_bgcolor: "transparent",
            font: { color: "#9fb8b3", size: 10 },
            xaxis: { gridcolor: "#173430", type: "category", categoryarray: stagesWithData.map((s) => STAGE_DISPLAY[s]) },
            yaxis: { gridcolor: "#173430", title: unit },
            boxmode: "group",
          }}
          useResizeHandler
          style={{ width: "100%" }}
          config={{ displaylogo: false, staticPlot: false }}
        />
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        {STAGE_ORDER.map((stage) => {
          const d = data.descriptive[stage];
          if (!d || d.count === 0) return null;
          return (
            <div key={stage} className="rounded-lg border border-ink-700 p-2 text-center">
              <p className="text-[10px] font-medium" style={{ color: STAGE_COLOR[stage] }}>{STAGE_DISPLAY[stage]}</p>
              <p className="font-mono text-xs text-white">
                μ={d.mean} {d.std !== null && <>± {d.std}</>}
              </p>
            </div>
          );
        })}
      </div>

      {Object.keys(data.elimination).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(data.elimination).map(([label, e]) => (
            <span key={label} className="pill border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-400">
              Élimination {STAGE_DISPLAY[label] ?? label}: {e.mean}% {e.std !== null && <>± {e.std}</>}
            </span>
          ))}
        </div>
      )}

      {anova && Array.isArray(anova.tukey_hsd) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {anova.tukey_hsd.map((row: any, i: number) => (
            <span
              key={i}
              className={`pill text-[11px] border ${
                row.reject_h0 ? "border-aqua-500/30 bg-aqua-500/10 text-aqua-400" : "border-ink-600 text-ink-500"
              }`}
            >
              {row.group1} vs {row.group2}: {row.reject_h0 ? "✓" : "✗"} p={row.p_adj < 0.001 ? "<0.001" : row.p_adj}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Progression multi-cycles" : boxplots mini, côte à côte par cycle,
// pour suivre l'évolution de l'efficacité de traitement au fil du temps.
// ---------------------------------------------------------------------------
function ProgressionGrid({ studyId, cycleIds }: { studyId: number; cycleIds?: string }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {PARAMETERS.map((param) => (
        <ProgressionCard key={param} studyId={studyId} cycleIds={cycleIds} parameter={param} />
      ))}
    </div>
  );
}

function ProgressionCard({ studyId, cycleIds, parameter }: { studyId: number; cycleIds?: string; parameter: string }) {
  const { data, error, isLoading } = useSWR(["progression", studyId, cycleIds, parameter], () =>
    api.studyProgression(studyId, parameter, cycleIds) as Promise<{
      cycles: { cycle_id: number; cycle_name: string; boxplots: Record<string, any> }[];
    }>
  );

  if (error) return <div className="card p-4"><ErrorState message={String(error.message || error)} /></div>;
  if (isLoading || !data) return <div className="card p-4"><LoadingState /></div>;
  if (data.cycles.length < 2) return (
    <div className="card p-4">
      <h4 className="mb-2 text-sm font-semibold text-white">{parameter}</h4>
      <EmptyState message="Au moins 2 cycles sont nécessaires pour visualiser une progression." />
    </div>
  );

  const unit = parameter.match(/\(([^)]+)\)/)?.[1] ?? "";
  const traces: any[] = [];
  STAGE_ORDER.forEach((stage) => {
    const xs: string[] = [];
    const q1s: number[] = []; const medians: number[] = []; const q3s: number[] = [];
    const mins: number[] = []; const maxs: number[] = [];
    data.cycles.forEach((c) => {
      const b = c.boxplots[stage];
      if (!b) return;
      xs.push(c.cycle_name);
      q1s.push(b.q1); medians.push(b.median); q3s.push(b.q3);
      mins.push(b.min); maxs.push(b.max);
    });
    if (xs.length === 0) return;
    traces.push({
      type: "box", name: STAGE_DISPLAY[stage], x: xs,
      q1: q1s, median: medians, q3: q3s, lowerfence: mins, upperfence: maxs,
      marker: { color: STAGE_COLOR[stage] }, line: { color: STAGE_COLOR[stage] },
      fillcolor: STAGE_COLOR[stage] + "55",
      offsetgroup: stage, width: 0.22,
    });
  });

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{parameter}</h4>
        <div className="flex gap-2 text-[10px]">
          {STAGE_ORDER.map((s) => (
            <span key={s} className="flex items-center gap-1" style={{ color: STAGE_COLOR[s] }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLOR[s] }} /> {STAGE_DISPLAY[s]}
            </span>
          ))}
        </div>
      </div>
      <Plot
        data={traces}
        layout={{
          autosize: true, height: 280,
          margin: { t: 10, r: 10, l: 45, b: 30 },
          paper_bgcolor: "transparent", plot_bgcolor: "transparent",
          font: { color: "#9fb8b3", size: 10 },
          xaxis: { gridcolor: "#173430", type: "category" },
          yaxis: { gridcolor: "#173430", title: unit },
          boxmode: "group",
          showlegend: false,
        }}
        useResizeHandler
        style={{ width: "100%" }}
        config={{ displaylogo: false }}
      />
    </div>
  );
}

function HistogramView({ studyId, cycleIds, parameter }: { studyId: number; cycleIds?: string; parameter: string }) {
  const { data, error, isLoading } = useSWR(["study-histogram", studyId, cycleIds, parameter], () =>
    api.studyHistogram(studyId, parameter, cycleIds, 12) as Promise<{ bin_edges: number[]; series: Record<string, number[] | null> }>
  );

  if (error) return <ErrorState message={String(error.message || error)} />;
  if (isLoading || !data || data.bin_edges.length === 0) return <EmptyState message="Pas assez de données pour ce paramètre." />;

  const centers = data.bin_edges.slice(0, -1).map((e, i) => (e + data.bin_edges[i + 1]) / 2);

  return (
    <div className="card p-4">
      <Plot
        data={Object.entries(data.series)
          .filter(([, counts]) => counts)
          .map(([stage, counts]) => ({
            x: centers, y: counts, type: "bar", name: STAGE_DISPLAY[stage] ?? stage, opacity: 0.75,
            marker: { color: STAGE_COLOR[stage] },
          }))}
        layout={{
          autosize: true, height: 340, barmode: "overlay",
          margin: { t: 20, r: 20, l: 50, b: 40 },
          paper_bgcolor: "transparent", plot_bgcolor: "transparent",
          font: { color: "#9fb8b3", size: 11 },
          xaxis: { gridcolor: "#173430", title: parameter },
          yaxis: { gridcolor: "#173430", title: "Fréquence" },
        }}
        useResizeHandler
        style={{ width: "100%" }}
        config={{ displaylogo: false }}
      />
    </div>
  );
}

function HeatmapView({ studyId, cycleIds }: { studyId: number; cycleIds?: string }) {
  const { data, error, isLoading } = useSWR(["study-heatmap", studyId, cycleIds], () =>
    api.studyHeatmap(studyId, cycleIds) as Promise<{ parameters: string[]; matrix: number[][]; error?: string; n_observations?: number }>
  );

  if (error) return <ErrorState message={String(error.message || error)} />;
  if (isLoading || !data) return <LoadingState />;
  if (data.error) return <EmptyState message={data.error} />;

  return (
    <div className="card p-4">
      <Plot
        data={[
          {
            z: data.matrix, x: data.parameters, y: data.parameters,
            type: "heatmap", colorscale: "Viridis", zmin: -1, zmax: 1,
            text: data.matrix.map((row) => row.map((v) => v.toFixed(2))),
            texttemplate: "%{text}",
          },
        ]}
        layout={{
          autosize: true, height: 420,
          margin: { t: 20, r: 20, l: 120, b: 120 },
          paper_bgcolor: "transparent", plot_bgcolor: "transparent",
          font: { color: "#9fb8b3", size: 10 },
        }}
        useResizeHandler
        style={{ width: "100%" }}
        config={{ displaylogo: false }}
      />
      <p className="mt-2 text-center text-[11px] text-ink-600">
        Corrélation de Pearson entre les 8 paramètres (n={data.n_observations} observations cycle×stage).
      </p>
    </div>
  );
}
