"use client";

import type { Installation } from "@/types/energy";
import { EnergyLedger } from "./EnergyLedger";
import { HistoryCharts } from "./HistoryCharts";
import { useHistory, useLive, useLocalHour } from "./hooks";
import { HouseScene } from "./Scene";

export function LiveInstallation({ inst }: { inst: Installation }) {
  const { snapshot, error } = useLive(inst.id);
  const history = useHistory(inst.id, 30);
  const hour = useLocalHour(inst.timezone);
  const hasBattery = inst.devices.some((d) => d.kind === "battery");
  const kwc = (inst.layout.panels.length * inst.layout.panelWattage) / 1000;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{inst.customerName}</h1>
        <p className="text-sm text-ink-soft">
          {inst.address} · {inst.layout.panels.length} panneaux · {kwc.toFixed(1)} kWc
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="relative h-[52vh] min-h-[340px] overflow-hidden rounded-2xl border border-line bg-panel lg:h-[64vh]">
          <HouseScene building={inst.building} layout={inst.layout} snapshot={snapshot} hasBattery={hasBattery} localHour={hour} />
          <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-panel/85 px-2 py-1 text-xs text-ink-soft">
            Faites glisser pour tourner autour de la maison · molette pour zoomer
          </p>
        </div>
        <aside className="rounded-2xl border border-line bg-panel p-5">
          {error ? (
            <div className="text-sm">
              <p className="font-semibold text-alert">Impossible de joindre l&apos;onduleur.</p>
              <p className="mt-1 text-ink-soft">{error}</p>
              <p className="mt-2 text-ink-soft">Nouvelle tentative automatique dans une minute.</p>
            </div>
          ) : (
            <EnergyLedger s={snapshot} hasBattery={hasBattery} />
          )}
        </aside>
      </div>

      <div className="mt-4 rounded-2xl border border-line bg-panel p-5">
        {history.data ? (
          <HistoryCharts daily={history.data.daily} curve={history.data.curve} importTariff={inst.tariffImportPerKwh} exportTariff={inst.tariffExportPerKwh} />
        ) : (
          <p className="py-10 text-center text-sm text-ink-soft">{history.error ?? "Chargement de l'historique…"}</p>
        )}
      </div>
    </div>
  );
}
