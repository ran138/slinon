import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { assertSupabase, getSupabaseAdmin } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request, expectedSecret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${expectedSecret}`);
  const provided = Buffer.from(authorization);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  const secret = process.env.KEEPALIVE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "keepalive_not_configured" }, { status: 503 });
  }

  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await getSupabaseAdmin().from("settings").select("user_id").limit(1);
  assertSupabase(result.error, "supabase keepalive");

  return NextResponse.json(
    { ok: true, database: "reachable" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
