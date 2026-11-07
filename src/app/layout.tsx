import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_MODE } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Helios — supervision solaire",
  description: "Votre maison en 3D, votre production solaire en direct.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-panel px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="5" fill="var(--color-solar)" />
              {Array.from({ length: 8 }).map((_, i) => (
                <line key={i} x1="12" y1="2" x2="12" y2="5" stroke="var(--color-solar)" strokeWidth="2" strokeLinecap="round" transform={`rotate(${i * 45} 12 12)`} />
              ))}
            </svg>
            Helios
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link className="rounded-md px-3 py-1.5 hover:bg-paper" href="/installer">
              Installateur
            </Link>
            <Link className="rounded-md px-3 py-1.5 hover:bg-paper" href="/home">
              Particulier
            </Link>
            {DEMO_MODE && (
              <span title="Données simulées : aucune mesure réelle" className="ml-2 rounded-full bg-solar/15 px-2.5 py-1 text-xs font-semibold text-[#8a5d00]">
                Démo
              </span>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
