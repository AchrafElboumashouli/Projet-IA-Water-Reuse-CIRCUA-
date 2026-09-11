export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPlotAsPNG(graphDiv: HTMLElement | null, filename: string) {
  if (!graphDiv) return;
  const { default: Plotly } = await import("plotly.js-dist-min");
  await Plotly.downloadImage(graphDiv as never, { format: "png", filename, width: 1200, height: 700 });
}
