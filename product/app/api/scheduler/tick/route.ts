import { NextResponse } from "next/server";
import { assertSupabase, getSupabaseAdmin } from "@/db";
import { createBrief } from "@/lib/briefs";
import { computeNextRunAt, type PodcastPlan } from "@/lib/schedule";

export const runtime = "nodejs";
const GENERATION_LEAD_MS = 20 * 60 * 1000;

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    return NextResponse.json({ error: "scheduler_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const settings = await supabase.from("settings").select(
    "onboarding_complete,podcast_plan,schedule_time,schedule_day,schedule_timezone,next_run_at",
  ).eq("id", 1).maybeSingle();
  assertSupabase(settings.error, "load podcast schedule");

  const row = settings.data;
  if (!row?.onboarding_complete || !row.next_run_at) {
    return NextResponse.json({ status: "not_scheduled" });
  }

  const now = new Date();
  const dueAt = new Date(row.next_run_at);
  const generationStartsAt = new Date(dueAt.getTime() - GENERATION_LEAD_MS);
  if (generationStartsAt.getTime() > now.getTime()) {
    return NextResponse.json({ status: "not_due", nextRunAt: row.next_run_at });
  }

  const plan = row.podcast_plan as PodcastPlan;
  const nextRunAt = computeNextRunAt({
    podcastPlan: plan,
    scheduleTime: String(row.schedule_time).slice(0, 5),
    scheduleDay: row.schedule_day,
    scheduleTimezone: "Asia/Jerusalem",
  }, new Date(dueAt.getTime() + 60_000));

  const claimed = await supabase.from("settings").update({
    next_run_at: nextRunAt,
    last_scheduled_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq("id", 1).eq("next_run_at", row.next_run_at).select("id").maybeSingle();
  assertSupabase(claimed.error, "claim podcast schedule");
  if (!claimed.data) {
    return NextResponse.json({ status: "already_claimed" });
  }

  try {
    const briefId = await createBrief();
    return NextResponse.json({ status: "started", briefId, nextRunAt }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation_failed";
    return NextResponse.json({ error: message, nextRunAt }, { status: 500 });
  }
}
