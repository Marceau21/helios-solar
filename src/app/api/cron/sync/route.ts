import { NextResponse } from "next/server";
import { connectorFor } from "@/lib/connectors";
import { DEMO_MODE } from "@/lib/config";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { BuildingModel, Installation, PanelLayout } from "@/types/energy";

export const dynamic = "force-dynamic";

/**
 * Tâche planifiée (Vercel Cron toutes les 5 min, cf. vercel.json) :
 * récupère l'instantané de chaque installation réelle et l'historise.
 * Respecte les quotas fabricants via `minPollSeconds`.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (DEMO_MODE) return NextResponse.json({ skipped: "mode démo" });

  const sb = supabaseAdmin();
  const { data: conns } = await sb
    .from("vendor_connections")
    .select("id, vendor, last_sync_at, installations(id, timezone, system_size_kw, building_model, panel_layout)")
    .not("customer_consent_at", "is", null);

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const row of conns ?? []) {
    const i = row.installations as unknown as { id: string; timezone: string; system_size_kw: number; building_model: BuildingModel; panel_layout: PanelLayout };
    const inst = { id: i.id, timezone: i.timezone, systemSizeKw: Number(i.system_size_kw), vendor: row.vendor, isDemo: false, devices: [], building: i.building_model, layout: i.panel_layout } as unknown as Installation;
    try {
      const c = await connectorFor(inst);
      const age = row.last_sync_at ? (Date.now() - new Date(row.last_sync_at).getTime()) / 1000 : Infinity;
      if (age < c.minPollSeconds) continue;
      const s = await c.getCurrent();
      await sb.from("power_snapshots").upsert({
        installation_id: inst.id, measured_at: s.measuredAt, source: s.source,
        production_w: s.productionW, consumption_w: s.consumptionW, grid_import_w: s.gridImportW, grid_export_w: s.gridExportW,
        battery_charge_w: s.batteryChargeW, battery_discharge_w: s.batteryDischargeW, battery_soc_pct: s.batterySocPct,
      });
      await sb.from("vendor_connections").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", row.id);
      results.push({ id: inst.id, ok: true });
    } catch (e) {
      await sb.from("vendor_connections").update({ last_error: (e as Error).message }).eq("id", row.id);
      results.push({ id: inst.id, ok: false, error: (e as Error).message });
    }
  }
  return NextResponse.json({ synced: results.length, results });
}
