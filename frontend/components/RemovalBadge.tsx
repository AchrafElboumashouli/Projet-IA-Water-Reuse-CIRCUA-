interface RemovalBadgeProps {
  value: number | null;
}

/**
 * The signature element of the cycle table: treatment performance read at a
 * glance. Removal is the number a data scientist scans for first, so it
 * gets a filled chip whose color intensity reflects how much the treatment
 * stage removed of a given parameter. The exact Removal STD still gets its
 * own plain column for the record — this chip is for the at-a-glance read.
 */
export function RemovalBadge({ value }: RemovalBadgeProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="tabular text-slate-400">—</span>;
  }

  const tone =
    value >= 60
      ? "bg-signal-good/10 text-signal-good ring-signal-good/30"
      : value >= 30
      ? "bg-signal-mid/10 text-signal-mid ring-signal-mid/30"
      : "bg-signal-low/10 text-signal-low ring-signal-low/30";

  return (
    <div className="flex items-center justify-end">
      <span
        className={`tabular inline-flex min-w-[3.5rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${tone}`}
      >
        {value.toFixed(1)}%
      </span>
    </div>
  );
}
