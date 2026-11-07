import { NextResponse } from "next/server";
import { connectorFor } from "@/lib/connectors";
import { getInstallation } from "@/lib/data";

export const dynamic = "force-dynamic";

const dayStr = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? 30)));
  const inst = await getInstallation(id);
  if (!inst) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  try {
    const c = await connectorFor(inst);
    const now = new Date();
    const today = dayStr(now, inst.timezone);
    const from = dayStr(new Date(now.getTime() - (days - 1) * 86_400_000), inst.timezone);
    const [daily, curve] = await Promise.all([c.getDailyEnergy(from, today), c.getPowerCurve(today)]);
    return NextResponse.json({ daily, curve });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
