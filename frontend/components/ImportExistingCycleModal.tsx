"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { ImportableCycle } from "@/lib/types";

interface ImportExistingCycleModalProps {
  studyId: number | string;
  /** Cycle ids already associated with the current study, so the modal
   * can mark them instead of allowing a duplicate association attempt. */
  currentCycleIds: number[];
  onClose: () => void;
  onImported: () => void;
}

/**
 * "Import Existing Cycle" — lets the user reuse a cycle that already
 * exists in the database (the Cycles page is a PERMANENT repository:
 * cycles are never deleted). This is NOT the Excel importer: no file is
 * uploaded here.
 *
 * Every cycle in the database is shown, with no filtering — including
 * cycles currently used by other studies, cycles used by no study, and
 * cycles used by several studies at once. Importing only creates a new
 * Study<->Cycle association (see backend
 * app/services/cycle_service.py::import_cycle_into_study); it never
 * clones the cycle, its plants, or its results, and a cycle can be
 * associated with multiple studies at the same time.
 */
export function ImportExistingCycleModal({
  studyId,
  currentCycleIds,
  onClose,
  onImported,
}: ImportExistingCycleModalProps) {
  const [cycles, setCycles] = useState<ImportableCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  const currentIdSet = useMemo(() => new Set(currentCycleIds), [currentCycleIds]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listAvailableCyclesForImport();
      setCycles(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return cycles;
    return cycles.filter((c) => c.cycle_name.toLowerCase().includes(needle));
  }, [cycles, search]);

  async function handleImport() {
    if (selectedId == null) return;
    setImporting(true);
    setError(null);
    try {
      await api.importExistingCycle(studyId, selectedId);
      onImported();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-lg border border-slate-line bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Import Existing Cycle</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-50 hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cycles by name…"
            className="w-full rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
          />

          {error && (
            <div className="mt-3 rounded-md border border-signal-low/30 bg-signal-low/5 px-3 py-2 text-xs text-signal-low">
              {error}
            </div>
          )}

          <div className="mt-4 max-h-80 overflow-y-auto rounded-md border border-slate-line">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                No existing cycles are available for import.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-2xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Cycle</th>
                    <th className="px-3 py-2">Study</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Plants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-line">
                  {filtered.map((c) => {
                    const alreadyLinked = currentIdSet.has(c.id);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => !alreadyLinked && setSelectedId(c.id)}
                        className={`transition ${
                          alreadyLinked
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer hover:bg-slate-50"
                        } ${selectedId === c.id ? "bg-entry/10" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="importable-cycle"
                              checked={selectedId === c.id}
                              disabled={alreadyLinked}
                              onChange={() => setSelectedId(c.id)}
                            />
                            <span className="font-medium text-ink">{c.cycle_name}</span>
                            {alreadyLinked && (
                              <span className="text-2xs text-slate-400">
                                (already used by this study)
                              </span>
                            )}
                          </label>
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {c.studies.length === 0
                            ? "Unassigned"
                            : c.studies.map((s) => s.study_name).join(", ")}
                        </td>
                        <td className="px-3 py-2 tabular text-xs text-slate-500">
                          {formatDateTime(c.start_date)}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{c.plant_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-line px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-md border border-slate-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={selectedId == null || importing}
            className="rounded-md bg-stage-planted px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
