/** Fabricants supportés. "demo" = données de démonstration, jamais présentées comme réelles. */
export type Vendor = "solaredge" | "enphase" | "sungrow" | "sma" | "demo";

export type Freshness = "live" | "recent" | "stale" | "offline";

/**
 * Instantané de puissance normalisé — format commun à tous les connecteurs.
 * Toutes les puissances sont en Watts. `null` = grandeur non mesurée par le matériel
 * (ex. pas de pince de consommation) : on ne l'invente jamais.
 */
export interface PowerSnapshot {
  measuredAt: string; // ISO 8601
  source: Vendor;
  productionW: number | null;
  consumptionW: number | null;
  gridImportW: number | null;
  gridExportW: number | null;
  batteryChargeW: number | null;
  batteryDischargeW: number | null;
  batterySocPct: number | null;
}

/** Énergie agrégée sur une journée, en kWh. */
export interface EnergyDay {
  day: string; // YYYY-MM-DD
  source: Vendor;
  producedKwh: number | null;
  consumedKwh: number | null;
  importedKwh: number | null;
  exportedKwh: number | null;
  selfConsumedKwh: number | null;
}

/** Point d'une courbe intra-journalière (puissance en W). */
export interface PowerPoint {
  t: string;
  productionW: number | null;
  consumptionW: number | null;
}

export interface DeviceInfo {
  kind: "inverter" | "battery" | "meter" | "gateway";
  model: string | null;
  serialNumber: string | null;
  capacityKwh?: number | null;
  ratedPowerKw?: number | null;
}

/* ------------------------------------------------------------------ */
/* Modèle 3D                                                          */
/* ------------------------------------------------------------------ */

/** Segment de toit dans un repère local en mètres (x = est, z = sud, y = haut). */
export interface RoofSegment {
  id: string;
  /** Inclinaison en degrés (0 = plat). */
  pitchDeg: number;
  /** Azimut en degrés (0 = nord, 90 = est, 180 = sud, 270 = ouest). */
  azimuthDeg: number;
  /** Centre du segment (m) dans le repère du bâtiment. */
  center: { x: number; z: number };
  /** Dimensions projetées au sol (m) : largeur le long du faîtage, profondeur dans la pente. */
  width: number;
  depth: number;
  /** Hauteur de la bordure basse (égout) au-dessus du sol (m). */
  eaveHeight: number;
}

export interface BuildingModel {
  source: "google_solar" | "manual" | "demo";
  /** Emprise rectangulaire au sol (m). */
  footprint: { width: number; depth: number };
  wallHeight: number;
  roofSegments: RoofSegment[];
  /** Potentiel max calculé par Google (optionnel). */
  maxPanelCount?: number;
  imageryQuality?: "HIGH" | "MEDIUM" | "LOW" | "BASE";
}

/** Panneau positionné sur un segment, en coordonnées locales du segment (m). */
export interface PlacedPanel {
  id: string;
  segmentId: string;
  /** Position le long de la largeur du segment (0 = centre). */
  u: number;
  /** Position dans la pente (0 = centre, + vers le faîtage). */
  v: number;
  orientation: "portrait" | "landscape";
}

export interface PanelLayout {
  panelWidth: number; // m
  panelHeight: number; // m
  panelWattage: number; // Wc
  panels: PlacedPanel[];
}

/* ------------------------------------------------------------------ */
/* Domaine applicatif                                                 */
/* ------------------------------------------------------------------ */

export interface Installation {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  timezone: string;
  systemSizeKw: number;
  tariffImportPerKwh: number;
  tariffExportPerKwh: number;
  commissionedOn: string | null;
  vendor: Vendor;
  building: BuildingModel;
  layout: PanelLayout;
  devices: DeviceInfo[];
  isDemo: boolean;
}

export function freshnessOf(measuredAt: string, now = Date.now()): Freshness {
  const ageMin = (now - new Date(measuredAt).getTime()) / 60_000;
  if (ageMin < 2) return "live";
  if (ageMin < 20) return "recent";
  if (ageMin < 24 * 60) return "stale";
  return "offline";
}
