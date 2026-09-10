"use client";

/**
 * Plant name inputs for the "Enter Data for Replicate" (new cycle) form.
 *
 * Unlike the old global `plant_note`, these three values belong to THIS
 * cycle only: they are submitted together with the cycle's replicate
 * data in a single POST /api/cycles, and are stored on every row of
 * this cycle's `cycle_results` (see backend app/services/cycle_service
 * .build_cycle_results). Saving another cycle never touches these
 * values — each cycle keeps its own plant_1/plant_2/plant_3.
 */
export interface CyclePlantNames {
  plant_1: string;
  plant_2: string;
  plant_3: string;
}

interface CyclePlantNamesFormProps {
  value: CyclePlantNames;
  onChange: (value: CyclePlantNames) => void;
}

export function CyclePlantNamesForm({ value, onChange }: CyclePlantNamesFormProps) {
  function setField(field: keyof CyclePlantNames) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...value, [field]: e.target.value });
    };
  }

  return (
    <div className="rounded-lg border border-slate-line bg-white p-4">
      <h2 className="text-sm font-semibold text-ink">Plant names for this cycle</h2>
      <p className="mt-1 text-xs text-slate-500">
        These plant names belong to this cycle only and are saved with its
        results.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-stage-wastewater">
            Plant 1
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-line px-2 py-1.5 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            placeholder="e.g. Tomato"
            value={value.plant_1}
            onChange={setField("plant_1")}
          />
        </div>
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-stage-planted">
            Plant 2
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-line px-2 py-1.5 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            placeholder="e.g. Lettuce"
            value={value.plant_2}
            onChange={setField("plant_2")}
          />
        </div>
        <div>
          <label className="block text-2xs font-semibold uppercase tracking-wide text-stage-control">
            Plant 3
          </label>
          <input
            className="mt-1 w-full rounded-md border border-slate-line px-2 py-1.5 text-sm outline-none focus:border-entry focus:ring-1 focus:ring-entry"
            placeholder="e.g. Mint (optional)"
            value={value.plant_3}
            onChange={setField("plant_3")}
          />
        </div>
      </div>
    </div>
  );
}
