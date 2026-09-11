"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Beaker,
  CalendarDays,
  Database,
  Droplets,
  GitCompare,
  LayoutDashboard,
  Waves,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Monitoring temps réel", icon: LayoutDashboard },
  { href: "/statistiques", label: "Statistiques globales", icon: BarChart3 },
  { href: "/analyse", label: "Analyse scientifique", icon: Activity },
  { href: "/comparaison", label: "Comparaison Sets & IN/OUT", icon: GitCompare },
  { href: "/alertes", label: "Alertes", icon: AlertTriangle },
  { href: "/journal", label: "Journal", icon: CalendarDays },
  { href: "/qualite", label: "Qualité de l'eau", icon: Droplets },
  { href: "/etudes", label: "Études & Cycles", icon: Beaker },
  { href: "/donnees", label: "Tableau de données", icon: Database },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-ink-700 bg-ink-950/60 px-3 py-5">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-aqua-600/20 text-aqua-400">
          <Waves size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">AquaWatch</p>
          <p className="text-[11px] text-ink-600 leading-tight">Monitoring qualité eau</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname?.startsWith(href));
          return (
            <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`}>
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-3 text-[11px] text-ink-600">
        <p className="font-medium text-ink-500 mb-1">Source de données</p>
        <p>Toutes les données transitent par l&apos;API de l&apos;équipe stockage — aucun accès DB direct.</p>
      </div>
    </aside>
  );
}
