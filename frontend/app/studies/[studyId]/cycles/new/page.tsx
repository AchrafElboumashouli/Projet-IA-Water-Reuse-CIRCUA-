"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CycleTable } from "@/components/CycleTable";
import { api } from "@/lib/api";
import { buildEmptyRows } from "@/lib/constants";
import { DraftRow, Stage } from "@/lib/types";

export default function NewCyclePage() {
  const { studyId } = useParams<{ studyId: string }>();
  const router = useRouter();

  const [cycleName, setCycleName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rows, setRows] = useState<DraftRow[]>(buildEmptyRows());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleReplicateChange(
    parameter: string,
    stage: Stage,
    field: "replicate_1" | "replicate_2" | "replicate_3",
    value: number | null
  ) {
    setRows((prev) =>
      prev.map((r) =>
        r.parameter === parameter && r.stage === stage ? { ...r, [field]: value } : r
      )
    );
  }

  const isValid = cycleName.trim() && startDate && endDate;

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    try {
      // Everything travels in one POST: cycle metadata + all 24 raw rows.
      // The backend computes average/std/removal and persists the full table.
      const cycle = await api.createCycle({
        study_id: Number(studyId),
        cycle_name: cycleName.trim(),
        start_date: startDate,
        end_date: endDate,
        rows,
      });
      router.push(`/studies/${studyId}/cycles/${cycle.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/studies/${studyId}`} className="text-xs text-slate-500 hover:text-ink">
          ← Back to study
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-ink">New cycle</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the three replicates for each parameter and stage. Average, STD, and
          removal update live as you type — Save recalculates and stores the final
          table.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-line bg-white p-4 sm:grid-cols-3">
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-slate-500">
            Cycle name
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            placeholder="Cycle A"
            value={cycleName}
            onChange={(e) => setCycleName(e.target.value)}
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
            End date
          </label>
          <input
            type="date"
            className="mt-1 w-full rounded-md border border-slate-line px-3 py-2 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <CycleTable rows={rows} editable onReplicateChange={handleReplicateChange} />

      {error && (
        <div className="rounded-md border border-signal-low/30 bg-signal-low/5 px-4 py-3 text-sm text-signal-low">
          Save failed: {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link
          href={`/studies/${studyId}`}
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className="rounded-md bg-stage-planted px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save cycle"}
        </button>
      </div>
    </div>
  );
}
