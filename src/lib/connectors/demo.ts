import type { DeviceInfo, EnergyDay, PowerPoint, PowerSnapshot } from "@/types/energy";
import type { Connector } from "./types";

/**
 * Connecteur de DÉMONSTRATION.
 * Génère des données plausibles et déterministes. Toutes les sorties portent
 * `source: "demo"` et l'interface affiche un badge DÉMO : elles ne sont jamais
 * présentées comme des mesures réelles.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function localHour(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

function localDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date); // YYYY-MM-DD
}

export class DemoConnector implements Connector {
  readonly vendor = "demo" as const;
  readonly minPollSeconds = 5;

  constructor(
    private seed: string,
    private systemSizeKw: number,
    private batteryKwh: number | null,
    private tz = "Australia/Sydney",
  ) {}

  /** Couverture nuageuse du jour (0 = grand soleil, 0.6 = très couvert). */
  private cloud(day: string) {
    return hash(`${this.seed}:${day}`) * 0.55;
  }

  private productionAt(hour: number, day: string, jitterKey: string) {
    const sunrise = 5.8;
    const sunset = 19.6;
    if (hour <= sunrise || hour >= sunset) return 0;
    const x = (hour - sunrise) / (sunset - sunrise);
    const bell = Math.pow(Math.sin(Math.PI * x), 1.6);
    const passing = 1 - 0.25 * hash(`${jitterKey}`) * this.cloud(day) * 2;
    return Math.max(0, this.systemSizeKw * 1000 * 0.82 * bell * (1 - this.cloud(day)) * passing);
  }

  private consumptionAt(hour: number, jitterKey: string) {
    const base = 380;
    const morning = 1400 * Math.exp(-Math.pow((hour - 7.5) / 1.1, 2));
    const evening = 2600 * Math.exp(-Math.pow((hour - 18.8) / 1.8, 2));
    const midday = 500 * Math.exp(-Math.pow((hour - 13) / 2.5, 2));
    const noise = 0.85 + 0.3 * hash(jitterKey);
    return (base + morning + evening + midday) * noise;
  }

  /** Simulation simple de l'état de charge sur la journée jusqu'à `hour`. */
  private socAt(hour: number, day: string) {
    if (!this.batteryKwh) return null;
    let soc = 35;
    for (let h = 0; h < hour; h += 0.25) {
      const net = this.productionAt(h, day, `${day}:${h}`) - this.consumptionAt(h, `${this.seed}c${day}:${h}`);
      soc += ((net * 0.25) / (this.batteryKwh * 1000)) * 100 * 0.92;
      soc = Math.min(100, Math.max(8, soc));
    }
    return Math.round(soc * 10) / 10;
  }

  async getCurrent(): Promise<PowerSnapshot> {
    const now = new Date();
    const day = localDay(now, this.tz);
    const hour = localHour(now, this.tz);
    const tick = Math.floor(now.getTime() / 5000);
    const prod = this.productionAt(hour, day, `${this.seed}p${tick}`);
    const cons = this.consumptionAt(hour, `${this.seed}c${tick}`);
    const soc = this.socAt(hour, day);
    let surplus = prod - cons;
    let charge = 0;
    let discharge = 0;
    if (soc != null) {
      const maxBatt = 5000;
      if (surplus > 0 && soc < 99.5) charge = Math.min(surplus, maxBatt);
      if (surplus < 0 && soc > 9) discharge = Math.min(-surplus, maxBatt);
      surplus = surplus - charge + discharge;
    }
    return {
      measuredAt: now.toISOString(),
      source: "demo",
      productionW: Math.round(prod),
      consumptionW: Math.round(cons),
      gridImportW: Math.round(Math.max(0, -surplus)),
      gridExportW: Math.round(Math.max(0, surplus)),
      batteryChargeW: soc == null ? null : Math.round(charge),
      batteryDischargeW: soc == null ? null : Math.round(discharge),
      batterySocPct: soc,
    };
  }

  async getPowerCurve(day: string): Promise<PowerPoint[]> {
    const today = localDay(new Date(), this.tz);
    const limit = day === today ? localHour(new Date(), this.tz) : 24;
    const pts: PowerPoint[] = [];
    for (let h = 0; h <= limit; h += 0.25) {
      const hh = String(Math.floor(h)).padStart(2, "0");
      const mm = String(Math.round((h % 1) * 60)).padStart(2, "0");
      pts.push({
        t: `${day}T${hh}:${mm}:00`,
        productionW: Math.round(this.productionAt(h, day, `${day}:${h}`)),
        consumptionW: Math.round(this.consumptionAt(h, `${this.seed}c${day}:${h}`)),
      });
    }
    return pts;
  }

  async getDailyEnergy(from: string, to: string): Promise<EnergyDay[]> {
    const out: EnergyDay[] = [];
    const d = new Date(`${from}T12:00:00Z`);
    const end = new Date(`${to}T12:00:00Z`);
    while (d <= end) {
      const day = d.toISOString().slice(0, 10);
      let prod = 0;
      let cons = 0;
      let self = 0;
      for (let h = 0; h < 24; h += 0.25) {
        const p = this.productionAt(h, day, `${day}:${h}`) * 0.25;
        const c = this.consumptionAt(h, `${this.seed}c${day}:${h}`) * 0.25;
        prod += p;
        cons += c;
        self += Math.min(p, c);
      }
      // La batterie décale une partie du surplus vers le soir
      const shifted = this.batteryKwh ? Math.min(prod - self, cons - self, this.batteryKwh * 1000 * 0.9) : 0;
      self += Math.max(0, shifted);
      const r = (wh: number) => Math.round(wh) / 1000;
      out.push({
        day,
        source: "demo",
        producedKwh: r(prod),
        consumedKwh: r(cons),
        selfConsumedKwh: r(self),
        exportedKwh: r(Math.max(0, prod - self)),
        importedKwh: r(Math.max(0, cons - self)),
      });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  async getDevices(): Promise<DeviceInfo[]> {
    const devices: DeviceInfo[] = [
      { kind: "inverter", model: "Onduleur démo", serialNumber: "DEMO-INV-001", ratedPowerKw: this.systemSizeKw },
      { kind: "meter", model: "Compteur démo", serialNumber: "DEMO-MTR-001" },
    ];
    if (this.batteryKwh) devices.push({ kind: "battery", model: "Batterie démo", serialNumber: "DEMO-BAT-001", capacityKwh: this.batteryKwh });
    return devices;
  }
}
