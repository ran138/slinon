import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { CollectedItem, GeneratePodcastInput, PodcastScript, TopicKind } from "./types";
import { podcastScriptSchema } from "./types";
import { fetchCollectedItems } from "./dataSource";
import { buildScriptPrompt, buildCorrectivePrompt } from "./prompt";
import {
  verifyScript, checkReferentialIntegrity, checkProhibitedPhrases, checkLatinScriptLeakage,
  type VerifyResult,
} from "./verify";
import { resolveTextModel, PROHIBITED_ADVICE_PATTERN, LATIN_LETTERS_PATTERN } from "./constants";

export interface GeneratePodcastResult {
  script: PodcastScript;
  itemsUsed: CollectedItem[];
}

type Chapter = PodcastScript["chapters"][number];
type IndexedIssue = { chapterIndex: number; sentence: string; reason: string };

function topicsFromProfile(profile: GeneratePodcastInput["profile"]): Array<{ kind: TopicKind; label: string }> {
  return [
    ...profile.holdings.map((h) => ({ kind: "holding" as const, label: h.symbol })),
    ...profile.watchlist.map((w) => ({ kind: "watchlist" as const, label: w.symbol })),
    ...profile.interests.map((i) => ({ kind: "interest" as const, label: i.label })),
  ];
}

async function generateOnce(client: OpenAI, prompt: string): Promise<PodcastScript> {
  const model = resolveTextModel();
  const response = await client.responses.parse({
    model,
    store: false,
    max_output_tokens: 7000,
    input: prompt,
    text: { format: zodTextFormat(podcastScriptSchema, "podcast_script") },
  });
  const script = response.output_parsed;
  if (!script) throw new Error("script_generation_failed");
  if (response.usage) {
    console.info(`[podcast:generate] model=${model} total_tokens=${response.usage.total_tokens}`);
  }
  return script;
}

/** Structural issues are free-text ("Chapter 2 cites unknown item id...") but
 *  always carry a real chapter number by construction (see verify.ts) — pull
 *  it back out so the corrective prompt, and the sentence-level repair
 *  below, both know exactly which chapter each issue belongs to. */
function extractChapterIndex(structuralIssue: string): number {
  const match = /^Chapter (\d+)/.exec(structuralIssue);
  return match ? Number(match[1]) : -1;
}

