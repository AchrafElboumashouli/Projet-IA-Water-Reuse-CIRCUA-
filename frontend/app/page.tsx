"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Study } from "@/lib/types";

export default function StudiesPage() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [studyName, setStudyName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  async function refresh() {
    try {
      setError(null);
      const data = await api.listStudies();
      setStudies(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!studyName.trim() || !startDate) return;
    setCreating(true);
    try {
      await api.createStudy({
        study_name: studyName.trim(),
        start_date: startDate,
        end_date: endDate || undefined,
      });
      setStudyName("");
      setStartDate("");
      setEndDate("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const isValid = studyName.trim() && startDate;

  async function handleDeleteStudy(study: Study) {
    const confirmed = window.confirm(
      `Delete "${study.study_name}"? Its cycle associations will be removed, but the cycles, their results and plant information will be preserved and can still be used by other studies.`
    );
    if (!confirmed) return;

    setDeleteError(null);
    setDeleteSuccess(null);
    setDeletingId(study.id);
    try {
      await api.deleteStudy(study.id);
      // Reflect the deletion immediately without a full page reload.
      setStudies((prev) => prev.filter((s) => s.id !== study.id));
      setDeleteSuccess(`"${study.study_name}" was deleted successfully.`);
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Studies</h1>
        <p className="mt-1 text-sm text-slate-500">
          A study groups both automatic sensor readings and manual treatment
          cycles (Cycle A, B, C, D…) for one experimental campaign. Each cycle
          names its own plants — pick a study to continue, or start a new one
          below.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-signal-low/30 bg-signal-low/5 px-4 py-3 text-sm text-signal-low">
          Couldn't reach the API: {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 gap-3 rounded-lg border border-slate-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      >
        <div className="lg:col-span-2">
          <label className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">
            Study name
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            placeholder="e.g. Constructed Wetland Pilot — Summer 2026"
            value={studyName}
            onChange={(e) => setStudyName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">
            Start date &amp; time
          </label>
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">
            End date &amp; time (optional)
          </label>
          <input
            type="datetime-local"
            className="mt-1 w-full rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={creating || !isValid}
          className="whitespace-nowrap rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          {creating ? "Creating…" : "New study"}
        </button>
      </form>

      {deleteSuccess && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {deleteSuccess}
        </div>
      )}
      {deleteError && (
        <div className="rounded-md border border-signal-low/30 bg-signal-low/5 px-4 py-3 text-sm text-signal-low">
          {deleteError}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading studies…</p>
      ) : studies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-line px-4 py-10 text-center text-sm text-slate-500">
          No studies yet. Create one above to start logging cycles.
        </div>
      ) : (
        <ul className="divide-y divide-slate-line rounded-lg border border-slate-line bg-white">
          {studies.map((s) => (
            <li key={s.id} className="flex items-center justify-between transition hover:bg-slate-50">
              <Link
                href={`/studies/${s.id}`}
                className="flex flex-1 items-center justify-between px-4 py-3"
              >
                <p className="text-sm font-medium text-ink">{s.study_name}</p>
                <span className="tabular text-xs text-slate-400">
                  {formatDateTime(s.start_date)} → {s.end_date ? formatDateTime(s.end_date) : "ongoing"}
                </span>
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteStudy(s);
                }}
                disabled={deletingId === s.id}
                aria-label={`Delete study ${s.study_name}`}
                title="Delete Study"
                className="mr-3 rounded-md p-2 text-slate-400 transition hover:bg-signal-low/10 hover:text-signal-low disabled:opacity-40"
              >
                {deletingId === s.id ? (
                  <span className="text-xs">Deleting…</span>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.75 1a.75.75 0 0 0-.75.75V2h-3a.75.75 0 0 0 0 1.5h.264l.845 12.03A2.75 2.75 0 0 0 8.6 18h2.8a2.75 2.75 0 0 0 2.741-2.47l.845-12.03H15a.75.75 0 0 0 0-1.5h-3v-.25a.75.75 0 0 0-.75-.75h-2.5ZM7.5 6.75a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Zm3.75.75a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
