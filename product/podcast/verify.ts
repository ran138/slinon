import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { CollectedItem, PodcastScript, VerificationVerdict } from "./types";
import { verificationVerdictSchema } from "./types";
import { PROHIBITED_ADVICE_PATTERN, resolveVerifyModel } from "./constants";
import { buildVerificationPrompt } from "./prompt";

/** Free check: every cited item id must actually exist in the fetched data. */
export function checkReferentialIntegrity(script: PodcastScript, items: CollectedItem[]): string[] {
  const knownIds = new Set(items.map((item) => item.id));
  const problems: string[] = [];
  script.chapters.forEach((chapter, index) => {
    for (const id of chapter.sourceItemIds) {
      if (!knownIds.has(id)) problems.push(`Chapter ${index} cites unknown item id "${id}"`);
    }
  });
  return problems;
}

/** Free check: fast first pass for the clearest advice-language violations. */
export function checkProhibitedPhrases(script: PodcastScript): string[] {
  const problems: string[] = [];
  script.chapters.forEach((chapter, index) => {
    if (PROHIBITED_ADVICE_PATTERN.test(chapter.script)) {
      problems.push(`Chapter ${index} matches the prohibited advice pattern`);
    }
  });
  return problems;
}

/** Latin letters in the spoken text (unconverted ticker/acronym/English word) —
 *  the prompt asks for Hebrew phonetic spelling instead, since a TTS engine
 *  will otherwise mispronounce or skip Latin-script text. Free, catches
 *  slips without spending an API call. */
const LATIN_LETTERS_PATTERN = /[A-Za-z]/;
export function checkLatinScriptLeakage(script: PodcastScript): string[] {
  const problems: string[] = [];
  script.chapters.forEach((chapter, index) => {
    if (LATIN_LETTERS_PATTERN.test(chapter.script)) {
      problems.push(`Chapter ${index} contains Latin-script text in the spoken script (should be Hebrew phonetic spelling)`);
    }
  });
  return problems;
}

/** Paid check: a second, separately-configurable model fact-checks the script against the source data. */
export async function runFactCheck(
  client: OpenAI,
  script: PodcastScript,
  items: CollectedItem[],
): Promise<VerificationVerdict> {
  const model = resolveVerifyModel();
  const response = await client.responses.parse({
    model,
    store: false,
    input: buildVerificationPrompt(script, items),
    text: { format: zodTextFormat(verificationVerdictSchema, "verification_verdict") },
  });
  const verdict = response.output_parsed;
  if (!verdict) throw new Error("verification_call_failed");
  if (response.usage) {
    // Cost visibility: real token counts per verification call, so actual
    // cost can be computed once you know the price for `model`.
    console.info(`[podcast:verify] model=${model} total_tokens=${response.usage.total_tokens}`);
  }
  return verdict;
}

export interface VerifyResult {
  ok: boolean;
  structuralIssues: string[];
  factCheckIssues: VerificationVerdict["issues"];
}

export async function verifyScript(
  client: OpenAI,
  script: PodcastScript,
  items: CollectedItem[],
): Promise<VerifyResult> {
  const structuralIssues = [
    ...checkReferentialIntegrity(script, items),
    ...checkProhibitedPhrases(script),
    ...checkLatinScriptLeakage(script),
  ];
  if (structuralIssues.length > 0) {
    // Fail fast on free checks — don't spend an API call on content that's
    // already known to be bad.
    return { ok: false, structuralIssues, factCheckIssues: [] };
  }
  const verdict = await runFactCheck(client, script, items);
  return { ok: verdict.ok, structuralIssues: [], factCheckIssues: verdict.issues };
}
