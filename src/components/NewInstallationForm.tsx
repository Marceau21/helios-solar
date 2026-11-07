"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BuildingModel, PanelLayout } from "@/types/energy";
import { ModelEditor } from "./ModelEditor";

interface BuildingResponse {
  address: { formattedAddress: string; latitude: number; longitude: number };
  building: BuildingModel;
  suggestedLayout: PanelLayout;
  warnings: string[];
}

export function NewInstallationForm() {
  const router = useRouter();
  const [form, setForm] = useState({ customerName: "", customerEmail: "", address: "", systemSizeKw: "6.6", batteryKwh: "" });
  const [result, setResult] = useState<BuildingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/building", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: form.address, targetKw: Number(form.systemSizeKw) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Erreur");
      setResult(j);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const create = async (building: BuildingModel, layout: PanelLayout) => {
    if (!result) return;
    const r = await fetch("/api/installations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        address: result.address.formattedAddress,
        latitude: result.address.latitude,
        longitude: result.address.longitude,
        systemSizeKw: Number(form.systemSizeKw),
        batteryKwh: form.batteryKwh ? Number(form.batteryKwh) : null,
        building,
        layout,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error("Création impossible");
    router.push(`/installer/${j.id}`);
  };

  const input = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base";

  return (
    <div className="space-y-6">
      <form onSubmit={generate} className="grid gap-4 rounded-2xl border border-line bg-panel p-5 sm:grid-cols-2">
        <label className="text-sm">
          Nom du client
          <input required minLength={2} className={input} value={form.customerName} onChange={set("customerName")} />
        </label>
        <label className="text-sm">
          E-mail du client <span className="text-ink-soft">(pour son espace)</span>
          <input type="email" className={input} value={form.customerEmail} onChange={set("customerEmail")} />
        </label>
        <label className="text-sm sm:col-span-2">
          Adresse de l&apos;installation
          <input required minLength={5} className={input} placeholder="ex. 10 Rue Example, Ryde NSW 2112" value={form.address} onChange={set("address")} />
        </label>
        <label className="text-sm">
          Puissance prévue (kW)
          <input required type="number" step="0.1" min="0.5" className={input} value={form.systemSizeKw} onChange={set("systemSizeKw")} />
        </label>
        <label className="text-sm">
          Batterie (kWh) <span className="text-ink-soft">— vide si aucune</span>
          <input type="number" step="0.1" min="0" className={input} value={form.batteryKwh} onChange={set("batteryKwh")} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button disabled={loading} className="rounded-lg bg-ink px-4 py-2.5 font-semibold text-white hover:bg-ink/90 disabled:opacity-60">
            {loading ? "Analyse du toit…" : result ? "Régénérer la maison" : "Générer la maison en 3D"}
          </button>
          {error && <p className="text-sm text-alert">{error}</p>}
        </div>
      </form>

      {result && (
        <section>
          <h2 className="mb-1 text-lg font-bold">Vérifiez le toit et posez les panneaux</h2>
          <p className="mb-3 text-sm text-ink-soft">{result.address.formattedAddress}</p>
          <ModelEditor
            key={result.address.formattedAddress + result.building.roofSegments.length}
            building={result.building}
            layout={result.suggestedLayout}
            latitude={result.address.latitude}
            systemSizeKw={Number(form.systemSizeKw)}
            warnings={result.warnings}
            onSave={create}
            saveLabel="Créer l'installation"
          />
        </section>
      )}
    </div>
  );
}
