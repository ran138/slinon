import "server-only";
import { after } from "next/server";
import { getSupabaseAdmin, assertSupabase, AUDIO_BUCKET } from "@/db";
import { generatePodcastScript } from "@/lib/podcast/generate";
import { synthesizePodcastAudio, type ChapterRecord } from "@/lib/podcast/synthesize";
import type { GeneratePodcastInput } from "@/lib/podcast/types";
import type { BriefView } from "@/lib/domain";

type ReasonKind = "portfolio" | "watchlist" | "interest" | "general";

const activeJobs = (globalThis as typeof globalThis & { __productJobs?: Map<string, Promise<void>> }).__productJobs
  ?? new Map<string, Promise<void>>();
(globalThis as typeof globalThis & { __productJobs?: Map<string, Promise<void>> }).__productJobs = activeJobs;

/** Same validation idea as the old pipeline's canonicalReason — guards against
 *  a hallucinated reasonLabel that doesn't match any real profile entity. */
function canonicalReason(
  chapter: { reasonKind: ReasonKind; reasonLabel: string },
  profile: GeneratePodcastInput["profile"],
): { reasonKind: ReasonKind; reasonLabel: string } {
  if (chapter.reasonKind === "general") return { reasonKind: "general", reasonLabel: "שוק וכלכלה" };
  const label = chapter.reasonLabel.trim().toLowerCase();
  if (chapter.reasonKind === "portfolio") {
    const match = profile.holdings.find((h) => [h.name, h.symbol].some((v) => label === v.toLowerCase() || label.includes(v.toLowerCase())));
    if (match) return { reasonKind: "portfolio", reasonLabel: match.symbol };
  }
  if (chapter.reasonKind === "watchlist") {
    const match = profile.watchlist.find((w) => [w.name, w.symbol].some((v) => label === v.toLowerCase() || label.includes(v.toLowerCase())));
    if (match) return { reasonKind: "watchlist", reasonLabel: match.symbol };
  }
  if (chapter.reasonKind === "interest") {
    const match = profile.interests.find((i) => label === i.label.toLowerCase() || label.includes(i.label.toLowerCase()));
    if (match) return { reasonKind: "interest", reasonLabel: match.label };
  }
  return { reasonKind: "general", reasonLabel: "שוק וכלכלה" };
}

async function loadProfile(userId: string): Promise<GeneratePodcastInput["profile"]> {
  const supabase = getSupabaseAdmin();
  const [settings, assets, interests] = await Promise.all([
    supabase.from("settings").select("target_minutes,podcast_plan").eq("user_id", userId).maybeSingle(),
    supabase.from("assets").select("kind,name,symbol").eq("user_id", userId),
    supabase.from("interests").select("label").eq("user_id", userId),
  ]);
  assertSupabase(settings.error, "load settings");
  assertSupabase(assets.error, "load assets");
  assertSupabase(interests.error, "load interests");

  const rows = (assets.data ?? []) as Array<{ kind: string; name: string; symbol: string }>;
  return {
    podcastPlan: settings.data?.podcast_plan === "weekly" ? "weekly" : "daily",
    holdings: rows.filter((a) => a.kind === "holding").map(({ name, symbol }) => ({ name, symbol })),
    watchlist: rows.filter((a) => a.kind === "watchlist").map(({ name, symbol }) => ({ name, symbol })),
    interests: ((interests.data ?? []) as Array<{ label: string }>).map(({ label }) => ({ label })),
    targetMinutes: (settings.data?.target_minutes as number | undefined) ?? 7,
  };
}

async function update(id: string, status: string, progress: number, stageLabel: string) {
  const { error } = await getSupabaseAdmin().from("briefs").update({ status, progress, stage_label: stageLabel }).eq("id", id);
  assertSupabase(error, "update brief progress");
}

async function resetGeneration(id: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const storage = supabase.storage.from(AUDIO_BUCKET);
  const listed = await storage.list(id, { limit: 1000 });
  assertSupabase(listed.error, "list old brief audio");
  if (listed.data?.length) {
    const removed = await storage.remove(listed.data.map(({ name }) => `${id}/${name}`));
    assertSupabase(removed.error, "remove old brief audio");
  }

  const reset = await supabase.rpc("reset_brief_generation", { p_id: id, p_user_id: userId });
  assertSupabase(reset.error, "reset brief generation");
}

