import "server-only";
import { getSupabaseAdmin, assertSupabase } from "./supabaseAdmin";
import { fetchCollectedItems } from "./dataSource";
import { generatePodcastScript } from "./generate";
import { synthesizePodcastAudio } from "./synthesize";
import { computeCacheKey, getCachedBriefId, setCachedBriefId } from "./cache";
import type { GeneratePodcastInput, PodcastScript, TopicKind } from "./types";

function topicsFromProfile(profile: GeneratePodcastInput["profile"]): Array<{ kind: TopicKind; label: string }> {
  return [
    ...profile.holdings.map((h) => ({ kind: "holding" as const, label: h.symbol })),
    ...profile.watchlist.map((w) => ({ kind: "watchlist" as const, label: w.symbol })),
    ...profile.interests.map((i) => ({ kind: "interest" as const, label: i.label })),
  ];
}

type ReasonKind = "portfolio" | "watchlist" | "interest" | "general";

/** Same validation idea as lib/briefs.ts's canonicalReason — duplicated locally
 *  since that file isn't edited by this module (see plan's "known duplication
 *  cost" note). Guards against a hallucinated reasonLabel that doesn't match
 *  any real profile entity. */
function canonicalReason(
  chapter: { reasonKind: ReasonKind; reasonLabel: string },
  profile: GeneratePodcastInput["profile"],
): { reasonKind: ReasonKind; reasonLabel: string } {
  if (chapter.reasonKind === "general") return { reasonKind: "general", reasonLabel: "שוק וכלכלה" };
  const label = chapter.reasonLabel.trim().toLowerCase();
  if (chapter.reasonKind === "portfolio") {
    const match = profile.holdings.find((h) =>
      [h.name, h.symbol].some((v) => label === v.toLowerCase() || label.includes(v.toLowerCase())),
    );
    if (match) return { reasonKind: "portfolio", reasonLabel: match.symbol };
  }
  if (chapter.reasonKind === "watchlist") {
    const match = profile.watchlist.find((w) =>
      [w.name, w.symbol].some((v) => label === v.toLowerCase() || label.includes(v.toLowerCase())),
    );
    if (match) return { reasonKind: "watchlist", reasonLabel: match.symbol };
  }
  if (chapter.reasonKind === "interest") {
    const match = profile.interests.find(
      (i) => label === i.label.toLowerCase() || label.includes(i.label.toLowerCase()),
    );
    if (match) return { reasonKind: "interest", reasonLabel: match.label };
  }
  return { reasonKind: "general", reasonLabel: "שוק וכלכלה" };
}

export interface CreatePodcastBriefResult {
  briefId: string;
  cached: boolean;
}

/**
 * Standalone pipeline — not wired into lib/briefs.ts or any API route yet
 * (deliberately; this is the not-yet-finished next backend version).
 * Produces a real, playable brief using the existing
 * `briefs`/`chapters`/`sources` Supabase tables, so the existing
 * getBrief()/player can read its output once this is wired in.
 *
 * Three steps, each its own module: fetch+generate+verify the script
 * (generate.ts), synthesize the audio and save it (synthesize.ts) — this
 * file just ties them together and owns the cache short-circuit + the
 * `briefs`/`chapters` row bookkeeping around them.
 */
export async function createPodcastBrief(input: GeneratePodcastInput): Promise<CreatePodcastBriefResult> {
  const supabase = getSupabaseAdmin();
  const items = await fetchCollectedItems(topicsFromProfile(input.profile), input.windowStart, input.windowEnd);

  const cacheKey = computeCacheKey({
    profile: input.profile,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    itemIds: items.map((item) => item.id),
  });

  const cachedBriefId = await getCachedBriefId(cacheKey);
  if (cachedBriefId) {
    const existing = await supabase
      .from("briefs")
      .select("id")
      .eq("id", cachedBriefId)
      .eq("status", "completed")
      .maybeSingle();
    assertSupabase(existing.error, "check cached brief");
    if (existing.data) return { briefId: cachedBriefId, cached: true };
  }

  const { script, itemsUsed } = await generatePodcastScript(input);
  const briefId = await persistBriefAndSynthesize(script, itemsUsed, input, cacheKey);

  return { briefId, cached: false };
}

async function persistBriefAndSynthesize(
  script: PodcastScript,
  itemsUsed: Awaited<ReturnType<typeof fetchCollectedItems>>,
  input: GeneratePodcastInput,
  cacheKey: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const itemsById = new Map(itemsUsed.map((item) => [item.id, item]));

  const briefId = crypto.randomUUID();
  const now = new Date().toISOString();

  const created = await supabase.from("briefs").insert({
    id: briefId,
    status: "synthesizing",
    progress: 60,
    stage_label: "מקליטים את פרקי הבריף",
    title: script.title,
    profile_snapshot: input,
    target_minutes: input.profile.targetMinutes,
    created_at: now,
    started_at: now,
  });
  assertSupabase(created.error, "create brief");

  const chapterInsert = await supabase
    .from("chapters")
    .insert(
      script.chapters.map((chapter, position) => {
        const canonical = canonicalReason(chapter, input.profile);
        return {
          id: crypto.randomUUID(),
          brief_id: briefId,
          position,
          title: chapter.title,
          script: chapter.script,
          reason_kind: canonical.reasonKind,
          reason_label: canonical.reasonLabel,
          start_ms: 0,
        };
      }),
    )
    .select("id,position,script")
    .order("position");
  assertSupabase(chapterInsert.error, "save chapters");

  const chapterRecords = (chapterInsert.data ?? []).map((row, index) => ({
    id: row.id as string,
    position: row.position as number,
    script: row.script as string,
    sourceItemIds: script.chapters[index]?.sourceItemIds ?? [],
  }));

  const { totalDurationMs } = await synthesizePodcastAudio(briefId, chapterRecords, itemsById);

  const completed = await supabase
    .from("briefs")
    .update({
      status: "completed",
      progress: 100,
      stage_label: "הבריף מוכן",
      duration_ms: totalDurationMs,
      completed_at: new Date().toISOString(),
    })
    .eq("id", briefId);
  assertSupabase(completed.error, "complete brief");

  await setCachedBriefId(cacheKey, briefId);
  return briefId;
}