function toIndexedIssues(result: VerifyResult): IndexedIssue[] {
  return [
    ...result.structuralIssues.map((reason) => ({ chapterIndex: extractChapterIndex(reason), sentence: "", reason })),
    ...result.factCheckIssues,
  ];
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Finds which split sentence a fact-check issue's quoted `sentence` refers
 *  to — exact/substring match first, then best-effort word-overlap, so a
 *  near-quote (not byte-identical to the script) still resolves. Returns -1
 *  when nothing matches closely enough to safely act on. */
function findMatchingSentenceIndex(sentences: string[], quoted: string): number {
  const target = normalize(quoted);
  if (!target) return -1;
  const direct = sentences.findIndex((s) => {
    const n = normalize(s);
    return n === target || n.includes(target) || target.includes(n);
  });
  if (direct !== -1) return direct;

  const targetWords = new Set(target.split(" "));
  let bestIndex = -1;
  let bestScore = 0;
  sentences.forEach((s, i) => {
    const words = normalize(s).split(" ");
    const overlap = words.filter((w) => targetWords.has(w)).length;
    const score = overlap / Math.max(1, words.length, targetWords.size);
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  });
  return bestScore >= 0.5 ? bestIndex : -1;
}

function fallbackLineFor(chapter: Chapter): string {
  return `אין לנו כרגע עדכון מאומת לגבי ${chapter.reasonLabel}. נבדוק שוב ונעדכן אתכם בהמשך.`;
}

/**
 * Surgically repairs one chapter using only issues already identified for
 * it — never regenerates, never drops the chapter/topic. Prohibited-advice
 * and Latin-script issues are resolved by removing exactly the offending
 * sentence(s); a bad cited item id is removed from sourceItemIds; a
 * fact-check issue is resolved by locating and removing its quoted
 * sentence. If nothing usable survives, or an issue can't be pinned to a
 * specific sentence, the chapter's topic/title/reason stay but its content
 * becomes one safe, honest placeholder line — the topic is never dropped.
 */
function repairChapter(chapter: Chapter, issues: IndexedIssue[], knownItemIds: Set<string>): Chapter {
  const sourceItemIds = chapter.sourceItemIds.filter((id) => knownItemIds.has(id));
  const sentences = splitSentences(chapter.script);
  const toRemove = new Set<number>();
  let unresolvable = false;

  for (const issue of issues) {
    if (issue.reason.includes("prohibited advice pattern")) {
      sentences.forEach((s, i) => { if (PROHIBITED_ADVICE_PATTERN.test(s)) toRemove.add(i); });
    } else if (issue.reason.includes("Latin-script")) {
      sentences.forEach((s, i) => { if (LATIN_LETTERS_PATTERN.test(s)) toRemove.add(i); });
    } else if (issue.reason.includes("cites unknown item id")) {
      // Already handled by the knownItemIds filter above — nothing to do to the text itself.
    } else if (issue.sentence) {
      const index = findMatchingSentenceIndex(sentences, issue.sentence);
      if (index >= 0) toRemove.add(index);
      else unresolvable = true;
    } else {
      unresolvable = true;
    }
  }

  const repairedScript = sentences.filter((_, i) => !toRemove.has(i)).join(" ").trim();
  if (unresolvable || !repairedScript) {
    return { ...chapter, script: fallbackLineFor(chapter), sourceItemIds: [] };
  }
  return { ...chapter, script: repairedScript, sourceItemIds };
}

/**
 * Replaces the old web-search-research + script-writing pair of OpenAI calls:
 * this reads already-collected data for the given topics/window instead of
 * researching live, writes one script, and verifies it before returning.
 *
 * One corrective retry on verification failure (whole script, unchanged
 * behavior). If that still doesn't fully pass, this no longer drops
 * chapters or throws: it repairs each flagged chapter in place — removing
 * only the specific bad sentence(s)/citation(s) using the verifier's own
 * findings — and keeps every topic. No extra API calls; the repair is pure
 * local text editing over content already paid for.
 */
export async function generatePodcastScript(input: GeneratePodcastInput): Promise<GeneratePodcastResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("missing_api_key");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 2 });

  const items = await fetchCollectedItems(topicsFromProfile(input.profile), input.windowStart, input.windowEnd);

  const prompt = buildScriptPrompt(input, items);
  let script = await generateOnce(client, prompt);
  let result = await verifyScript(client, script, items);

  if (!result.ok) {
    const correctivePrompt = buildCorrectivePrompt(prompt, { issues: toIndexedIssues(result) });
    script = await generateOnce(client, correctivePrompt);
    result = await verifyScript(client, script, items);
  }

  if (!result.ok) {
    const issues = toIndexedIssues(result);
    const knownItemIds = new Set(items.map((item) => item.id));
    const byChapter = new Map<number, IndexedIssue[]>();
    for (const issue of issues) {
      if (issue.chapterIndex < 0 || issue.chapterIndex >= script.chapters.length) continue;
      const list = byChapter.get(issue.chapterIndex) ?? [];
      list.push(issue);
      byChapter.set(issue.chapterIndex, list);
    }
    console.warn(`[podcast:verify] repairing ${byChapter.size} chapter(s) after retry still failed: ${issues.map((i) => i.reason).join(" | ")}`);
    script = {
      ...script,
      chapters: script.chapters.map((chapter, index) => {
        const chapterIssues = byChapter.get(index);
        return chapterIssues?.length ? repairChapter(chapter, chapterIssues, knownItemIds) : chapter;
      }),
    };

    // Free re-check: confirm the repair actually cleared the structural
    // issues. Not re-running the paid fact-check here is deliberate — we
    // already removed exactly the sentence it flagged.
    const recheck = [
      ...checkReferentialIntegrity(script, items),
      ...checkProhibitedPhrases(script),
      ...checkLatinScriptLeakage(script),
    ];
    if (recheck.length) {
      console.warn(`[podcast:verify] structural issues remained after repair, using placeholder for those chapters: ${recheck.join(" | ")}`);
      const stillBad = new Set(recheck.map(extractChapterIndex).filter((i) => i >= 0));
      script = {
        ...script,
        chapters: script.chapters.map((chapter, index) =>
          stillBad.has(index) ? { ...chapter, script: fallbackLineFor(chapter), sourceItemIds: [] } : chapter),
      };
    }
  }

  return { script, itemsUsed: items };
}
