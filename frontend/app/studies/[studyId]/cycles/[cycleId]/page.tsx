"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CyclePlantNamesSummary } from "@/components/CyclePlantNamesSummary";
import { CycleTable } from "@/components/CycleTable";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Cycle } from "@/lib/types";

export default function CycleDetailPage() {
  const { studyId, cycleId } = useParams<{ studyId: string; cycleId: string }>();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Cycles are shared entities: the same cycle can be linked to
    // several studies (or none). Before showing it under this study's
    // URL, confirm the study<->cycle association actually exists via
    // `study_cycles` — a cycle id alone doesn't imply it belongs here.
    Promise.all([api.getCycle(cycleId), api.listCycles(studyId)])
      .then(([fetchedCycle, studyCycles]) => {
        const belongsToStudy = studyCycles.some(
          (c) => String(c.id) === String(cycleId)
        );
        if (!belongsToStudy) {
          setError("This cycle is not associated with this study.");
          return;
        }
        setCycle(fetchedCycle);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [cycleId, studyId]);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error)
    return (
      <div className="rounded-md border border-signal-low/30 bg-signal-low/5 px-4 py-3 text-sm text-signal-low">
        {error}
      </div>
    );
  if (!cycle) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/studies/${studyId}`} className="text-xs text-slate-500 hover:text-ink">
          ← Back to study
        </Link>
        <div className="mt-2 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-ink">{cycle.cycle_name}</h1>
          <span className="tabular text-sm text-slate-500">
            {formatDateTime(cycle.start_date)} → {formatDateTime(cycle.end_date)}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Stored results as calculated by the backend at save time.
        </p>
      </div>

      <CyclePlantNamesSummary plants={cycle.plants} />

      <CycleTable rows={cycle.results} editable={false} />
    </div>
  );
}
