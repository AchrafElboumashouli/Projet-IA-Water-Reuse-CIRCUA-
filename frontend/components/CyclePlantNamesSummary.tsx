import { CyclePlants } from "@/lib/types";

/**
 * Read-only summary of this cycle's plant names, sourced directly from
 * the backend's standalone `cycle_plants` record for this cycle (see
 * backend app/models/cycle_plants.py), related only through
 * `cycle_id` — never from the result rows, which carry no plant
 * information at all. Shown on the cycle detail page to confirm the
 * values saved for THIS cycle, independently of any other cycle.
 */
export function CyclePlantNamesSummary({ plants }: { plants: CyclePlants | null }) {
  const values: Array<{ label: string; value: string; accent: string }> = [
    { label: "Plant 1", value: plants?.plant_1 ?? "", accent: "text-stage-wastewater" },
    { label: "Plant 2", value: plants?.plant_2 ?? "", accent: "text-stage-planted" },
    { label: "Plant 3", value: plants?.plant_3 ?? "", accent: "text-stage-control" },
  ];

  return (
    <div className="rounded-lg border border-slate-line bg-white p-4">
      <h2 className="text-sm font-semibold text-ink">Plant names for this cycle</h2>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {values.map((p) => (
          <div key={p.label} className="flex items-center gap-2">
            <span className={`font-medium ${p.accent}`}>{p.label}</span>
            <span className="text-ink">{p.value || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
