import { NextResponse } from "next/server";
import { z } from "zod";
import { saveModel } from "@/lib/data";

const Segment = z.object({
  id: z.string(), pitchDeg: z.number().min(0).max(70), azimuthDeg: z.number().min(0).max(360),
  center: z.object({ x: z.number(), z: z.number() }), width: z.number().positive(), depth: z.number().positive(), eaveHeight: z.number().nonnegative(),
});
const Body = z.object({
  building: z.object({
    source: z.enum(["google_solar", "manual", "demo"]),
    footprint: z.object({ width: z.number().positive(), depth: z.number().positive() }),
    wallHeight: z.number().positive(),
    roofSegments: z.array(Segment).max(40),
    maxPanelCount: z.number().optional(),
    imageryQuality: z.enum(["HIGH", "MEDIUM", "LOW", "BASE"]).optional(),
  }),
  layout: z.object({
    panelWidth: z.number().positive(), panelHeight: z.number().positive(), panelWattage: z.number().positive(),
    panels: z.array(z.object({ id: z.string(), segmentId: z.string(), u: z.number(), v: z.number(), orientation: z.enum(["portrait", "landscape"]) })).max(400),
  }),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    await saveModel(id, parsed.data.building, parsed.data.layout);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
