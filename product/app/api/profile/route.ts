import { NextResponse } from "next/server";
import { getSupabaseAdmin, assertSupabase } from "@/db";
import { profileUpdateSchema } from "@/lib/domain";

export const runtime = "nodejs";

async function loadProfile() {
  const supabase = getSupabaseAdmin();
  const [settings, assets, interests] = await Promise.all([
    supabase.from("settings").select("target_minutes,onboarding_complete").eq("id", 1).maybeSingle(),
    supabase.from("assets").select("*"),
    supabase.from("interests").select("*"),
  ]);
  assertSupabase(settings.error, "load settings");
  assertSupabase(assets.error, "load assets");
  assertSupabase(interests.error, "load interests");

  return {
    targetMinutes: (settings.data?.target_minutes as 5 | 7 | 10 | undefined) ?? 7,
    onboardingComplete: settings.data?.onboarding_complete ?? false,
    assets: (assets.data ?? []).map((a) => ({
      id: a.id, kind: a.kind, name: a.name, symbol: a.symbol, assetClass: a.asset_class,
      exchange: a.exchange, quantity: a.quantity, averageCost: a.average_cost, currency: a.currency,
    })),
    interests: (interests.data ?? []).map((i) => ({ label: i.label, custom: i.custom })),
  };
}

export async function GET() {
  return NextResponse.json(await loadProfile());
}

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const parsed = profileUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_profile" }, { status: 400 });
  const value = parsed.data;

  const supabase = getSupabaseAdmin();
  const rpc = await supabase.rpc("replace_profile", {
    p_assets: value.assets.map((a) => ({ ...a, id: a.id ?? crypto.randomUUID() })),
    p_interests: value.interests.map((i) => ({ ...i, id: crypto.randomUUID() })),
    p_target_minutes: value.targetMinutes,
    p_onboarding_complete: value.onboardingComplete,
  });
  assertSupabase(rpc.error, "replace profile");

  return NextResponse.json(await loadProfile());
}
