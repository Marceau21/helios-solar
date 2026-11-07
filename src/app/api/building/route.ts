import { NextResponse } from "next/server";
import { z } from "zod";
import { buildingForAddress } from "@/lib/solar/google";

/** Adresse → coordonnées → segments de toit (Google Solar) → modèle 3D + implantation suggérée. */
export async function POST(req: Request) {
  const body = z.object({ address: z.string().min(5), targetKw: z.number().positive().max(100).default(6.6) }).safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Adresse invalide" }, { status: 400 });
  try {
    return NextResponse.json(await buildingForAddress(body.data.address, body.data.targetKw));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
