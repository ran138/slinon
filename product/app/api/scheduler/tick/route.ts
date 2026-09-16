import { NextResponse } from "next/server";
import { assertSupabase, getSupabaseAdmin } from "@/db";
import { createBrief, sendDueNotifications } from "@/lib/briefs";
import { computeNextRunAt, type PodcastPlan } from "@/lib/schedule";

export const runtime = "nodejs";
export const maxDuration = 300;
// Generation starts this far before the user's chosen delivery time — early
// is better than late, and generation is fast (observed: ~1.5-4.5 min), so
// this is mostly slack. The ready email is deliberately NOT sent as soon as
// generation finishes; it's held until NOTIFY_LEAD_MS before the target
// instead (see sendDueNotifications), so a fast generation doesn't result in
// an email arriving oddly early.
const GENERATION_LEAD_MS = 20 * 60 * 1000;
const NOTIFY_LEAD_MS = 10 * 60 * 1000;

type DueRow = {
  user_id: string;
  onboarding_complete: boolean;
  podcast_plan: string;
  schedule_time: string;
  schedule_day: number | null;
  next_run_at: string | null;
};

// Vercel Cron invokes via GET (with an Authorization: Bearer $CRON_SECRET
// header it adds automatically when a CRON_SECRET env var exists) — POST is
// kept too, for manual/external triggering (e.g. curl during testing).
export async function GET(request: Request) {
  return tick(request);
}

export async function POST(request: Request) {
  return tick(request);
}

async function tick(request: Request) {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    return NextResponse.json({ error: "scheduler_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date();

  const rows = await supabase.from("settings").select(
    "user_id,onboarding_complete,podcast_plan,schedule_time,schedule_day,schedule_timezone,next_run_at",
  ).eq("onboarding_complete", true).not("next_run_at", "is", null);
  assertSupabase(rows.error, "load podcast schedules");

  const results: Array<{ userId: string; status: string; briefId?: string; error?: string }> = [];

  for (const row of (rows.data ?? []) as DueRow[]) {
    if (!row.next_run_at) continue;
    const dueAt = new Date(row.next_run_at);
    const generationStartsAt = new Date(dueAt.getTime() - GENERATION_LEAD_MS);
    if (generationStartsAt.getTime() > now.getTime()) {
      results.push({ userId: row.user_id, status: "not_due" });
      continue;
    }

    const plan = row.podcast_plan as PodcastPlan;
    const nextRunAt = computeNextRunAt({
      podcastPlan: plan,
      scheduleTime: String(row.schedule_time).slice(0, 5),
      scheduleDay: row.schedule_day,
      scheduleTimezone: "Asia/Jerusalem",
    }, new Date(dueAt.getTime() + 60_000));

    // Optimistic-concurrency claim, per user — the .eq("next_run_at", ...)
    // guard prevents this specific user from being double-triggered if the
    // tick endpoint is ever invoked twice near-simultaneously.
    const claimed = await supabase.from("settings").update({
      next_run_at: nextRunAt,
      last_scheduled_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("user_id", row.user_id).eq("next_run_at", row.next_run_at).select("user_id").maybeSingle();
    assertSupabase(claimed.error, "claim podcast schedule");
    if (!claimed.data) {
      results.push({ userId: row.user_id, status: "already_claimed" });
      continue;
    }

    try {
      const notifyAt = new Date(dueAt.getTime() - NOTIFY_LEAD_MS).toISOString();
      const briefId = await createBrief(row.user_id, notifyAt);
      results.push({ userId: row.user_id, status: "started", briefId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "generation_failed";
      results.push({ userId: row.user_id, status: "error", error: message });
    }
  }

  const notified = await sendDueNotifications();

  return NextResponse.json({ processed: results.length, results, notified });
}
