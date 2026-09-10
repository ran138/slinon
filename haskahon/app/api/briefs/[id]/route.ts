import { NextResponse } from "next/server";
import { getBrief } from "@/lib/briefs";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const brief = getBrief(id);
  return brief ? NextResponse.json(brief) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
