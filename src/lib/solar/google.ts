import "server-only";
import type { BuildingModel, PanelLayout, RoofSegment } from "@/types/energy";
import { autoLayout, syntheticBuilding, toLocal, worldToSegmentUV } from "./geometry";

/**
 * Google Solar API (buildingInsights:findClosest) + Geocoding API.
 * Doc : https://developers.google.com/maps/documentation/solar/building-insights
 * Google fournit des segments de toit (inclinaison, azimut, boîte englobante),
 * pas une maquette 3D complète : on reconstruit le modèle, l'installateur corrige ensuite.
 */

interface LatLng {
  latitude: number;
  longitude: number;
}
interface BuildingInsights {
  center: LatLng;
  imageryQuality: "HIGH" | "MEDIUM" | "LOW" | "BASE";
  boundingBox: { sw: LatLng; ne: LatLng };
  solarPotential: {
    maxArrayPanelsCount: number;
    panelHeightMeters: number;
    panelWidthMeters: number;
    panelCapacityWatts: number;
    roofSegmentStats: {
      pitchDegrees: number;
      azimuthDegrees: number;
      center: LatLng;
      boundingBox: { sw: LatLng; ne: LatLng };
      planeHeightAtCenterMeters: number;
    }[];
    solarPanels?: { center: LatLng; orientation: "LANDSCAPE" | "PORTRAIT"; segmentIndex: number }[];
  };
}

export interface ResolvedAddress {
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

export interface BuildingResult {
  address: ResolvedAddress;
  building: BuildingModel;
  suggestedLayout: PanelLayout;
  warnings: string[];
}

const key = () => process.env.GOOGLE_MAPS_API_KEY;

export async function geocode(address: string): Promise<ResolvedAddress> {
  const k = key();
  if (!k) {
    // Sans clé : position fictive autour de Sydney, signalée comme démo par l'appelant.
    let h = 0;
    for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { formattedAddress: address, latitude: -33.82 + ((h % 1000) / 1000) * 0.1, longitude: 151.05 + (((h >> 10) % 1000) / 1000) * 0.15 };
  }
  const q = new URLSearchParams({ address, key: k, region: "au" });
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${q}`, { cache: "no-store" });
  const j = (await r.json()) as { status: string; results: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[] };
  if (j.status !== "OK" || !j.results[0]) throw new Error(`Adresse introuvable (${j.status})`);
  const g = j.results[0];
  return { formattedAddress: g.formatted_address, latitude: g.geometry.location.lat, longitude: g.geometry.location.lng };
}

function fromInsights(bi: BuildingInsights): { building: BuildingModel; layout: PanelLayout } {
  const { latitude: lat0, longitude: lng0 } = bi.center;
  const sp = bi.solarPotential;
  const minH = Math.min(...sp.roofSegmentStats.map((s) => s.planeHeightAtCenterMeters));
  const wallHeight = 2.8;

  const segments: RoofSegment[] = sp.roofSegmentStats.map((s, i) => {
    const c = toLocal(s.center.latitude, s.center.longitude, lat0, lng0);
    const sw = toLocal(s.boundingBox.sw.latitude, s.boundingBox.sw.longitude, lat0, lng0);
    const ne = toLocal(s.boundingBox.ne.latitude, s.boundingBox.ne.longitude, lat0, lng0);
    const ex = Math.abs(ne.x - sw.x);
    const ez = Math.abs(ne.z - sw.z);
    const az = s.azimuthDegrees;
    const facesNS = Math.abs(Math.cos((az * Math.PI) / 180)) >= Math.abs(Math.sin((az * Math.PI) / 180));
    const width = facesNS ? ex : ez;
    const depth = facesNS ? ez : ex;
    const pitch = s.pitchDegrees;
    const rise = (depth / 2) * Math.tan((pitch * Math.PI) / 180);
    const eave = Math.max(wallHeight * 0.8, wallHeight + (s.planeHeightAtCenterMeters - minH) - rise);
    return { id: `g${i}`, pitchDeg: pitch, azimuthDeg: az, center: c, width, depth, eaveHeight: eave };
  });

  const bsw = toLocal(bi.boundingBox.sw.latitude, bi.boundingBox.sw.longitude, lat0, lng0);
  const bne = toLocal(bi.boundingBox.ne.latitude, bi.boundingBox.ne.longitude, lat0, lng0);
  const building: BuildingModel = {
    source: "google_solar",
    footprint: { width: Math.abs(bne.x - bsw.x) * 0.9, depth: Math.abs(bne.z - bsw.z) * 0.9 },
    wallHeight,
    roofSegments: segments,
    maxPanelCount: sp.maxArrayPanelsCount,
    imageryQuality: bi.imageryQuality,
  };

  const layout: PanelLayout = {
    panelWidth: sp.panelWidthMeters,
    panelHeight: sp.panelHeightMeters,
    panelWattage: sp.panelCapacityWatts,
    panels: (sp.solarPanels ?? []).slice(0, 20).map((p, i) => {
      const seg = segments[p.segmentIndex];
      const c = toLocal(p.center.latitude, p.center.longitude, lat0, lng0);
      const { u, v } = worldToSegmentUV(seg, c.x, c.z);
      return { id: `gp${i}`, segmentId: seg.id, u, v, orientation: p.orientation === "LANDSCAPE" ? "landscape" : "portrait" };
    }),
  };
  return { building, layout };
}

export async function buildingForAddress(address: string, targetKw = 6.6): Promise<BuildingResult> {
  const warnings: string[] = [];
  const resolved = await geocode(address);
  const k = key();

  if (k) {
    const q = new URLSearchParams({
      "location.latitude": String(resolved.latitude),
      "location.longitude": String(resolved.longitude),
      requiredQuality: "MEDIUM",
      key: k,
    });
    const r = await fetch(`https://solar.googleapis.com/v1/buildingInsights:findClosest?${q}`, { cache: "no-store" });
    if (r.ok) {
      const { building, layout } = fromInsights((await r.json()) as BuildingInsights);
      if (building.imageryQuality !== "HIGH") warnings.push(`Qualité d'imagerie ${building.imageryQuality} : vérifier le modèle.`);
      return { address: resolved, building, suggestedLayout: layout.panels.length ? layout : autoLayout(building, targetKw, resolved.latitude), warnings };
    }
    warnings.push(`Google Solar API n'a pas de données pour cette adresse (HTTP ${r.status}). Modèle générique créé : à corriger manuellement.`);
  } else {
    warnings.push("Mode démo : aucune clé Google configurée, maison générique générée.");
  }

  const seed = ((resolved.latitude * 1e4) % 1 + 1) % 1;
  const building = syntheticBuilding(seed, k ? "manual" : "demo");
  return { address: resolved, building, suggestedLayout: autoLayout(building, targetKw, resolved.latitude), warnings };
}
