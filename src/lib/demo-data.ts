import type { Installation } from "@/types/energy";
import { autoLayout, syntheticBuilding } from "./solar/geometry";

/**
 * Portefeuille de démonstration. Noms et adresses FICTIFS.
 * Stocké en mémoire du serveur : les créations en mode démo disparaissent au redémarrage.
 */
function demo(id: string, customerName: string, address: string, lat: number, lng: number, kw: number, seed: number, batteryKwh: number | null): Installation {
  const building = syntheticBuilding(seed);
  return {
    id,
    customerId: `c-${id}`,
    customerName,
    name: "Installation principale",
    address,
    latitude: lat,
    longitude: lng,
    timezone: "Australia/Sydney",
    systemSizeKw: kw,
    tariffImportPerKwh: 0.32,
    tariffExportPerKwh: 0.05,
    commissionedOn: "2025-03-14",
    vendor: "demo",
    building,
    layout: autoLayout(building, kw, lat),
    devices: [
      { kind: "inverter", model: "Onduleur démo", serialNumber: `DEMO-${id}-INV`, ratedPowerKw: kw },
      ...(batteryKwh ? [{ kind: "battery" as const, model: "Batterie démo", serialNumber: `DEMO-${id}-BAT`, capacityKwh: batteryKwh }] : []),
      { kind: "meter", model: "Compteur démo", serialNumber: `DEMO-${id}-MTR` },
    ],
    isDemo: true,
  };
}

const g = globalThis as unknown as { __heliosDemo?: Map<string, Installation> };

export function demoStore(): Map<string, Installation> {
  if (!g.__heliosDemo) {
    g.__heliosDemo = new Map(
      [
        demo("demo-1", "Famille Martin (démo)", "12 Exemple St, Ryde NSW", -33.815, 151.104, 6.6, 0.31, 13.5),
        demo("demo-2", "S. Nguyen (démo)", "8 Fictive Ave, Parramatta NSW", -33.814, 151.003, 10.0, 0.72, 10),
        demo("demo-3", "J. Wilson (démo)", "41 Sample Rd, Hornsby NSW", -33.703, 151.099, 5.0, 0.12, null),
        demo("demo-4", "Famille Rossi (démo)", "3 Placeholder Cres, Cronulla NSW", -34.055, 151.153, 8.2, 0.55, 13.5),
      ].map((i) => [i.id, i]),
    );
  }
  return g.__heliosDemo;
}
