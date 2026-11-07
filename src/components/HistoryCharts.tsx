"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { estimateSavings, fmtAud, fmtKwh, sum } from "@/lib/format";
import type { EnergyDay, PowerPoint } from "@/types/energy";
import { ENERGY } from "./energy-colors";

const axis = { fontSize: 12, fill: "#52646d" };

export function HistoryCharts({
  daily,
  curve,
  importTariff,
  exportTariff,
}: {
  daily: EnergyDay[];
  curve: PowerPoint[];
  importTariff: number;
  exportTariff: number;
}) {
  const produced = sum(daily.map((d) => d.producedKwh));
  const self = sum(daily.map((d) => d.selfConsumedKwh));
  const consumed = sum(daily.map((d) => d.consumedKwh));
  const savings = estimateSavings(daily, importTariff, exportTariff);
  const autonomy = self != null && consumed ? Math.round((self / consumed) * 100) : null;

  const curveData = curve.map((p) => ({ h: p.t.slice(11, 16), prod: p.productionW == null ? null : p.productionW / 1000, cons: p.consumptionW == null ? null : p.consumptionW / 1000 }));
  const dailyData = daily.map((d) => ({ d: d.day.slice(8, 10) + "/" + d.day.slice(5, 7), prod: d.producedKwh, cons: d.consumedKwh }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <section>
        <h3 className="mb-3 text-base font-semibold">Aujourd&apos;hui</h3>
        <div className="h-56">
          <ResponsiveContainer>
            <AreaChart data={curveData} margin={{ left: -18, right: 8 }}>
              <CartesianGrid stroke="#d5dedc" vertical={false} />
              <XAxis dataKey="h" tick={axis} interval={11} />
              <YAxis tick={axis} unit=" kW" width={64} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)} kW`} />
              <Area type="monotone" dataKey="prod" name="Production" stroke={ENERGY.solar} fill={ENERGY.solar} fillOpacity={0.25} strokeWidth={2} />
              <Area type="monotone" dataKey="cons" name="Consommation" stroke={ENERGY.home} fill={ENERGY.home} fillOpacity={0.08} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">30 derniers jours</h3>
          <dl className="flex gap-5 text-sm">
            <div>
              <dt className="text-ink-soft">Produit</dt>
              <dd className="font-bold">{fmtKwh(produced, 0)}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Autonomie</dt>
              <dd className="font-bold">{autonomy == null ? "—" : `${autonomy} %`}</dd>
            </div>
            <div>
              <dt className="text-ink-soft" title="Estimation : autoconsommation × tarif d'achat + injection × tarif de rachat">
                Économies estimées
              </dt>
              <dd className="font-bold text-battery">{fmtAud(savings)}</dd>
            </div>
          </dl>
        </div>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={dailyData} margin={{ left: -18, right: 8 }}>
              <CartesianGrid stroke="#d5dedc" vertical={false} />
              <XAxis dataKey="d" tick={axis} interval={4} />
              <YAxis tick={axis} unit=" kWh" width={72} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(1)} kWh`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="prod" name="Production" fill={ENERGY.solar} radius={[3, 3, 0, 0]} />
              <Bar dataKey="cons" name="Consommation" fill={ENERGY.home} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
