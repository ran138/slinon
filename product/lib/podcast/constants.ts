// Same speech-rate figure used elsewhere in this codebase's duration estimation.
export const WORDS_PER_MINUTE = 145;

/** Output-token ceiling for the script-generation call — a safety cap, not a
 *  target (the actual length comes from the word-count instruction in the
 *  prompt). Scales with targetMinutes so a longer episode (up to the 15-min
 *  ceiling) has enough room to actually be written, instead of a single
 *  fixed budget sized for one specific duration. The formula's constants are
 *  anchored to 7000 tokens at the old 7-minute default (the last known-good
 *  value before daily/weekly durations existed), so 5/10-minute output stays
 *  close to what was already working. */
export function estimateOutputTokenBudget(targetMinutes: number): number {
  return Math.round(1400 + targetMinutes * 800);
}

/** Request timeout for the OpenAI client — also scales with targetMinutes,
 *  same reasoning as estimateOutputTokenBudget: a longer script takes
 *  proportionally longer to generate and to fact-check. */
export function estimateRequestTimeoutMs(targetMinutes: number): number {
  return Math.round(60_000 + targetMinutes * 6_000);
}

const DEFAULT_TEXT_MODEL = "gpt-5.6-terra";

export function resolveTextModel(): string {
  return process.env.OPENAI_TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
}

// New env var this module introduces. Not added to .env.example (existing
// file, left untouched by this pass) — add `OPENAI_VERIFY_MODEL=...` there
// yourselves when wiring this in. Falls back to the text model if unset, so
// it works with zero config until you deliberately point it at something
// cheaper for the verification pass.
export function resolveVerifyModel(): string {
  return process.env.OPENAI_VERIFY_MODEL ?? resolveTextModel();
}

// Mirrors the compliance guard in lib/briefs.ts's `prohibited` regex. Kept in
// sync manually since that file isn't edited by this module.
export const PROHIBITED_ADVICE_PATTERN =
  /(^|[.!?]\s*)(קנה|מכור|כדאי לקנות|כדאי למכור|buy|sell)(\s|[.!?])/i;

// Latin letters in the spoken text (unconverted ticker/acronym/English word) —
// the prompt asks for Hebrew phonetic spelling instead, since a TTS engine
// will otherwise mispronounce or skip Latin-script text. Shared between
// verify.ts (flags it) and generate.ts (locates and removes the offending
// sentence during the sentence-level repair pass).
export const LATIN_LETTERS_PATTERN = /[A-Za-z]/;
