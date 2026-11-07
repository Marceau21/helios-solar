import type { DeviceInfo, EnergyDay, PowerPoint, PowerSnapshot, Vendor } from "@/types/energy";

/**
 * Contrat que chaque connecteur fabricant doit respecter.
 * Les connecteurs convertissent TOUJOURS vers le format commun (W et kWh).
 */
export interface Connector {
  readonly vendor: Vendor;
  /** Intervalle minimal raisonnable entre deux appels "live" (quotas fabricants). */
  readonly minPollSeconds: number;
  getCurrent(): Promise<PowerSnapshot>;
  getDailyEnergy(from: string, to: string): Promise<EnergyDay[]>;
  getPowerCurve(day: string): Promise<PowerPoint[]>;
  getDevices(): Promise<DeviceInfo[]>;
}

export class ConnectorError extends Error {
  constructor(
    public vendor: Vendor,
    message: string,
    public status?: number,
  ) {
    super(`[${vendor}] ${message}`);
  }
}

export async function fetchJson<T>(vendor: Vendor, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ConnectorError(vendor, `HTTP ${res.status} — ${body.slice(0, 200)}`, res.status);
  }
  return res.json() as Promise<T>;
}

export const kw = (v: number | undefined | null) => (v == null ? null : Math.round(v * 1000));
export const kwh = (wh: number | undefined | null) => (wh == null ? null : Math.round(wh) / 1000);
