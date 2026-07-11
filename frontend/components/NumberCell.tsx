interface NumberCellProps {
  value: number | null;
  decimals?: number;
}

/** Read-only, right-aligned, tabular-numeral cell for calculated fields. */
export function NumberCell({ value, decimals = 2 }: NumberCellProps) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className="tabular text-slate-400">—</span>;
  }
  return <span className="tabular text-slate-600">{value.toFixed(decimals)}</span>;
}
