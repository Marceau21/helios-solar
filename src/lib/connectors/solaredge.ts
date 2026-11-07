import type { DeviceInfo, EnergyDay, PowerPoint, PowerSnapshot } from "@/types/energy";
import { type Connector, ConnectorError, fetchJson, kw, kwh } from "./types";

/**
 * Connecteur SolarEdge — Monitoring Server API.
 * Doc : https://knowledge-center.solaredge.com/sites/kc/files/se_monitoring_api.pdf
 * Auth : clé API du site (générée par l'installateur dans le portail SolarEdge).
 * Quota : 300 requêtes / jour / site → on ne poll pas le "live" plus d'une fois toutes les 5 min.
 */
const BASE = "https://monitoringapi.solaredge.com";

interface PowerFlowNode {
  status?: string;
  currentPower?: number;
  chargeLevel?: number;
}
interface CurrentPowerFlow {
  siteCurrentPowerFlow: {
    unit: "kW" | "W";
    connections?: { from: string; to: string }[];
    GRID?: PowerFlowNode;
    LOAD?: PowerFlowNode;
    PV?: PowerFlowNode;
    STORAGE?: PowerFlowNode;
  };
}
interface MeterSeries {
  type: "Production" | "Consumption" | "SelfConsumption" | "FeedIn" | "Purchased";
  values: { date: string; value?: number }[];
}
interface EnergyDetails {
  energyDetails: { unit: string; meters: MeterSeries[] };
}
interface PowerDetails {
  powerDetails: { unit: string; meters: MeterSeries[] };
}
interface Inventory {
  Inventory: {
    inverters?: { name: string; model?: string; SN?: string }[];
    batteries?: { name: string; model?: string; SN?: string; nameplateCapacity?: number }[];
    meters?: { name: string; model?: string; SN?: string }[];
  };
}

export class SolarEdgeConnector implements Connector {
  readonly vendor = "solaredge" as const;
  readonly minPollSeconds = 300;

  constructor(
    private siteId: string,
    private apiKey: string,
  ) {
    if (!siteId || !apiKey) throw new ConnectorError("solaredge", "siteId et apiKey requis");
  }

  private url(path: string, params: Record<string, string> = {}) {
    const q = new URLSearchParams({ ...params, api_key: this.apiKey });
    return `${BASE}/site/${encodeURIComponent(this.siteId)}${path}?${q}`;
  }

  async getCurrent(): Promise<PowerSnapshot> {
    const { siteCurrentPowerFlow: f } = await fetchJson<CurrentPowerFlow>(
      this.vendor,
      this.url("/currentPowerFlow"),
    );
    const toW = (v?: number) => (v == null ? null : f.unit === "W" ? Math.round(v) : kw(v));
    const links = (f.connections ?? []).map((c) => `${c.from.toUpperCase()}>${c.to.toUpperCase()}`);
    const grid = toW(f.GRID?.currentPower);
    const storage = toW(f.STORAGE?.currentPower);
    // Le sens des flux est donné par `connections`, pas par le signe.
    const exporting = links.includes("LOAD>GRID") || links.includes("PV>GRID");
    const charging = links.some((l) => l.endsWith(">STORAGE"));
    return {
      measuredAt: new Date().toISOString(),
      source: this.vendor,
      productionW: toW(f.PV?.currentPower) ?? 0,
      consumptionW: f.LOAD ? toW(f.LOAD.currentPower) : null,
      gridImportW: f.GRID ? (exporting ? 0 : grid) : null,
      gridExportW: f.GRID ? (exporting ? grid : 0) : null,
      batteryChargeW: f.STORAGE ? (charging ? storage : 0) : null,
      batteryDischargeW: f.STORAGE ? (charging ? 0 : storage) : null,
      batterySocPct: f.STORAGE?.chargeLevel ?? null,
    };
  }

  async getDailyEnergy(from: string, to: string): Promise<EnergyDay[]> {
    const data = await fetchJson<EnergyDetails>(
      this.vendor,
      this.url("/energyDetails", {
        meters: "PRODUCTION,CONSUMPTION,SELFCONSUMPTION,FEEDIN,PURCHASED",
        timeUnit: "DAY",
        startTime: `${from} 00:00:00`,
        endTime: `${to} 23:59:59`,
      }),
    );
    const byDay = new Map<string, EnergyDay>();
    for (const m of data.energyDetails.meters) {
      for (const v of m.values) {
        const day = v.date.slice(0, 10);
        const row =
          byDay.get(day) ??
          ({ day, source: this.vendor, producedKwh: null, consumedKwh: null, importedKwh: null, exportedKwh: null, selfConsumedKwh: null } as EnergyDay);
        const val = kwh(v.value);
        if (m.type === "Production") row.producedKwh = val;
        if (m.type === "Consumption") row.consumedKwh = val;
        if (m.type === "Purchased") row.importedKwh = val;
        if (m.type === "FeedIn") row.exportedKwh = val;
        if (m.type === "SelfConsumption") row.selfConsumedKwh = val;
        byDay.set(day, row);
      }
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  async getPowerCurve(day: string): Promise<PowerPoint[]> {
    const data = await fetchJson<PowerDetails>(
      this.vendor,
      this.url("/powerDetails", {
        meters: "PRODUCTION,CONSUMPTION",
        startTime: `${day} 00:00:00`,
        endTime: `${day} 23:59:59`,
      }),
    );
    const points = new Map<string, PowerPoint>();
    for (const m of data.powerDetails.meters) {
      for (const v of m.values) {
        const p = points.get(v.date) ?? { t: v.date.replace(" ", "T"), productionW: null, consumptionW: null };
        const w = v.value == null ? null : Math.round(v.value);
        if (m.type === "Production") p.productionW = w;
        if (m.type === "Consumption") p.consumptionW = w;
        points.set(v.date, p);
      }
    }
    return [...points.values()].sort((a, b) => a.t.localeCompare(b.t));
  }

  async getDevices(): Promise<DeviceInfo[]> {
    const { Inventory: inv } = await fetchJson<Inventory>(this.vendor, this.url("/inventory"));
    return [
      ...(inv.inverters ?? []).map((d) => ({ kind: "inverter" as const, model: d.model ?? d.name, serialNumber: d.SN ?? null })),
      ...(inv.batteries ?? []).map((d) => ({
        kind: "battery" as const,
        model: d.model ?? d.name,
        serialNumber: d.SN ?? null,
        capacityKwh: d.nameplateCapacity ? d.nameplateCapacity / 1000 : null,
      })),
      ...(inv.meters ?? []).map((d) => ({ kind: "meter" as const, model: d.model ?? d.name, serialNumber: d.SN ?? null })),
    ];
  }
}
