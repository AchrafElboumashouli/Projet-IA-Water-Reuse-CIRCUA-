"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { CycleImportResult, CycleSummary, Study } from "@/lib/types";
import { ImportExistingCycleModal } from "@/components/ImportExistingCycleModal";

export default function StudyDetailPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const [study, setStudy] = useState<Study | null>(null);
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<CycleImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [showImportExisting, setShowImportExisting] = useState(false);
  const [importExistingSuccess, setImportExistingSuccess] = useState<string | null>(null);
  const [removingCycleId, setRemovingCycleId] = useState<number | null>(null);

  async function loadCycles() {
    const c = await api.listCycles(studyId);
    setCycles(c);
  }

  useEffect(() => {
    async function load() {
      try {
        const [s, c] = await Promise.all([
          api.getStudy(studyId),
          api.listCycles(studyId),
        ]);
        setStudy(s);
        setCycles(c);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studyId]);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const result = await api.importCycles(studyId, file);
      setImportResult(result);
      // Refresh the cycle list in place — no page reload.
      await loadCycles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // This only removes the Study<->Cycle association (study_cycles row).
  // The Cycle, its cycle_results, and its cycle_plants stay in the
  // database untouched, and any other Study using the same Cycle keeps
  // its own association — see backend app/routes/study.py.
  async function handleRemoveCycle(cycle: CycleSummary) {
    const usedElsewhere = cycle.studies.length > 1;
    const confirmMessage = usedElsewhere
      ? `Remove "${cycle.cycle_name}" from this study? It will remain available to the ${
          cycle.studies.length - 1
        } other ${cycle.studies.length - 1 === 1 ? "study" : "studies"} using it, and can be re-imported later.`
      : `Remove "${cycle.cycle_name}" from this study? The cycle itself, its results, and its plant names are kept and can be re-imported later — this does not delete the cycle.`;

    if (!window.confirm(confirmMessage)) return;

    setRemovingCycleId(cycle.id);
    setError(null);
    try {
      await api.removeCycleFromStudy(studyId, cycle.id);
      await loadCycles();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRemovingCycleId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error)
    return (
      <div className="rounded-md border border-signal-low/30 bg-signal-low/5 px-4 py-3 text-sm text-signal-low">
        {error}
      </div>
    );
  if (!study) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-xs text-slate-500 hover:text-ink">
          ← All studies
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">{study.study_name}</h1>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="whitespace-nowrap rounded-md border border-slate-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-40"
            >
              {importing ? "Importing…" : "📁 Import Excel"}
            </button>
            <button
              onClick={() => {
                setImportExistingSuccess(null);
                setShowImportExisting(true);
              }}
              className="whitespace-nowrap rounded-md border border-slate-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
            >
              ♻️ Import Existing Cycle
            </button>
            <Link
              href={`/studies/${studyId}/cycles/new`}
              className="rounded-md bg-stage-planted px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              + New cycle
            </Link>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {formatDateTime(study.start_date)} → {study.end_date ? formatDateTime(study.end_date) : "ongoing"}
        </p>
      </div>

      {importResult && (
        <div className="space-y-2 rounded-lg border border-slate-line bg-white p-4 text-sm">
          <p className="font-medium text-ink">
            Import finished: {importResult.total_rows} row(s) read, {importResult.cycles_created.length} cycle(s) created.
          </p>
          {importResult.cycles_skipped.length > 0 && (
            <div className="text-amber-700">
              <p className="font-medium">Skipped cycles:</p>
              <ul className="list-inside list-disc">
                {importResult.cycles_skipped.map((s, i) => (
                  <li key={i}>
                    {s.cycle_name} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {importResult.row_errors.length > 0 && (
            <div className="text-signal-low">
              <p className="font-medium">Row errors:</p>
              <ul className="list-inside list-disc">
                {importResult.row_errors.map((r, i) => (
                  <li key={i}>
                    Row {r.row}: {r.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {importExistingSuccess && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {importExistingSuccess}
        </div>
      )}

      {cycles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-line px-4 py-10 text-center text-sm text-slate-500">
          No cycles logged yet. Start with Cycle A.
        </div>
      ) : (
        <ul className="divide-y divide-slate-line rounded-lg border border-slate-line bg-white">
          {cycles.map((c) => (
            <li key={c.id} className="flex items-center justify-between transition hover:bg-slate-50">
              <Link
                href={`/studies/${studyId}/cycles/${c.id}`}
                className="flex flex-1 items-center justify-between px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-ink">{c.cycle_name}</span>
                  {c.studies.length > 1 && (
                    <span className="ml-2 text-2xs text-slate-400">
                      (also used by {c.studies.length - 1} other{" "}
                      {c.studies.length - 1 === 1 ? "study" : "studies"})
                    </span>
                  )}
                </div>
                <span className="tabular text-xs text-slate-500">
                  {formatDateTime(c.start_date)} → {formatDateTime(c.end_date)}
                </span>
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemoveCycle(c);
                }}
                disabled={removingCycleId === c.id}
                title="Remove this cycle from this study (the cycle itself is kept)"
                aria-label={`Remove ${c.cycle_name} from this study`}
                className="mr-3 rounded-md p-2 text-slate-400 transition hover:bg-signal-low/10 hover:text-signal-low disabled:opacity-40"
              >
                {removingCycleId === c.id ? "…" : "🗑️"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showImportExisting && (
        <ImportExistingCycleModal
          studyId={studyId}
          currentCycleIds={cycles.map((c) => c.id)}
          onClose={() => setShowImportExisting(false)}
          onImported={async () => {
            setImportExistingSuccess("Cycle imported successfully.");
            await loadCycles();
          }}
        />
      )}
    </div>
  );
}
