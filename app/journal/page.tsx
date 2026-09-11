"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Radar, X } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, LoadingState, ErrorState } from "@/components/ui";
import { CalendarDay, DayDetail } from "@/types";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const METHOD_LABELS: Record<string, string> = {
  zscore: "Z-score",
  isolation_forest: "Isolation Forest",
  autoencoder: "Autoencoder",
};

export default function JournalPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Bornes du mois affiché : on ne demande la détection d'anomalies que
  // sur cette fenêtre (coûteux en calcul sur une trop longue période).
  const monthStart = new Date(year, month, 1).toISOString();
  const monthEnd = new Date(year, month + 1, 1).toISOString();

  const { data: calendar, error, isLoading } = useSWR(["calendar", year, month], () =>
    api.calendar({ date_from: monthStart, date_to: monthEnd, include_anomalies: true }) as Promise<Record<string, CalendarDay>>
  );

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // lundi = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(startOffset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  function dayKey(d: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  return (
    <div>
      <PageHeader
        title="Journal"
        subtitle="Calendrier des jours ayant connu une alerte (captures nulles) ou une anomalie détectée"
        icon={CalendarDays}
      />

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <button className="btn-ghost !px-2 !py-1.5" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft size={16} />
          </button>
          <h3 className="text-sm font-semibold text-white">
            {MONTHS[month]} {year}
          </h3>
          <button className="btn-ghost !px-2 !py-1.5" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 text-[11px] text-ink-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-coral-500" /> Rouge : alerte critique OU anomalie Isolation Forest / Autoencoder
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Orange : alerte avertissement OU anomalie Z-score seule
          </span>
        </div>

        {error ? (
          <ErrorState message={String(error.message || error)} />
        ) : isLoading || !calendar ? (
          <LoadingState />
        ) : (
          <>
            <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11px] uppercase text-ink-600">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {days.map((d, i) => {
                if (d === null) return <div key={i} />;
                const key = dayKey(d);
                const info = calendar[key];
                const hasEvent = !!info && info.count > 0;
                const isCritical = !!info && info.critical > 0;
                return (
                  <button
                    key={i}
                    disabled={!hasEvent}
                    onClick={() => setSelectedDay(key)}
                    className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border text-sm transition ${
                      hasEvent
                        ? isCritical
                          ? "border-coral-500/50 bg-coral-500/15 text-coral-300 hover:bg-coral-500/25 cursor-pointer"
                          : "border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                        : "border-ink-700 bg-ink-800/40 text-ink-500"
                    }`}
                  >
                    <span className="font-mono font-semibold">{d}</span>
                    {hasEvent && (
                      <span className="flex items-center gap-1 text-[9px]">
                        {info.null_alert_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <AlertTriangle size={9} /> {info.null_alert_count}
                          </span>
                        )}
                        {info.anomaly_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Radar size={9} /> {info.anomaly_count}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {selectedDay && <DayModal day={selectedDay} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}

function DayModal({ day, onClose }: { day: string; onClose: () => void }) {
  const { data, isLoading } = useSWR(["day-detail", day], () => api.calendarDay(day, true) as Promise<DayDetail>);

  const totalEvents = (data?.alerts.length ?? 0) + (data?.anomalies.length ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card max-h-[80vh] w-full max-w-lg overflow-y-auto p-0" onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <h3 className="text-sm font-semibold text-white">Événements du {day}</h3>
          <button onClick={onClose} className="text-ink-600 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {isLoading || !data ? (
            <LoadingState />
          ) : totalEvents === 0 ? (
            <p className="text-sm text-ink-600">Aucun événement ce jour-là.</p>
          ) : (
            <div className="space-y-3">
              {data.alerts.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                    Captures nulles consécutives
                  </p>
                  <div className="space-y-2">
                    {data.alerts.map((a) => (
                      <div key={a.id} className="rounded-xl border border-ink-700 bg-ink-800/50 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium text-white">
                            SET {a.set_number} — {a.parameter}
                          </span>
                          <span
                            className={`pill ${
                              a.severity === "critical"
                                ? "bg-coral-500/15 text-coral-400 border border-coral-500/30"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {a.severity}
                          </span>
                        </div>
                        <p className="text-xs text-ink-500">{a.message}</p>
                        <p className="mt-1 text-[11px] text-ink-600">
                          {new Date(a.created_at).toLocaleTimeString("fr-FR")} · {a.consecutive_count} capture(s) nulle(s) consécutive(s)
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.anomalies.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                    Anomalies détectées
                  </p>
                  <div className="space-y-2">
                    {data.anomalies.map((a, i) => (
                      <div key={i} className="rounded-xl border border-ink-700 bg-ink-800/50 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-sm font-medium text-white">SET {a.set_number}</span>
                          <span
                            className={`pill ${
                              a.severity === "critical"
                                ? "bg-coral-500/15 text-coral-400 border border-coral-500/30"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {METHOD_LABELS[a.method] ?? a.method}
                          </span>
                        </div>
                        <p className="text-xs text-ink-500">{a.cause}</p>
                        <p className="mt-1 text-[11px] text-ink-600">{new Date(a.created_at).toLocaleTimeString("fr-FR")}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
