import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cycle Results — Smart Water Quality System",
  description: "Laboratory cycle data entry for treatment performance tracking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-slate-line bg-ink">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-semibold tracking-tight text-white">
                Smart Water Quality System
              </span>
              <span className="text-2xs uppercase tracking-[0.14em] text-slate-400">
                Cycle Results
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
