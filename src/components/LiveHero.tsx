"use client";

import { fmtKw } from "@/lib/format";
import type { Installation } from "@/types/energy";
import { ENERGY } from "./energy-colors";
import { useLive, useLocalHour } from "./hooks";
import { HouseScene } from "./Scene";

export function LiveInstallationHero({ inst }: { inst: Installation }) {
  const { snapshot } = useLive(inst.id);
  const hour = useLocalHour(inst.timezone);
  const hasBattery = inst.devices.some((d) => d.kind === "battery");
  return (
    <div className="relative h-[56vh] min-h-[360px] overflow-hidden rounded-3xl border border-line bg-panel">
      <HouseScene building={inst.building} layout={inst.layout} snapshot={snapshot} hasBattery={hasBattery} localHour={hour} />
      <div className="absolute top-3 left-3 flex flex-wrap gap-2 text-sm">
        {[
          { c: ENERGY.solar, l: "Production", v: snapshot?.productionW },
          { c: ENERGY.home, l: "Maison", v: snapshot?.consumptionW },
          { c: ENERGY.grid, l: "Réseau", v: snapshot ? (snapshot.gridExportW ?? 0) - (snapshot.gridImportW ?? 0) : null },
        ].map((x) => (
          <span key={x.l} className="inline-flex items-center gap-2 rounded-full bg-panel/90 px-3 py-1.5 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.c }} />
            {x.l} <b className="tabular-nums">{fmtKw(x.v ?? null)}</b>
          </span>
        ))}
      </div>
      {snapshot?.source === "demo" && (
        <span className="absolute right-3 bottom-3 rounded-md bg-panel/90 px-2 py-1 text-xs text-ink-soft">Maison et données de démonstration</span>
      )}
    </div>
  );
}
