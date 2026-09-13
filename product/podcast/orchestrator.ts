import "server-only";
import { rawDb } from "@/db";
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
 * (deliberately, per plan). Produces a real, playable brief using the
 * existing `briefs`/`chapters`/`sources` tables, so the existing
 * getBrief()/player can read its output once this is wired in.
 *
 * Three steps, each its own module: fetch+generate+verify the script
 * (generate.ts), synthesize the audio and save it (synthesize.ts) — this
 * file just ties them together and owns the cache short-circuit + the
 * `briefs`/`chapters` row bookkeeping around them.
 */
export async function createPodcastBrief(input: GeneratePodcastInput): Promise<CreatePodcastBriefResult> {
  const items = await fetchCollectedItems(topicsFromProfile(input.profile), input.windowStart, input.windowEnd);

  const cacheKey = computeCacheKey({
    profile: input.profile,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    itemIds: items.map((item) => item.id),
  });

  const cachedBriefId = getCachedBriefId(cacheKey);
  if (cachedBriefId) {
    const existing = rawDb
      .prepare("SELECT id FROM briefs WHERE id = ? AND status = 'completed'")
      .get(cachedBriefId);
    if (existing) return { briefId: cachedBriefId, cached: true };
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
  const itemsById = new Map(itemsUsed.map((item) => [item.id, item]));

  const briefId = crypto.randomUUID();
  const now = new Date().toISOString();

  rawDb
    .prepare(
      "INSERT INTO briefs (id,status,progress,stage_label,title,profile_snapshot,target_minutes,created_at,started_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      briefId,
      "synthesizing",
      60,
      "מקליטים את פרקי הבריף",
      script.title,
      JSON.stringify(input),
      input.profile.targetMinutes,
      now,
      now,
    );

  const insertChapter = rawDb.prepare(
    "INSERT INTO chapters (id,brief_id,position,title,script,reason_kind,reason_label,start_ms) VALUES (?,?,?,?,?,?,?,?)",
  );
  const chapterRecords = script.chapters.map((chapter, position) => {
    const canonical = canonicalReason(chapter, input.profile);
    const id = crypto.randomUUID();
    insertChapter.run(id, briefId, position, chapter.title, chapter.script, canonical.reasonKind, canonical.reasonLabel, 0);
    return { id, position, script: chapter.script, sourceItemIds: chapter.sourceItemIds };
  });

  const { totalDurationMs } = await synthesizePodcastAudio(briefId, chapterRecords, itemsById);

  rawDb
    .prepare("UPDATE briefs SET status='completed', progress=100, stage_label=?, duration_ms=?, completed_at=? WHERE id=?")
    .run("הבריף מוכן", totalDurationMs, new Date().toISOString(), briefId);

  setCachedBriefId(cacheKey, briefId);
  return briefId;
}
