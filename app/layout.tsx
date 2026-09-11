import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "AquaWatch — Monitoring qualité de l'eau",
  description: "Dashboard de monitoring intelligent des eaux usées traitées",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="flex bg-ink-950 text-white">
        <Sidebar />
        <main className="min-h-screen flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </body>
    </html>
  );
}
