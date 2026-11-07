import type { DeviceInfo, EnergyDay, PowerPoint, PowerSnapshot } from "@/types/energy";
import { type Connector, ConnectorError, fetchJson, kwh } from "./types";

/**
 * Connecteur Enphase — Enlighten API v4.
 * Doc : https://developer-v4.enphase.com/docs.html
 * Auth : OAuth 2.0 (le particulier autorise l'app) + clé d'application (`key`).
 * Granularité : intervalles de 15 min ; Enphase n'offre pas de vrai "live" seconde par seconde.
 *
 * ⚠️ À valider sur un compte développeur réel : noms exacts de champs des endpoints
 *    *_lifetime et telemetry/battery selon le plan d'API souscrit (Watt / Kilowatt / Partner).
 */
const BASE = "https://api.enphaseenergy.com/api/v4";
const TOKEN_URL = "https://api.enphaseenergy.com/oauth/token";

export interface EnphaseTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

interface Summary {
  current_power?: number; // W
  energy_today?: number; // Wh
  last_report_at?: number; // epoch s
  size_w?: number;
  status?: string;
}
interface Interval {
  end_at: number;
  powr?: number;
  enwh?: number;
}
interface BatteryInterval {
  end_at: number;
  charge?: { enwh?: number };
  discharge?: { enwh?: number };
  soc?: { percent?: number };
}
interface Lifetime {
  start_date: string;
  production?: number[];
  consumption?: number[];
  import?: number[];
  export?: number[];
}

export class EnphaseConnector implements Connector {
  readonly vendor = "enphase" as const;
  readonly minPollSeconds = 900;

  constructor(
    private systemId: string,
    private apiKey: string,
    private tokens: EnphaseTokens,
    /** Appelé quand le jeton est rafraîchi, pour le re-chiffrer et le stocker. */
    private onTokensRefreshed?: (t: EnphaseTokens) => Promise<void>,
  ) {}

  private async auth(): Promise<string> {
    if (Date.now() < this.tokens.expiresAt - 60_000) return this.tokens.accessToken;
    const id = process.env.ENPHASE_CLIENT_ID;
    const secret = process.env.ENPHASE_CLIENT_SECRET;
    if (!id || !secret) throw new ConnectorError(this.vendor, "ENPHASE_CLIENT_ID/SECRET manquants");
    const q = new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.tokens.refreshToken });
    const r = await fetchJson<{ access_token: string; refresh_token: string; expires_in: number }>(
      this.vendor,
      `${TOKEN_URL}?${q}`,
      { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` } },
    );
    this.tokens = { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: Date.now() + r.expires_in * 1000 };
    await this.onTokensRefreshed?.(this.tokens);
    return this.tokens.accessToken;
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const token = await this.auth();
    const q = new URLSearchParams({ ...params, key: this.apiKey });
    return fetchJson<T>(this.vendor, `${BASE}/systems/${encodeURIComponent(this.systemId)}${path}?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async getCurrent(): Promise<PowerSnapshot> {
    const [summary, cons, batt] = await Promise.all([
      this.get<Summary>("/summary"),
      this.get<{ intervals: Interval[] }>("/telemetry/consumption_meter", { granularity: "day" }).catch(() => null),
      this.get<{ intervals: BatteryInterval[] }>("/telemetry/battery", { granularity: "day" }).catch(() => null),
    ]);
    const lastCons = cons?.intervals?.at(-1);
    const lastBatt = batt?.intervals?.at(-1);
    // Énergie sur 15 min → puissance moyenne : Wh × 4 = W
    const consumptionW = lastCons?.enwh != null ? lastCons.enwh * 4 : null;
    const productionW = summary.current_power ?? null;
    const net = productionW != null && consumptionW != null ? productionW - consumptionW : null;
    return {
      measuredAt: new Date((summary.last_report_at ?? Date.now() / 1000) * 1000).toISOString(),
      source: this.vendor,
      productionW,
      consumptionW,
      gridImportW: net == null ? null : Math.max(0, -net),
      gridExportW: net == null ? null : Math.max(0, net),
      batteryChargeW: lastBatt?.charge?.enwh != null ? lastBatt.charge.enwh * 4 : null,
      batteryDischargeW: lastBatt?.discharge?.enwh != null ? lastBatt.discharge.enwh * 4 : null,
      batterySocPct: lastBatt?.soc?.percent ?? null,
    };
  }

  async getDailyEnergy(from: string, to: string): Promise<EnergyDay[]> {
    const p = { start_date: from, end_date: to };
    const [prod, cons, imp, exp] = await Promise.all([
      this.get<Lifetime>("/energy_lifetime", p),
      this.get<Lifetime>("/consumption_lifetime", p).catch(() => null),
      this.get<Lifetime>("/energy_import_lifetime", p).catch(() => null),
      this.get<Lifetime>("/energy_export_lifetime", p).catch(() => null),
    ]);
    const start = new Date(`${prod.start_date}T00:00:00Z`);
    return (prod.production ?? []).map((wh, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const produced = kwh(wh);
      const exported = kwh(exp?.export?.[i]);
      return {
        day: d.toISOString().slice(0, 10),
        source: this.vendor,
        producedKwh: produced,
        consumedKwh: kwh(cons?.consumption?.[i]),
        importedKwh: kwh(imp?.import?.[i]),
        exportedKwh: exported,
        selfConsumedKwh: produced != null && exported != null ? Math.max(0, produced - exported) : null,
      };
    });
  }

  async getPowerCurve(day: string): Promise<PowerPoint[]> {
    const start_at = String(Math.floor(new Date(`${day}T00:00:00`).getTime() / 1000));
    const [prod, cons] = await Promise.all([
      this.get<{ intervals: Interval[] }>("/telemetry/production_micro", { start_at, granularity: "day" }),
      this.get<{ intervals: Interval[] }>("/telemetry/consumption_meter", { start_at, granularity: "day" }).catch(() => null),
    ]);
    const consBy = new Map((cons?.intervals ?? []).map((i) => [i.end_at, i.enwh != null ? i.enwh * 4 : null]));
    return prod.intervals.map((i) => ({
      t: new Date(i.end_at * 1000).toISOString(),
      productionW: i.powr ?? (i.enwh != null ? i.enwh * 4 : null),
      consumptionW: consBy.get(i.end_at) ?? null,
    }));
  }

  async getDevices(): Promise<DeviceInfo[]> {
    const r = await this.get<{ devices: Record<string, { model?: string; serial_number?: string }[]> }>("/devices");
    const kindOf = (k: string): DeviceInfo["kind"] =>
      k.includes("encharge") || k.includes("battery") ? "battery" : k.includes("meter") ? "meter" : k.includes("gateway") || k.includes("envoy") ? "gateway" : "inverter";
    return Object.entries(r.devices ?? {}).flatMap(([k, list]) =>
      list.map((d) => ({ kind: kindOf(k), model: d.model ?? k, serialNumber: d.serial_number ?? null })),
    );
  }
}

/** URL d'autorisation OAuth à présenter au particulier (consentement explicite). */
export function enphaseAuthorizeUrl(redirectUri: string) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ENPHASE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
  });
  return `https://api.enphaseenergy.com/oauth/authorize?${q}`;
}
