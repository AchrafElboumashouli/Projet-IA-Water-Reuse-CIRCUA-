"use client";

import { Fragment } from "react";
import { ComputedFields, computeAllRows } from "@/lib/calculations";
import { PARAMETERS, PARAMETER_UNITS, STAGE_ROLES, STAGE_ROLE_LABELS } from "@/lib/constants";
import { CycleResultRow, DraftRow, StageRole } from "@/lib/types";
import { NumberCell } from "./NumberCell";
import { RemovalBadge } from "./RemovalBadge";

// stage_1 is always the reference/untreated sample: no Removal % column
// for its row.
const BASELINE_STAGE_ROLE: StageRole = "stage_1";

interface CycleTableProps {
  rows: DraftRow[] | CycleResultRow[];
  editable: boolean;
  onReplicateChange?: (
    parameter: string,
    stage: StageRole,
    field: "replicate_1" | "replicate_2" | "replicate_3",
    value: number | null
  ) => void;
}

function isCalculated(row: DraftRow | CycleResultRow): row is CycleResultRow {
  return "average" in row;
}

/** Resolves the stable stage role for a row, regardless of type:
 * `DraftRow.stage` already IS the role (client-side draft, never
 * touches the DB); `CycleResultRow.stage_role` is the role returned
 * by the backend. The role is used only to key/group rows and pick a
 * visual accent — the "Stage" column itself displays the real stage
 * label (Wastewater / Planted Series / Control Series), not the role. */
function roleOf(row: DraftRow | CycleResultRow): StageRole {
  return isCalculated(row) ? row.stage_role : row.stage;
}

const STAGE_STYLES: Record<StageRole, { border: string; label: string }> = {
  stage_1: { border: "border-l-4 border-stage-wastewater", label: "text-stage-wastewater" },
  stage_2: { border: "border-l-4 border-stage-planted", label: "text-stage-planted" },
  stage_3: { border: "border-l-4 border-stage-control", label: "text-stage-control" },
};

function parseCellValue(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export function CycleTable({ rows, editable, onReplicateChange }: CycleTableProps) {
  // Editing: recompute live on every keystroke for instant feedback.
  // Read-only: trust exactly what the backend calculated and persisted.
  // `editable` is only ever true when `rows` is DraftRow[] (the new-cycle
  // form); CycleResultRow[] (saved/read-only data) always passes
  // editable=false, so this cast is safe.
  const liveComputed = editable ? computeAllRows(rows as DraftRow[]) : null;
  const byKey = new Map<string, DraftRow | CycleResultRow>();
  for (const row of rows) byKey.set(`${row.parameter}|${roleOf(row)}`, row);

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
          {PARAMETERS.map((parameter, pIdx) => {
            const unit = PARAMETER_UNITS[parameter];
            return (
              <Fragment key={parameter}>
                {STAGE_ROLES.map((stage, sIdx) => {
                  const key = `${parameter}|${stage}`;
                  const row = byKey.get(key) ?? {
                    parameter,
                    stage,
                    stage_role: stage,
                    replicate_1: null,
                    replicate_2: null,
                    replicate_3: null,
                  };
                  const c = computedFor(key, row);
                  const isFirstStageRow = sIdx === 0;
                  const isBaseline = stage === BASELINE_STAGE_ROLE;
                  const style = STAGE_STYLES[stage];
                  const zebra = pIdx % 2 === 1 ? "bg-slate-50/40" : "";
                  // Real stage label ("Wastewater"/"Planted Series"/
                  // "Control Series"): use the value the backend already
                  // resolved for saved rows, or the same fixed mapping
                  // for the live draft form (must stay in sync — see
                  // backend app/schemas/cycle.py::STAGE_LABELS).
                  const stageLabel = isCalculated(row) ? row.stage : STAGE_ROLE_LABELS[stage];

                  return (
                    <tr
                      key={key}
                      className={`${zebra} ${
                        isFirstStageRow ? "border-t-2 border-t-slate-200" : "border-t border-slate-line"
                      }`}
                    >
                      <td className="px-3 py-1.5 align-top font-medium text-ink">
                        {isFirstStageRow ? (
                          <>
                            {parameter}
                            {unit ? (
                              <span className="ml-1 font-normal text-slate-400">({unit})</span>
                            ) : null}
                          </>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={`px-3 py-1.5 ${style.border}`}>
                        <span className={`text-xs font-medium ${style.label}`}>{stageLabel}</span>
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

                      {isBaseline ? (
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
