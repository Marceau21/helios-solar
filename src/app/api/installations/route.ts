import { NextResponse } from "next/server";
import { z } from "zod";
import { createInstallation } from "@/lib/data";

const Body = z.object({
  customerName: z.string().min(2),
  customerEmail: z.string().email().optional().or(z.literal("")),
  address: z.string().min(5),
  latitude: z.number(),
  longitude: z.number(),
  systemSizeKw: z.number().positive().max(100),
  batteryKwh: z.number().positive().max(200).nullable(),
  building: z.any(),
  layout: z.any(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const id = await createInstallation({ ...parsed.data, customerEmail: parsed.data.customerEmail || undefined });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
