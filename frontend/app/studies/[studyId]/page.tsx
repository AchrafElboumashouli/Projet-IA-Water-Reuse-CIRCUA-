"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CycleSummary, Study } from "@/lib/types";

export default function StudyDetailPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const [study, setStudy] = useState<Study | null>(null);
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <Link
            href={`/studies/${studyId}/cycles/new`}
            className="rounded-md bg-stage-planted px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            + New cycle
          </Link>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {study.plant_type} · {study.start_date} → {study.end_date ?? "ongoing"}
        </p>
      </div>

      {cycles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-line px-4 py-10 text-center text-sm text-slate-500">
          No cycles logged yet. Start with Cycle A.
        </div>
      ) : (
        <ul className="divide-y divide-slate-line rounded-lg border border-slate-line bg-white">
          {cycles.map((c) => (
            <li key={c.id}>
              <Link
                href={`/studies/${studyId}/cycles/${c.id}`}
                className="flex items-center justify-between px-4 py-3 transition hover:bg-slate-50"
              >
                <span className="text-sm font-medium text-ink">{c.cycle_name}</span>
                <span className="tabular text-xs text-slate-500">
                  {c.start_date} → {c.end_date}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