export async function createBrief(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const profile = await loadProfile(userId);
  if (!profile.holdings.length || !profile.interests.length) throw new Error("profile_incomplete");

  const active = await supabase
    .from("briefs")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "researching", "scripting", "synthesizing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertSupabase(active.error, "find active brief");
  if (active.data) {
    startGeneration(active.data.id as string, userId, profile);
    return active.data.id as string;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const created = await supabase.from("briefs").insert({
    id, user_id: userId, status: "queued", progress: 4, stage_label: "הבריף נכנס לתור",
    profile_snapshot: profile, target_minutes: profile.targetMinutes, created_at: now,
  });
  assertSupabase(created.error, "create brief");

  startGeneration(id, userId, profile);
  return id;
}

function startGeneration(id: string, userId: string, profile: GeneratePodcastInput["profile"]) {
  if (activeJobs.has(id)) return;
  const job = generate(id, userId, profile);
  activeJobs.set(id, job);
  void job.finally(() => { if (activeJobs.get(id) === job) activeJobs.delete(id); });
  // Vercel may freeze the serverless function once its HTTP response is
  // sent — generation is fire-and-forget by design (the client polls
  // GET /api/briefs/[id] for progress), so without this, unfinished
  // background work can be killed mid-generation. after() keeps the
  // function alive until the job actually settles.
  try {
    after(async () => { await job.catch(() => { /* generate() already records failure on the brief row */ }); });
  } catch { /* not in a request-scoped context (e.g. some test harnesses) — job still runs, just without the keep-alive guarantee */ }
}

async function generate(id: string, userId: string, profile: GeneratePodcastInput["profile"]) {
  const supabase = getSupabaseAdmin();
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) throw new Error("missing_api_key");

    await resetGeneration(id, userId);

    await update(id, "researching", 20, "אוספים נתונים מאומתים");
    // Deliberately no refreshPortfolioKnowledge() call here: ingestion (real
    // web searches + embeddings) is expensive and belongs in a separate,
    // deliberate step (scripts/import-portfolio-knowledge.mjs, or a future
    // scheduled/manual refresh), not on every single generation. This only
    // reads the already-indexed knowledge_documents table.
    const windowDays = profile.podcastPlan === "weekly" ? 7 : 1;
    const windowStart = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();
    const windowEnd = new Date().toISOString();
    const input: GeneratePodcastInput = { profile, windowStart, windowEnd };

    await update(id, "scripting", 45, "כותבים את הסקריפט האישי שלך");
    const { script, itemsUsed } = await generatePodcastScript(input);

    const chapterInsert = await supabase
      .from("chapters")
      .insert(
        script.chapters.map((chapter, position) => {
          const canonical = canonicalReason(chapter, profile);
          return {
            id: crypto.randomUUID(), brief_id: id, position, title: chapter.title, script: chapter.script,
            reason_kind: canonical.reasonKind, reason_label: canonical.reasonLabel, start_ms: 0,
          };
        }),
      )
      .select("id,position,script")
      .order("position");
    assertSupabase(chapterInsert.error, "save chapters");
    const titled = await supabase.from("briefs").update({ title: script.title }).eq("id", id);
    assertSupabase(titled.error, "save brief title");

    const chapterRecords: ChapterRecord[] = (chapterInsert.data ?? []).map((row, index) => ({
      id: row.id as string, position: row.position as number, script: row.script as string,
      sourceItemIds: script.chapters[index]?.sourceItemIds ?? [],
    }));
    const itemsById = new Map(itemsUsed.map((item) => [item.id, item]));

    await update(id, "synthesizing", 66, "מסנתזים קול בעברית");
    const { totalDurationMs } = await synthesizePodcastAudio(id, chapterRecords, itemsById);

    const completed = await supabase.from("briefs").update({
      status: "completed", progress: 100, stage_label: "הבריף מוכן",
      duration_ms: totalDurationMs, completed_at: new Date().toISOString(),
    }).eq("id", id);
    assertSupabase(completed.error, "complete brief");
  } catch (error) {
    const code = error instanceof Error ? error.message : "generation_failed";
    const message = code === "missing_api_key"
      ? "חסר מפתח OpenAI. הוסיפו OPENAI_API_KEY לקובץ .env.local והפעילו מחדש."
      : "יצירת הבריף נכשלה. אפשר לנסות שוב בעוד רגע.";
    await supabase.from("briefs").update({
      status: "failed", stage_label: "לא הצלחנו להכין את הבריף",
      error_code: code.slice(0, 80), error_message: message, completed_at: new Date().toISOString(),
    }).eq("id", id);
  }
}

export async function getBrief(id: string, userId: string): Promise<BriefView | null> {
  const supabase = getSupabaseAdmin();
  const brief = await supabase.from("briefs").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  assertSupabase(brief.error, "load brief");
  if (!brief.data) return null;

  if (["queued", "researching", "scripting", "synthesizing"].includes(brief.data.status as string) && !activeJobs.has(id)) {
    loadProfile(userId).then((profile) => startGeneration(id, userId, profile)).catch(() => { /* stays queued; next poll retries */ });
  }

  const [chapters, sources] = await Promise.all([
    supabase.from("chapters").select("*").eq("brief_id", id).order("position"),
    supabase.from("sources").select("*").eq("brief_id", id).order("title"),
  ]);
  assertSupabase(chapters.error, "load chapters");
  assertSupabase(sources.error, "load sources");

  const chapterRows = (chapters.data ?? []) as Array<Record<string, unknown>>;
  const sourceRows = (sources.data ?? []) as Array<Record<string, unknown>>;
  const b = brief.data as Record<string, unknown>;

  return {
    id,
    audioUrl: b.status === "completed" ? `/api/briefs/${id}/audio/full` : null,
    status: b.status as BriefView["status"],
    progress: Number(b.progress),
    stageLabel: String(b.stage_label),
    title: (b.title as string | null) ?? null,
    targetMinutes: Number(b.target_minutes),
    durationMs: (b.duration_ms as number | null) ?? null,
    errorMessage: (b.error_message as string | null) ?? null,
    createdAt: String(b.created_at),
    completedAt: (b.completed_at as string | null) ?? null,
    chapters: chapterRows.map((r) => ({
      id: String(r.id), position: Number(r.position), title: String(r.title), script: String(r.script),
      reasonKind: String(r.reason_kind), reasonLabel: String(r.reason_label),
      durationMs: (r.duration_ms as number | null) ?? null, startMs: Number(r.start_ms),
      audioUrl: r.audio_file ? `/api/briefs/${id}/audio/${r.id}` : null,
    })),
    sources: sourceRows.map((r) => ({
      id: String(r.id), chapterId: (r.chapter_id as string | null) ?? null,
      title: String(r.title), publisher: (r.publisher as string | null) ?? null, url: String(r.url),
    })),
  };
}

export { AUDIO_BUCKET };
