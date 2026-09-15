import { NextResponse } from "next/server";
import { assertSupabase, getSupabaseAdmin } from "@/db";
import { profileUpdateSchema } from "@/lib/domain";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const [settings, assets, interests] = await Promise.all([
    supabase.from("settings").select("target_minutes,onboarding_complete").eq("id", 1).maybeSingle(),
    supabase.from("assets").select("id,kind,name,symbol,asset_class,exchange,quantity,average_cost,currency,created_at,updated_at").order("created_at"),
    supabase.from("interests").select("id,label,custom,created_at").order("created_at"),
  ]);
  assertSupabase(settings.error, "load settings");
  assertSupabase(assets.error, "load assets");
  assertSupabase(interests.error, "load interests");

  return NextResponse.json({
    targetMinutes: settings.data?.target_minutes ?? 7,
    onboardingComplete: settings.data?.onboarding_complete ?? false,
    assets: (assets.data ?? []).map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      symbol: item.symbol,
      assetClass: item.asset_class,
      exchange: item.exchange,
      quantity: item.quantity,
      averageCost: item.average_cost,
      currency: item.currency,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
    interests: interests.data ?? [],
  });
}

export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  }
  const parsed = profileUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_profile" }, { status: 400 });

  const value = parsed.data;
  const { error } = await getSupabaseAdmin().rpc("replace_profile", {
    p_assets: value.assets.map((item) => ({
      id: item.id ?? crypto.randomUUID(), kind: item.kind, name: item.name, symbol: item.symbol,
      asset_class: item.assetClass ?? null, exchange: item.exchange ?? null,
      quantity: item.quantity ?? null, average_cost: item.averageCost ?? null, currency: item.currency ?? null,
    })),
    p_interests: value.interests.map((item) => ({
      id: crypto.randomUUID(), label: item.label, custom: item.custom ?? false,
    })),
    p_target_minutes: value.targetMinutes,
    p_onboarding_complete: value.onboardingComplete,
  });
  assertSupabase(error, "replace profile");
  return GET();
}
