import type { BuildingModel, PanelLayout, PlacedPanel, RoofSegment } from "@/types/energy";

/** Repère local du bâtiment : x = est, z = sud, y = haut (mètres). */
export function toLocal(lat: number, lng: number, lat0: number, lng0: number) {
  const x = (lng - lng0) * Math.cos((lat0 * Math.PI) / 180) * 111_320;
  const z = -(lat - lat0) * 110_540;
  return { x, z };
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Vecteur horizontal "vers le bas de la pente" (direction vers laquelle le pan est orienté). */
export function downslope(azimuthDeg: number) {
  const a = rad(azimuthDeg);
  return { x: Math.sin(a), z: -Math.cos(a) };
}

/** Axe horizontal le long du faîtage. */
export function alongRidge(azimuthDeg: number) {
  const a = rad(azimuthDeg);
  return { x: Math.cos(a), z: Math.sin(a) };
}

/** Longueur réelle dans la pente. */
export function slopeLength(seg: RoofSegment) {
  return seg.depth / Math.cos(rad(seg.pitchDeg));
}

/** Rotation Y (radians) à appliquer au groupe du segment dans Three.js. */
export function segmentYaw(seg: RoofSegment) {
  return Math.PI - rad(seg.azimuthDeg);
}

/** Convertit un point monde (x,z) en coordonnées (u,v) du segment ; v positif vers le faîtage. */
export function worldToSegmentUV(seg: RoofSegment, x: number, z: number) {
  const dx = x - seg.center.x;
  const dz = z - seg.center.z;
  const r = alongRidge(seg.azimuthDeg);
  const d = downslope(seg.azimuthDeg);
  const u = dx * r.x + dz * r.z;
  const vHoriz = -(dx * d.x + dz * d.z);
  return { u, v: vHoriz / Math.cos(rad(seg.pitchDeg)) };
}

/** Grille de positions possibles pour des panneaux sur un segment (avec marges). */
export function panelSlots(seg: RoofSegment, layout: Pick<PanelLayout, "panelWidth" | "panelHeight">, margin = 0.35, gap = 0.02) {
  const L = slopeLength(seg);
  const pw = layout.panelWidth + gap; // le long du faîtage (portrait)
  const ph = layout.panelHeight + gap; // dans la pente
  const cols = Math.max(0, Math.floor((seg.width - 2 * margin) / pw));
  const rows = Math.max(0, Math.floor((L - 2 * margin) / ph));
  const slots: { u: number; v: number; key: string }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = (c - (cols - 1) / 2) * pw;
      const v = (r - (rows - 1) / 2) * ph;
      slots.push({ u, v, key: `${seg.id}:${r}:${c}` });
    }
  }
  return slots;
}

/**
 * Remplissage automatique : on privilégie les pans les mieux orientés
 * (hémisphère sud → face nord ; hémisphère nord → face sud).
 */
export function autoLayout(
  building: BuildingModel,
  targetKw: number,
  latitude: number,
  base: Omit<PanelLayout, "panels"> = { panelWidth: 1.13, panelHeight: 1.76, panelWattage: 440 },
): PanelLayout {
  const ideal = latitude < 0 ? 0 : 180;
  const score = (s: RoofSegment) => {
    const diff = Math.abs(((s.azimuthDeg - ideal + 540) % 360) - 180);
    return Math.cos(rad(diff)) * Math.cos(rad(Math.abs(s.pitchDeg - Math.abs(latitude) * 0.7)));
  };
  const target = Math.ceil((targetKw * 1000) / base.panelWattage);
  const panels: PlacedPanel[] = [];
  for (const seg of [...building.roofSegments].sort((a, b) => score(b) - score(a))) {
    if (score(seg) < 0.15) continue; // pan orienté vers le mauvais côté
    for (const s of panelSlots(seg, base)) {
      if (panels.length >= target) break;
      panels.push({ id: s.key, segmentId: seg.id, u: s.u, v: s.v, orientation: "portrait" });
    }
  }
  return { ...base, panels };
}

/** Bâtiment synthétique (mode démo ou adresse non couverte), toit à 4 pans ou 2 pans. */
export function syntheticBuilding(seed: number, source: BuildingModel["source"] = "demo"): BuildingModel {
  const width = 14 + Math.round(seed * 6);
  const depth = 9 + Math.round(((seed * 7) % 1) * 3);
  const wallHeight = 2.8;
  const pitch = 20 + Math.round(((seed * 13) % 1) * 8);
  // Toit à 2 pans (pignons rendus par le moteur 3D). Mettre `true` pour tester un toit à 4 pans.
  const hip = false;
  const h = depth / 2;
  const segments: RoofSegment[] = [
    { id: "n", pitchDeg: pitch, azimuthDeg: 0, center: { x: 0, z: -h / 2 }, width: hip ? width - depth / 2 : width, depth: h, eaveHeight: wallHeight },
    { id: "s", pitchDeg: pitch, azimuthDeg: 180, center: { x: 0, z: h / 2 }, width: hip ? width - depth / 2 : width, depth: h, eaveHeight: wallHeight },
  ];
  if (hip) {
    const hw = depth / 2;
    segments.push(
      { id: "e", pitchDeg: pitch, azimuthDeg: 90, center: { x: width / 2 - hw / 2, z: 0 }, width: depth * 0.55, depth: hw * 0.5, eaveHeight: wallHeight },
      { id: "w", pitchDeg: pitch, azimuthDeg: 270, center: { x: -(width / 2 - hw / 2), z: 0 }, width: depth * 0.55, depth: hw * 0.5, eaveHeight: wallHeight },
    );
  }
  return { source, footprint: { width, depth }, wallHeight, roofSegments: segments };
}
