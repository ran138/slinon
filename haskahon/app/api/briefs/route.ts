import { NextResponse } from "next/server";
import { rawDb } from "@/db";
import { createBrief, getBrief } from "@/lib/briefs";
export const runtime = "nodejs";

export async function GET() {
  const ids = rawDb.prepare("SELECT id FROM briefs WHERE status='completed' ORDER BY completed_at DESC LIMIT 100").all() as Array<{ id: string }>;
  return NextResponse.json(ids.map(({ id }) => getBrief(id)));
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  try { const id = await createBrief(); return NextResponse.json({ id }, { status: 202 }); }
  catch { return NextResponse.json({ error: "profile_incomplete" }, { status: 400 }); }
}
