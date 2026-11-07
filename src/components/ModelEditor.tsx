"use client";

import { useState } from "react";
import { autoLayout } from "@/lib/solar/geometry";
import type { BuildingModel, PanelLayout } from "@/types/energy";
import { HouseScene } from "./Scene";

const SOURCE_LABEL: Record<BuildingModel["source"], string> = {
  google_solar: "Google Solar API",
  manual: "Corrigé manuellement",
  demo: "Maison générique (démo)",
};

/**
 * Éditeur du modèle : l'installateur vérifie le toit, corrige pente/orientation
 * et clique sur le toit pour poser ou retirer les panneaux réellement installés.
 */
export function ModelEditor({
  building: initialBuilding,
  layout: initialLayout,
  latitude,
  systemSizeKw,
  onSave,
  saveLabel = "Enregistrer le modèle",
  warnings = [],
}: {
  building: BuildingModel;
  layout: PanelLayout;
  latitude: number;
  systemSizeKw: number;
  onSave: (b: BuildingModel, l: PanelLayout) => Promise<void>;
  saveLabel?: string;
  warnings?: string[];
}) {
  const [building, setBuilding] = useState(initialBuilding);
  const [layout, setLayout] = useState(initialLayout);
  const [selected, setSelected] = useState(building.roofSegments[0]?.id);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const seg = building.roofSegments.find((s) => s.id === selected);
  const kwc = (layout.panels.length * layout.panelWattage) / 1000;

  const updateSeg = (patch: Partial<NonNullable<typeof seg>>) => {
    if (!seg) return;
    setBuilding({
      ...building,
      source: building.source === "demo" ? "demo" : "manual",
      roofSegments: building.roofSegments.map((s) => (s.id === seg.id ? { ...s, ...patch } : s)),
    });
    // Les panneaux de ce pan sont conservés mais peuvent déborder : on les retire si la géométrie change.
    setLayout((l) => ({ ...l, panels: l.panels.filter((p) => p.segmentId !== seg.id) }));
    setStatus("idle");
  };

  const save = async () => {
    setStatus("saving");
    try {
      await onSave(building, layout);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border border-line bg-panel">
        <HouseScene
          building={building}
          layout={layout}
          editable
          localHour={12}
          onLayoutChange={(l) => {
            setLayout(l);
            setStatus("idle");
          }}
        />
        <p className="pointer-events-none absolute bottom-3 left-3 max-w-[90%] rounded-md bg-panel/90 px-2 py-1 text-xs text-ink-soft">
          Cliquez sur un emplacement jaune pour poser un panneau, sur un panneau pour le retirer.
        </p>
      </div>

      <aside className="space-y-5 rounded-2xl border border-line bg-panel p-5 text-sm">
        <div>
          <div className="text-ink-soft">Source du modèle</div>
          <div className="font-semibold">{SOURCE_LABEL[building.source]}</div>
          {building.imageryQuality && <div className="text-xs text-ink-soft">Qualité d&apos;imagerie : {building.imageryQuality}</div>}
        </div>

        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-solar/10 p-3 text-xs text-[#6b4a00]">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-ink-soft">Panneaux posés</span>
            <span className="text-xl font-bold">
              {layout.panels.length} <span className="text-sm font-medium text-ink-soft">· {kwc.toFixed(2)} kWc</span>
            </span>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              className="flex-1 rounded-lg border border-line px-3 py-2 font-medium hover:bg-paper"
              onClick={() => setLayout(autoLayout(building, systemSizeKw, latitude, layout))}
            >
              Remplir pour {systemSizeKw} kW
            </button>
            <button className="rounded-lg border border-line px-3 py-2 font-medium hover:bg-paper" onClick={() => setLayout({ ...layout, panels: [] })}>
              Vider
            </button>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-ink-soft">Corriger un pan de toit</legend>
          <div className="flex flex-wrap gap-1.5">
            {building.roofSegments.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${s.id === selected ? "bg-ink text-white" : "bg-paper"}`}
              >
                Pan {i + 1} · {Math.round(s.azimuthDeg)}°
              </button>
            ))}
          </div>
          {seg && (
            <>
              <label className="block">
                <span className="flex justify-between">
                  Inclinaison <b>{seg.pitchDeg.toFixed(0)}°</b>
                </span>
                <input type="range" min={0} max={45} value={seg.pitchDeg} onChange={(e) => updateSeg({ pitchDeg: +e.target.value })} className="w-full accent-ink" />
              </label>
              <label className="block">
                <span className="flex justify-between">
                  Orientation <b>{Math.round(seg.azimuthDeg)}° {["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(seg.azimuthDeg / 45) % 8]}</b>
                </span>
                <input type="range" min={0} max={359} value={seg.azimuthDeg} onChange={(e) => updateSeg({ azimuthDeg: +e.target.value })} className="w-full accent-ink" />
              </label>
              <label className="block">
                <span className="flex justify-between">
                  Largeur <b>{seg.width.toFixed(1)} m</b>
                </span>
                <input type="range" min={2} max={30} step={0.1} value={seg.width} onChange={(e) => updateSeg({ width: +e.target.value })} className="w-full accent-ink" />
              </label>
            </>
          )}
        </fieldset>

        <button
          onClick={save}
          disabled={status === "saving"}
          className="w-full rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:bg-ink/90 disabled:opacity-60"
        >
          {status === "saving" ? "Enregistrement…" : saveLabel}
        </button>
        {status === "saved" && <p className="text-center text-battery">Modèle enregistré.</p>}
        {status === "error" && <p className="text-center text-alert">L&apos;enregistrement a échoué. Réessayez.</p>}
      </aside>
    </div>
  );
}
