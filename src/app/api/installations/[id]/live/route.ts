import { NextResponse } from "next/server";
import { connectorFor } from "@/lib/connectors";
import { getInstallation } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Instantané de puissance normalisé. Les identifiants fabricants restent côté serveur. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inst = await getInstallation(id); // RLS : renvoie null si l'utilisateur n'y a pas accès
  if (!inst) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  try {
    const c = await connectorFor(inst);
    const snapshot = await c.getCurrent();
    return NextResponse.json({ snapshot, pollSeconds: c.minPollSeconds });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
