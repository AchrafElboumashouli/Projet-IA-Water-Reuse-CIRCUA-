import { ComplianceStatus } from "@/types";

const CONFIG: Record<ComplianceStatus["status"], { label: string; className: string }> = {
  both: { label: "Conforme MA + EU", className: "bg-aqua-500/15 text-aqua-400 border border-aqua-500/30" },
  morocco: { label: "Conforme MA seulement", className: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
  europe: { label: "Conforme EU seulement", className: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
  none: { label: "Non conforme", className: "bg-coral-500/15 text-coral-400 border border-coral-500/30" },
  unknown: { label: "Donnée indisponible", className: "bg-ink-700/50 text-ink-600 border border-ink-600" },
};

export default function ComplianceBadge({ compliance }: { compliance: ComplianceStatus }) {
  const cfg = CONFIG[compliance.status];
  return <span className={`pill ${cfg.className}`}>{cfg.label}</span>;
}
