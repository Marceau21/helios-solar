import "server-only";
import type { Installation } from "@/types/energy";
import { decryptJson, encryptJson } from "../crypto";
import { supabaseAdmin } from "../supabase/server";
import { DemoConnector } from "./demo";
import { EnphaseConnector, type EnphaseTokens } from "./enphase";
import { SolarEdgeConnector } from "./solaredge";
import { type Connector, ConnectorError } from "./types";

export type { Connector } from "./types";

/**
 * Fabrique de connecteurs : choisit l'implémentation selon le fabricant
 * et déchiffre les identifiants côté serveur uniquement.
 * Ajouter Sungrow / SMA = créer une classe qui implémente `Connector` + un `case` ici.
 */
export async function connectorFor(inst: Installation): Promise<Connector> {
  if (inst.isDemo || inst.vendor === "demo") {
    const battery = inst.devices.find((d) => d.kind === "battery")?.capacityKwh ?? null;
    return new DemoConnector(inst.id, inst.systemSizeKw, battery, inst.timezone);
  }

  const { data: conn, error } = await supabaseAdmin()
    .from("vendor_connections")
    .select("id, vendor, external_site_id, credentials_encrypted, customer_consent_at")
    .eq("installation_id", inst.id)
    .single();
  if (error || !conn) throw new ConnectorError(inst.vendor, "Aucune connexion fabricant configurée");
  if (!conn.customer_consent_at) throw new ConnectorError(inst.vendor, "Consentement du client manquant");
  if (!conn.credentials_encrypted) throw new ConnectorError(inst.vendor, "Identifiants manquants");

  switch (conn.vendor) {
    case "solaredge": {
      const { apiKey } = decryptJson<{ apiKey: string }>(conn.credentials_encrypted);
      return new SolarEdgeConnector(conn.external_site_id, apiKey);
    }
    case "enphase": {
      const tokens = decryptJson<EnphaseTokens>(conn.credentials_encrypted);
      return new EnphaseConnector(conn.external_site_id, process.env.ENPHASE_API_KEY ?? "", tokens, async (t) => {
        await supabaseAdmin()
          .from("vendor_connections")
          .update({ credentials_encrypted: encryptJson(t), token_expires_at: new Date(t.expiresAt).toISOString() })
          .eq("id", conn.id);
      });
    }
    default:
      throw new ConnectorError(conn.vendor, "Connecteur pas encore disponible (prévu : Sungrow, SMA)");
  }
}
