import { NextResponse } from "next/server";
import { connectorFor } from "@/lib/connectors";
import { listInstallations } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Vue portefeuille : dernier instantané de chaque installation de l'installateur. */
export async function GET() {
  const list = await listInstallations();
  const rows = await Promise.all(
    list.map(async (inst) => {
      try {
        const snapshot = await (await connectorFor(inst)).getCurrent();
        return { id: inst.id, snapshot, error: null };
      } catch (e) {
        return { id: inst.id, snapshot: null, error: (e as Error).message };
      }
    }),
  );
  return NextResponse.json({ rows });
}
