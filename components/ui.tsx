import { LucideIcon } from "lucide-react";

export function PageHeader({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-aqua-600/15 text-aqua-400">
          <Icon size={20} />
        </div>
      )}
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-sm text-ink-600">{subtitle}</p>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    default: "text-white",
    good: "text-aqua-400",
    warn: "text-amber-400",
    bad: "text-coral-400",
  }[tone];

  return (
    <div className="card px-4 py-3.5">
      <p className="text-[11px] uppercase tracking-wide text-ink-600">{label}</p>
      <p className={`stat-value ${toneClass}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-ink-600">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-600">{hint}</p>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-ink-700 text-sm text-ink-600">
      {message}
    </div>
  );
}

export function LoadingState({ message = "Chargement..." }: { message?: string }) {
  return (
    <div className="flex h-40 items-center justify-center gap-2 text-sm text-ink-600">
      <span className="h-2 w-2 animate-pulse rounded-full bg-aqua-500" />
      {message}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-xl border border-coral-500/30 bg-coral-500/5 text-sm text-coral-400">
      <span>Erreur de connexion à l&apos;API monitoring</span>
      <span className="text-xs text-ink-600">{message}</span>
    </div>
  );
}
