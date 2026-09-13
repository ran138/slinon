// Same speech-rate figure used elsewhere in this codebase's duration estimation.
export const WORDS_PER_MINUTE = 145;

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
