import "server-only";
import type { BuildingModel, DeviceInfo, Installation, PanelLayout, Vendor } from "@/types/energy";
import { DEMO_MODE } from "./config";
import { demoStore } from "./demo-data";
import { supabaseServer } from "./supabase/server";

/**
 * Couche d'accès aux données.
 * Mode démo → stockage en mémoire. Sinon → Supabase avec RLS (l'utilisateur ne voit que ce qui lui appartient).
 */

interface InstallationRow {
  id: string;
  customer_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  timezone: string;
  system_size_kw: number;
  tariff_import_per_kwh: number;
  tariff_export_per_kwh: number;
  commissioned_on: string | null;
  building_model: BuildingModel;
  panel_layout: PanelLayout;
  is_demo: boolean;
  customers: { full_name: string } | null;
  vendor_connections: { vendor: Vendor }[];
  devices: { kind: DeviceInfo["kind"]; model: string | null; serial_number: string | null; capacity_kwh: number | null; rated_power_kw: number | null }[];
}

const SELECT = "*, customers(full_name), vendor_connections(vendor), devices(kind, model, serial_number, capacity_kwh, rated_power_kw)";

function fromRow(r: InstallationRow): Installation {
  return {
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customers?.full_name ?? "—",
    name: r.name,
    address: r.address,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    systemSizeKw: Number(r.system_size_kw),
    tariffImportPerKwh: Number(r.tariff_import_per_kwh),
    tariffExportPerKwh: Number(r.tariff_export_per_kwh),
    commissionedOn: r.commissioned_on,
    vendor: r.is_demo ? "demo" : (r.vendor_connections[0]?.vendor ?? "demo"),
    building: r.building_model,
    layout: r.panel_layout,
    devices: r.devices.map((d) => ({ kind: d.kind, model: d.model, serialNumber: d.serial_number, capacityKwh: d.capacity_kwh, ratedPowerKw: d.rated_power_kw })),
    isDemo: r.is_demo,
  };
}

export async function listInstallations(): Promise<Installation[]> {
  if (DEMO_MODE) return [...demoStore().values()];
  const sb = await supabaseServer();
  const { data, error } = await sb.from("installations").select(SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as InstallationRow[]).map(fromRow);
}

export async function getInstallation(id: string): Promise<Installation | null> {
  if (DEMO_MODE) return demoStore().get(id) ?? null;
  const sb = await supabaseServer();
  const { data, error } = await sb.from("installations").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as InstallationRow) : null;
}

export interface NewInstallationInput {
  customerName: string;
  customerEmail?: string;
  address: string;
  latitude: number;
  longitude: number;
  systemSizeKw: number;
  batteryKwh: number | null;
  building: BuildingModel;
  layout: PanelLayout;
}

export async function createInstallation(input: NewInstallationInput): Promise<string> {
  if (DEMO_MODE) {
    const id = `demo-${Date.now().toString(36)}`;
    demoStore().set(id, {
      id,
      customerId: `c-${id}`,
      customerName: `${input.customerName} (démo)`,
      name: "Installation principale",
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      timezone: "Australia/Sydney",
      systemSizeKw: input.systemSizeKw,
      tariffImportPerKwh: 0.32,
      tariffExportPerKwh: 0.05,
      commissionedOn: new Date().toISOString().slice(0, 10),
      vendor: "demo",
      building: input.building,
      layout: input.layout,
      devices: [
        { kind: "inverter", model: "Onduleur démo", serialNumber: null, ratedPowerKw: input.systemSizeKw },
        ...(input.batteryKwh ? [{ kind: "battery" as const, model: "Batterie démo", serialNumber: null, capacityKwh: input.batteryKwh }] : []),
      ],
      isDemo: true,
    });
    return id;
  }

  const sb = await supabaseServer();
  const { data: profile } = await sb.from("profiles").select("company_id").single();
  if (!profile?.company_id) throw new Error("Profil installateur sans entreprise");
  const { data: customer, error: e1 } = await sb
    .from("customers")
    .insert({ company_id: profile.company_id, full_name: input.customerName, email: input.customerEmail ?? null })
    .select("id")
    .single();
  if (e1) throw e1;
  const { data: inst, error: e2 } = await sb
    .from("installations")
    .insert({
      customer_id: customer.id,
      company_id: profile.company_id,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      system_size_kw: input.systemSizeKw,
      building_model: input.building,
      panel_layout: input.layout,
      model_source: input.building.source,
    })
    .select("id")
    .single();
  if (e2) throw e2;
  if (input.batteryKwh) {
    await sb.from("devices").insert({ installation_id: inst.id, kind: "battery", vendor: "solaredge", capacity_kwh: input.batteryKwh });
  }
  return inst.id;
}

export async function saveModel(id: string, building: BuildingModel, layout: PanelLayout) {
  if (DEMO_MODE) {
    const inst = demoStore().get(id);
    if (!inst) throw new Error("Installation introuvable");
    demoStore().set(id, { ...inst, building, layout });
    return;
  }
  const sb = await supabaseServer();
  const { error } = await sb.from("installations").update({ building_model: building, panel_layout: layout, model_source: building.source === "demo" ? "demo" : "manual" }).eq("id", id);
  if (error) throw error;
}
