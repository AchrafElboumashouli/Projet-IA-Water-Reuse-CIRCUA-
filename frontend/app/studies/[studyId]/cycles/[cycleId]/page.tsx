"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CycleTable } from "@/components/CycleTable";
import { api } from "@/lib/api";
import { Cycle } from "@/lib/types";

export default function CycleDetailPage() {
  const { studyId, cycleId } = useParams<{ studyId: string; cycleId: string }>();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCycle(cycleId)
      .then(setCycle)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [cycleId]);

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
            {cycle.start_date} → {cycle.end_date}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Stored results as calculated by the backend at save time.
        </p>
      </div>

      <CycleTable rows={cycle.results} editable={false} />
    </div>
  );
}
