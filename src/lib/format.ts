import type { EnergyDay } from "@/types/energy";

export const fmtKw = (w: number | null | undefined, digits = 1) =>
  w == null ? "—" : `${(w / 1000).toFixed(digits)} kW`;

export const fmtKwh = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : `${v.toFixed(digits)} kWh`;

export const fmtAud = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(v);

/**
 * Économies estimées : électricité autoconsommée non achetée + revenus d'injection.
 * C'est une ESTIMATION basée sur les tarifs saisis, pas une facture.
 */
export function estimateSavings(days: EnergyDay[], importTariff: number, exportTariff: number) {
  let saved = 0;
  let known = 0;
  for (const d of days) {
    if (d.selfConsumedKwh == null && d.exportedKwh == null) continue;
    saved += (d.selfConsumedKwh ?? 0) * importTariff + (d.exportedKwh ?? 0) * exportTariff;
    known++;
  }
  return known ? saved : null;
}

export const sum = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
