import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin, assertSupabase } from "@/db";
import { assetInputSchema } from "@/lib/domain";

export const runtime = "nodejs";

const draftSchema = z.object({
  text: z.string().max(2000),
  assets: z.array(assetInputSchema.extend({ kind: z.literal("holding") })).max(20),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).host === request.headers.get("host");
}

export async function GET() {
  const { data, error } = await getSupabaseAdmin().from("onboarding_draft").select("portfolio_text,assets_json").eq("id", 1).maybeSingle();
  assertSupabase(error, "load onboarding draft");
  if (!data) return NextResponse.json({ text: "", assets: [] });
  return NextResponse.json({ text: data.portfolio_text, assets: data.assets_json ?? [] });
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  const parsed = draftSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_draft" }, { status: 400 });

  const { error } = await getSupabaseAdmin().from("onboarding_draft").upsert({
    id: 1, portfolio_text: parsed.data.text, assets_json: parsed.data.assets, updated_at: new Date().toISOString(),
  });
  assertSupabase(error, "save onboarding draft");
  return NextResponse.json(parsed.data);
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  const { error } = await getSupabaseAdmin().from("onboarding_draft").delete().eq("id", 1);
  assertSupabase(error, "clear onboarding draft");
  return new NextResponse(null, { status: 204 });
}
