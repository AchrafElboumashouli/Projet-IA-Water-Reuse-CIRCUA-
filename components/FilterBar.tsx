"use client";

export interface Filters {
  setNumber?: number;
  startDate?: string;
  endDate?: string;
  plantType?: string;
}

export default function FilterBar({
  filters,
  onChange,
  showPlantType = false,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  showPlantType?: boolean;
}) {
  return (
    <div className="card mb-6 flex flex-wrap items-end gap-4 px-5 py-4">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-ink-600">Set de capteurs</label>
        <select
          className="input"
          value={filters.setNumber ?? ""}
          onChange={(e) => onChange({ ...filters, setNumber: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">Tous les sets</option>
          <option value="1">SET 1</option>
          <option value="2">SET 2</option>
        </select>
      </div>

      {showPlantType && (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-ink-600">Type de plante</label>
          <input
            className="input"
            placeholder="ex. tomate"
            value={filters.plantType ?? ""}
            onChange={(e) => onChange({ ...filters, plantType: e.target.value || undefined })}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-ink-600">Du</label>
        <input
          type="datetime-local"
          className="input"
          value={filters.startDate ?? ""}
          onChange={(e) => onChange({ ...filters, startDate: e.target.value || undefined })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-ink-600">Au</label>
        <input
          type="datetime-local"
          className="input"
          value={filters.endDate ?? ""}
          onChange={(e) => onChange({ ...filters, endDate: e.target.value || undefined })}
        />
      </div>

      <button className="btn-ghost" onClick={() => onChange({})}>
        Réinitialiser
      </button>
    </div>
  );
}
