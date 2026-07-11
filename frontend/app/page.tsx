"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Study } from "@/lib/types";

export default function StudiesPage() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [studyName, setStudyName] = useState("");
  const [plantType, setPlantType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);

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
    if (!studyName.trim() || !plantType.trim() || !startDate) return;
    setCreating(true);
    try {
      await api.createStudy({
        study_name: studyName.trim(),
        plant_type: plantType.trim(),
        start_date: startDate,
        end_date: endDate || undefined,
      });
      setStudyName("");
      setPlantType("");
      setStartDate("");
      setEndDate("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const isValid = studyName.trim() && plantType.trim() && startDate;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Studies</h1>
        <p className="mt-1 text-sm text-slate-500">
          A study groups both automatic sensor readings and manual treatment
          cycles (Cycle A, B, C, D…) for one experimental campaign. Pick one
          to continue, or start a new one below.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-signal-low/30 bg-signal-low/5 px-4 py-3 text-sm text-signal-low">
          Couldn't reach the API: {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="grid grid-cols-1 gap-3 rounded-lg border border-slate-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
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
            Plant type
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            placeholder="e.g. Phragmites"
            value={plantType}
            onChange={(e) => setPlantType(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">
            Start date
          </label>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">
            End date (optional)
          </label>
          <input
            type="date"
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

      {loading ? (
        <p className="text-sm text-slate-500">Loading studies…</p>
      ) : studies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-line px-4 py-10 text-center text-sm text-slate-500">
          No studies yet. Create one above to start logging cycles.
        </div>
      ) : (
        <ul className="divide-y divide-slate-line rounded-lg border border-slate-line bg-white">
          {studies.map((s) => (
            <li key={s.id}>
              <Link
                href={`/studies/${s.id}`}
                className="flex items-center justify-between px-4 py-3 transition hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{s.study_name}</p>
                  <p className="text-xs text-slate-500">{s.plant_type}</p>
                </div>
                <span className="tabular text-xs text-slate-400">
                  {s.start_date} → {s.end_date ?? "ongoing"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
