"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtKw } from "@/lib/format";
import type { PowerSnapshot } from "@/types/energy";
import { ENERGY } from "./energy-colors";

export interface PortfolioItem {
  id: string;
  customerName: string;
  address: string;
  kwc: number;
  hasBattery: boolean;
  isDemo: boolean;
}

type Row = { id: string; snapshot: PowerSnapshot | null; error: string | null };

function statusOf(item: PortfolioItem, r: Row | undefined, hour: number) {
  if (!r) return { tone: "muted", text: "Chargement…" };
  if (r.error || !r.snapshot) return { tone: "alert", text: "Onduleur injoignable" };
  const daylight = hour > 9 && hour < 16;
  const ratio = (r.snapshot.productionW ?? 0) / (item.kwc * 1000);
  if (daylight && ratio < 0.08) return { tone: "alert", text: "Production anormalement basse" };
  return { tone: "ok", text: "Normal" };
}

export function PortfolioTable({ items }: { items: PortfolioItem[] }) {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [hour, setHour] = useState(12);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch("/api/portfolio", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (alive && r) setRows(Object.fromEntries((r.rows as Row[]).map((x) => [x.id, x])));
      setHour(new Date().getHours() + new Date().getMinutes() / 60);
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const totalProd = Object.values(rows).reduce((a, r) => a + (r.snapshot?.productionW ?? 0), 0);
  const alerts = items.filter((i) => statusOf(i, rows[i.id], hour).tone === "alert").length;

  return (
    <div className="space-y-4">
      <dl className="flex flex-wrap gap-x-10 gap-y-3 rounded-2xl border border-line bg-panel px-5 py-4">
        <div>
          <dt className="text-sm text-ink-soft">Installations suivies</dt>
          <dd className="text-2xl font-bold">{items.length}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Production totale en ce moment</dt>
          <dd className="text-2xl font-bold" style={{ color: ENERGY.solar }}>{fmtKw(totalProd)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">À vérifier</dt>
          <dd className={`text-2xl font-bold ${alerts ? "text-alert" : ""}`}>{alerts}</dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-ink-soft">
            <tr>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-3 py-3 font-medium">Puissance installée</th>
              <th className="px-3 py-3 font-medium">Production</th>
              <th className="px-3 py-3 font-medium">Consommation</th>
              <th className="px-3 py-3 font-medium">Batterie</th>
              <th className="px-5 py-3 font-medium">État</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const r = rows[i.id];
              const s = r?.snapshot;
              const st = statusOf(i, r, hour);
              return (
                <tr key={i.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                  <td className="px-5 py-3">
                    <Link href={`/installer/${i.id}`} className="font-semibold hover:underline">
                      {i.customerName}
                    </Link>
                    <div className="text-xs text-ink-soft">{i.address}</div>
                  </td>
                  <td className="px-3 py-3">{i.kwc.toFixed(1)} kWc</td>
                  <td className="px-3 py-3 font-semibold">{fmtKw(s?.productionW)}</td>
                  <td className="px-3 py-3">{fmtKw(s?.consumptionW)}</td>
                  <td className="px-3 py-3">{i.hasBattery ? (s?.batterySocPct != null ? `${Math.round(s.batterySocPct)} %` : "—") : "Aucune"}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 font-medium ${st.tone === "alert" ? "text-alert" : st.tone === "ok" ? "text-battery" : "text-ink-soft"}`}>
                      <span className="h-2 w-2 rounded-full bg-current" />
                      {st.text}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <p className="p-8 text-center text-ink-soft">Aucune installation. Ajoutez votre premier client pour commencer.</p>}
      </div>
    </div>
  );
}
