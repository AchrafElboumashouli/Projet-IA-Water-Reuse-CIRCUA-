"use client";

import { Fragment } from "react";
import { ComputedFields, computeAllRows } from "@/lib/calculations";
import { PARAMETERS, STAGES } from "@/lib/constants";
import { CycleResultRow, DraftRow, Stage } from "@/lib/types";
import { NumberCell } from "./NumberCell";
import { RemovalBadge } from "./RemovalBadge";

interface CycleTableProps {
  rows: DraftRow[] | CycleResultRow[];
  editable: boolean;
  onReplicateChange?: (
    parameter: string,
    stage: Stage,
    field: "replicate_1" | "replicate_2" | "replicate_3",
    value: number | null
  ) => void;
}

function isCalculated(row: DraftRow | CycleResultRow): row is CycleResultRow {
  return "average" in row;
}

const STAGE_STYLES: Record<Stage, { border: string; label: string }> = {
  Wastewater: { border: "border-l-4 border-stage-wastewater", label: "text-stage-wastewater" },
  "Planted Series": { border: "border-l-4 border-stage-planted", label: "text-stage-planted" },
  "Control Series": { border: "border-l-4 border-stage-control", label: "text-stage-control" },
};

function parseCellValue(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export function CycleTable({ rows, editable, onReplicateChange }: CycleTableProps) {
  // Editing: recompute live on every keystroke for instant feedback.
  // Read-only: trust exactly what the backend calculated and persisted.
  const liveComputed = editable ? computeAllRows(rows) : null;
  const byKey = new Map<string, DraftRow | CycleResultRow>();
  for (const row of rows) byKey.set(`${row.parameter}|${row.stage}`, row);

  function computedFor(key: string, row: DraftRow | CycleResultRow): ComputedFields {
    if (liveComputed) return liveComputed[key];
    if (isCalculated(row)) {
      return {
        average: row.average,
        std: row.std,
        removal_1: row.removal_1,
        removal_2: row.removal_2,
        removal_3: row.removal_3,
        removal_percent: row.removal_percent,
        removal_std: row.removal_std,
      };
    }
    return {
      average: null,
      std: null,
      removal_1: null,
      removal_2: null,
      removal_3: null,
      removal_percent: null,
      removal_std: null,
    };
  }

  const headerCell =
    "px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wide text-slate-500";
  const headerCellRight =
    "px-3 py-2 text-right text-2xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-line bg-white shadow-sm">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead className="sticky top-0 bg-slate-50">
          <tr className="border-b border-slate-line">
            <th className={headerCell}>Parameter</th>
            <th className={headerCell}>Stage</th>
            <th className={headerCellRight}>Replicate 1</th>
            <th className={headerCellRight}>Replicate 2</th>
            <th className={headerCellRight}>Replicate 3</th>
            <th className={`${headerCellRight} bg-slate-100/60`}>Average</th>
            <th className={`${headerCellRight} bg-slate-100/60`}>STD</th>
            <th className={headerCellRight}>Removal 1</th>
            <th className={headerCellRight}>Removal 2</th>
            <th className={headerCellRight}>Removal 3</th>
            <th className={`${headerCellRight} bg-slate-100/60`}>Removal (%)</th>
            <th className={`${headerCellRight} bg-slate-100/60`}>Removal STD</th>
          </tr>
        </thead>
        <tbody>
          {PARAMETERS.map((parameter, pIdx) => (
            <Fragment key={parameter}>
              {STAGES.map((stage, sIdx) => {
                const key = `${parameter}|${stage}`;
                const row = byKey.get(key) ?? {
                  parameter,
                  stage,
                  replicate_1: null,
                  replicate_2: null,
                  replicate_3: null,
                };
                const c = computedFor(key, row);
                const isFirstStageRow = sIdx === 0;
                const isWastewater = stage === "Wastewater";
                const style = STAGE_STYLES[stage];
                const zebra = pIdx % 2 === 1 ? "bg-slate-50/40" : "";

                return (
                  <tr
                    key={key}
                    className={`${zebra} ${
                      isFirstStageRow ? "border-t-2 border-t-slate-200" : "border-t border-slate-line"
                    }`}
                  >
                    <td className="px-3 py-1.5 align-top font-medium text-ink">
                      {isFirstStageRow ? parameter : ""}
                    </td>
                    <td className={`px-3 py-1.5 ${style.border}`}>
                      <span className={`text-xs font-medium ${style.label}`}>{stage}</span>
                    </td>

                    {(["replicate_1", "replicate_2", "replicate_3"] as const).map(
                      (field) => (
                        <td key={field} className="px-2 py-1">
                          {editable ? (
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              className="cell-input px-1 py-1 text-entry font-medium"
                              value={row[field] ?? ""}
                              placeholder="—"
                              onChange={(e) =>
                                onReplicateChange?.(
                                  parameter,
                                  stage,
                                  field,
                                  parseCellValue(e.target.value)
                                )
                              }
                            />
                          ) : (
                            <div className="px-1 py-1 text-right">
                              <span className="tabular font-medium text-entry">
                                {row[field] ?? "—"}
                              </span>
                            </div>
                          )}
                        </td>
                      )
                    )}

                    <td className="bg-slate-50/60 px-3 py-1.5 text-right">
                      <NumberCell value={c.average} />
                    </td>
                    <td className="bg-slate-50/60 px-3 py-1.5 text-right">
                      <NumberCell value={c.std} />
                    </td>

                    {isWastewater ? (
                      <>
                        <td className="px-3 py-1.5 text-right text-slate-300">n/a</td>
                        <td className="px-3 py-1.5 text-right text-slate-300">n/a</td>
                        <td className="px-3 py-1.5 text-right text-slate-300">n/a</td>
                        <td className="bg-slate-50/60 px-3 py-1.5 text-right text-slate-300">
                          n/a
                        </td>
                        <td className="bg-slate-50/60 px-3 py-1.5 text-right text-slate-300">
                          n/a
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-1.5 text-right">
                          <NumberCell value={c.removal_1} decimals={1} />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <NumberCell value={c.removal_2} decimals={1} />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <NumberCell value={c.removal_3} decimals={1} />
                        </td>
                        <td className="bg-slate-50/60 px-3 py-1.5">
                          <RemovalBadge value={c.removal_percent} />
                        </td>
                        <td className="bg-slate-50/60 px-3 py-1.5 text-right">
                          <NumberCell value={c.removal_std} decimals={2} />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
