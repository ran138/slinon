import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { CollectedItem, GeneratePodcastInput, PodcastScript, TopicKind } from "./types";
import { podcastScriptSchema } from "./types";
import { fetchCollectedItems } from "./dataSource";
import { buildScriptPrompt, buildCorrectivePrompt } from "./prompt";
import { verifyScript } from "./verify";
import { resolveTextModel } from "./constants";

export interface GeneratePodcastResult {
  script: PodcastScript;
  itemsUsed: CollectedItem[];
}

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

/**
 * Replaces the old web-search-research + script-writing pair of OpenAI calls:
 * this reads already-collected data for the given topics/window instead of
 * researching live, writes one script, and verifies it before returning.
 * One corrective retry on verification failure, then throws.
 */
export async function generatePodcastScript(input: GeneratePodcastInput): Promise<GeneratePodcastResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("missing_api_key");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 2 });

  const items = await fetchCollectedItems(topicsFromProfile(input.profile), input.windowStart, input.windowEnd);

  const prompt = buildScriptPrompt(input, items);
  let script = await generateOnce(client, prompt);
  let result = await verifyScript(client, script, items);

  if (!result.ok) {
    const issues = [
      ...result.structuralIssues.map((reason) => ({ chapterIndex: -1, sentence: "", reason })),
      ...result.factCheckIssues,
    ];
    const correctivePrompt = buildCorrectivePrompt(prompt, { issues });
    script = await generateOnce(client, correctivePrompt);
    result = await verifyScript(client, script, items);
    if (!result.ok) throw new Error("content_verification_failed");
  }

  return { script, itemsUsed: items };
}
