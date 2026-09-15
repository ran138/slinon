import { NextResponse } from "next/server";
import { assertSupabase, getSupabaseAdmin } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { profileUpdateSchema } from "@/lib/domain";
import { computeNextRunAt, targetMinutesForPlan } from "@/lib/schedule";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const [settings, assets, interests] = await Promise.all([
    supabase.from("settings").select("target_minutes,onboarding_complete,podcast_plan,schedule_time,schedule_day,schedule_timezone,next_run_at,last_scheduled_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("assets").select("id,kind,name,symbol,asset_class,exchange,quantity,average_cost,currency,created_at,updated_at").eq("user_id", user.id).order("created_at"),
    supabase.from("interests").select("id,label,custom,created_at").eq("user_id", user.id).order("created_at"),
  ]);
  assertSupabase(settings.error, "load settings");
  assertSupabase(assets.error, "load assets");
  assertSupabase(interests.error, "load interests");

  return NextResponse.json({
    email: user.email ?? null,
    targetMinutes: settings.data?.target_minutes ?? 7,
    podcastPlan: settings.data?.podcast_plan ?? "daily",
    scheduleTime: String(settings.data?.schedule_time ?? "07:00").slice(0, 5),
    scheduleDay: settings.data?.schedule_day ?? null,
    scheduleTimezone: settings.data?.schedule_timezone ?? "Asia/Jerusalem",
    nextRunAt: settings.data?.next_run_at ?? null,
    lastScheduledAt: settings.data?.last_scheduled_at ?? null,
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
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = profileUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_profile" }, { status: 400 });

  const value = parsed.data;
  const supabase = getSupabaseAdmin();
  const current = await supabase.from("settings")
    .select("podcast_plan,schedule_time,schedule_day,schedule_timezone,next_run_at")
    .eq("user_id", user.id).maybeSingle();
  assertSupabase(current.error, "load current podcast schedule");

  const normalizedDay = value.podcastPlan === "weekly" ? value.scheduleDay : null;
  const scheduleChanged = !current.data
    || current.data.podcast_plan !== value.podcastPlan
    || String(current.data.schedule_time).slice(0, 5) !== value.scheduleTime
    || current.data.schedule_day !== normalizedDay
    || current.data.schedule_timezone !== value.scheduleTimezone;
  const nextRunAt = scheduleChanged || !current.data?.next_run_at
    ? computeNextRunAt({
      podcastPlan: value.podcastPlan,
      scheduleTime: value.scheduleTime,
      scheduleDay: normalizedDay,
      scheduleTimezone: value.scheduleTimezone,
    })
    : current.data.next_run_at;
  const targetMinutes = targetMinutesForPlan(value.podcastPlan);

  const { error } = await supabase.rpc("replace_profile", {
    p_user_id: user.id,
    p_assets: value.assets.map((item) => ({
      id: item.id ?? crypto.randomUUID(), kind: item.kind, name: item.name, symbol: item.symbol,
      asset_class: item.assetClass ?? null, exchange: item.exchange ?? null,
      quantity: item.quantity ?? null, average_cost: item.averageCost ?? null, currency: item.currency ?? null,
    })),
    p_interests: value.interests.map((item) => ({
      id: crypto.randomUUID(), label: item.label, custom: item.custom ?? false,
    })),
    p_target_minutes: targetMinutes,
    p_onboarding_complete: value.onboardingComplete,
  });
  assertSupabase(error, "replace profile");

  const schedule = await supabase.from("settings").update({
    podcast_plan: value.podcastPlan,
    schedule_time: value.scheduleTime,
    schedule_day: normalizedDay,
    schedule_timezone: value.scheduleTimezone,
    next_run_at: nextRunAt,
    target_minutes: targetMinutes,
  }).eq("user_id", user.id);
  assertSupabase(schedule.error, "save podcast schedule");
  return GET();
}
