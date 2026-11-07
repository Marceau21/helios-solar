"use client";

import { fmtKw } from "@/lib/format";
import { freshnessOf, type PowerSnapshot } from "@/types/energy";
import { ENERGY } from "./energy-colors";
import { useNow } from "./hooks";

function Row({ color, label, value, note }: { color: string; label: string; value: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-line py-3 last:border-0">
      <span className="mt-1 h-3 w-3 shrink-0 self-start rounded-full" style={{ background: color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-ink-soft">{label}</div>
        {note && <div className="text-xs text-ink-soft/80">{note}</div>}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

const FRESH_LABEL = { live: "En direct", recent: "Récent", stale: "Données anciennes", offline: "Hors ligne" } as const;

export function EnergyLedger({ s, hasBattery }: { s: PowerSnapshot | null; hasBattery: boolean }) {
  const now = useNow(5000);
  if (!s) return <div className="py-10 text-center text-sm text-ink-soft">Connexion à l&apos;onduleur…</div>;

  const freshness = freshnessOf(s.measuredAt, now);
  const ageS = Math.max(0, Math.round((now - new Date(s.measuredAt).getTime()) / 1000));
  const exporting = (s.gridExportW ?? 0) > 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${freshness === "live" || freshness === "recent" ? "text-battery" : "text-alert"}`}>
          <span className="h-2 w-2 rounded-full bg-current" />
          {FRESH_LABEL[freshness]}
        </span>
        <span className="text-ink-soft">
          {s.source === "demo" ? "Données de démonstration · " : ""}
          mis à jour il y a {ageS < 90 ? `${ageS} s` : `${Math.round(ageS / 60)} min`}
        </span>
      </div>
      <Row color={ENERGY.solar} label="Vos panneaux produisent" value={fmtKw(s.productionW)} />
      <Row
        color={ENERGY.home}
        label="Votre maison consomme"
        value={fmtKw(s.consumptionW)}
        note={s.consumptionW == null ? "Pas de compteur de consommation sur cette installation" : undefined}
      />
      <Row
        color={exporting ? ENERGY.solar : ENERGY.grid}
        label={exporting ? "Surplus envoyé au réseau" : "Acheté au réseau"}
        value={fmtKw(exporting ? s.gridExportW : s.gridImportW)}
      />
      {hasBattery && (
        <Row
          color={ENERGY.battery}
          label={(s.batteryChargeW ?? 0) > 30 ? "Batterie en charge" : (s.batteryDischargeW ?? 0) > 30 ? "La batterie alimente la maison" : "Batterie au repos"}
          value={s.batterySocPct == null ? "—" : `${Math.round(s.batterySocPct)} %`}
          note={(s.batteryChargeW ?? 0) > 30 ? fmtKw(s.batteryChargeW) : (s.batteryDischargeW ?? 0) > 30 ? fmtKw(s.batteryDischargeW) : undefined}
        />
      )}
    </div>
  );
}
