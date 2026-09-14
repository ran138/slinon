import { NextResponse } from "next/server";
import { getSupabaseAdmin, assertSupabase } from "@/db";
import { createBrief, getBrief } from "@/lib/briefs";

export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("briefs")
    .select("id")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(100);
  assertSupabase(error, "list briefs");
  const briefs = await Promise.all((data ?? []).map(({ id }) => getBrief(id as string)));
  return NextResponse.json(briefs.filter(Boolean));
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  try {
    const id = await createBrief();
    return NextResponse.json({ id }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "profile_incomplete" }, { status: 400 });
  }
}
