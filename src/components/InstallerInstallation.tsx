"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BuildingModel, Installation, PanelLayout } from "@/types/energy";
import { LiveInstallation } from "./LiveInstallation";
import { ModelEditor } from "./ModelEditor";

const TABS = [
  { id: "live", label: "Supervision" },
  { id: "model", label: "Maison et panneaux" },
  { id: "devices", label: "Équipements" },
] as const;

const VENDOR_LABEL = { solaredge: "SolarEdge", enphase: "Enphase", sungrow: "Sungrow", sma: "SMA", demo: "Démonstration" } as const;
const KIND_LABEL = { inverter: "Onduleur", battery: "Batterie", meter: "Compteur", gateway: "Passerelle" } as const;

export function InstallerInstallation({ inst }: { inst: Installation }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("live");
  const router = useRouter();

  const save = async (building: BuildingModel, layout: PanelLayout) => {
    const r = await fetch(`/api/installations/${inst.id}/model`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ building, layout }),
    });
    if (!r.ok) throw new Error("save failed");
    router.refresh();
  };

  return (
    <div>
      <div className="mx-auto mt-3 max-w-[1400px] px-4 sm:px-6" role="tablist">
        <div className="inline-flex rounded-lg border border-line bg-panel p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3.5 py-1.5 font-semibold ${tab === t.id ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "live" && <LiveInstallation inst={inst} />}

      {tab === "model" && (
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <ModelEditor building={inst.building} layout={inst.layout} latitude={inst.latitude} systemSizeKw={inst.systemSizeKw} onSave={save} />
        </div>
      )}

      {tab === "devices" && (
        <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-6 sm:px-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="mb-3 font-bold">Équipements</h2>
            <ul className="divide-y divide-line text-sm">
              {inst.devices.map((d, i) => (
                <li key={i} className="flex justify-between py-2.5">
                  <span>
                    <b>{KIND_LABEL[d.kind]}</b> · {d.model ?? "Modèle inconnu"}
                  </span>
                  <span className="text-ink-soft">
                    {d.capacityKwh ? `${d.capacityKwh} kWh` : d.ratedPowerKw ? `${d.ratedPowerKw} kW` : ""} {d.serialNumber ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-line bg-panel p-5 text-sm">
            <h2 className="mb-3 font-bold">Connexion onduleur</h2>
            <p>
              Source des données : <b>{VENDOR_LABEL[inst.vendor]}</b>
            </p>
            {inst.isDemo ? (
              <p className="mt-2 text-ink-soft">
                Cette installation utilise des données simulées. Pour la relier à un vrai onduleur, configurez Supabase puis ajoutez une connexion
                SolarEdge (clé API du site) ou Enphase (autorisation OAuth du client). Voir le README.
              </p>
            ) : (
              <p className="mt-2 text-ink-soft">Les identifiants sont chiffrés côté serveur et ne sont jamais affichés.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
