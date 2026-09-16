import type { CollectedItem, GeneratePodcastInput, PodcastScript, VerificationVerdict } from "./types";
import { WORDS_PER_MINUTE } from "./constants";

export function buildScriptPrompt(input: GeneratePodcastInput, items: CollectedItem[]): string {
  const targetWords = input.profile.targetMinutes * WORDS_PER_MINUTE;
  return `Write an original Hebrew-language spoken script for a personal, on-demand investment news podcast.

PERSONA & TONE: Write like an accessible financial educator or mentor — authoritative, calm, and clear, speaking at eye level with the listener. Turn the underlying facts into a logical, easy-to-follow story rather than a dry list of headlines, using natural transition sentences that connect topics smoothly. Keep the pace dynamic and engaging, like a well-produced news segment — never robotic or overly formal.

TEXT-TO-SPEECH FORMATTING — this script is read aloud by a TTS engine, so the SPOKEN text (the "script" field only) must follow these rules:
- Refer to companies by their name, not their ticker symbol (e.g. "אנבידיה", not "NVDA"). If you must say a ticker, acronym, or English term aloud, spell it out phonetically in Hebrew letters (e.g. "NVDA" → "אן-וי-די-איי", "Wall Street" → "וול סטריט") — never write Latin-script letters directly in the spoken text, they will be read incorrectly by the TTS engine.
- Write numbers, percentages, and dates out in words where that reads naturally when spoken (e.g. "ארבעה אחוזים" rather than "4%"), unless a very precise figure is genuinely clearer read as digits.
(This formatting only applies to the "script" field. reasonLabel and sourceItemIds should stay as exact profile symbols/ids, since those aren't spoken aloud.)

EXAMPLE (style only — do not reuse these specific facts in the real output):
Given an item like {"headline": "Nvidia unveils next-gen AI chip, shares rise 4%", "topicLabel": "NVDA", ...}, a good opening sentence is:
"אנחנו פותחים עם ענקית השבבים אנבידיה, שהציגה השבוע שבב בינה מלאכותית מהדור הבא — והמניה הגיבה בעלייה של כארבעה אחוזים."

TIMELINE: This episode covers verified items between ${input.windowStart} and ${input.windowEnd}.

TARGET LENGTH: about ${targetWords} Hebrew words in total across all chapters (~${input.profile.targetMinutes} spoken minutes at ${WORDS_PER_MINUTE} words/minute), within roughly ±10-15%. If there isn't enough real, sourced material in the items below to responsibly fill that length, it is fine to run shorter — never pad, speculate, or invent content just to reach the target length.

USER PROFILE (cover only these entities, plus general market/economy context clearly relevant to them):
${JSON.stringify(input.profile)}

VERIFIED ITEMS — your only source of facts. Do not use outside knowledge and do not mention anything not listed here:
${JSON.stringify(items)}

RULES:
- Every number, price, percentage, or figure you state must come directly from an item's numericFacts, headline, or summary field. Never invent, estimate, round speculatively, or recall a figure from memory.
- Write every sentence in your own original Hebrew wording. Treat each item's headline/summary as a factual reference only — never copy its phrases, sentences, or headline verbatim into the script.
- No investment advice, buy/sell/hold recommendations, forecasts, or price targets.
- No defamatory, unlawful, or otherwise legally risky statements about any person, company, or entity.
- Do not open with any AI-disclosure, educational-disclaimer, or "welcome to the show" preamble — start directly with the first real story.
- You may combine multiple items about the same profile entity into a single chapter.
- An item's relatedSymbols lists every one of the user's holdings/watchlist entries it actually covers, not just its primary topicLabel. When an item is relevant to several correlated holdings at once (e.g. multiple index-tracking or leveraged ETFs all moving together on the same broad market news), name all of the genuinely relevant ones by their profile name within whichever chapter covers it — don't silently mention only one and leave the others out.
- If there is more material than fits the word budget, prioritize the items most material to this exact user profile and omit minor/low-impact ones — do not compress everything in.
- If there is very little material overall — not enough to responsibly fill even a short chapter — write a brief summary paragraph covering what's actually available and close with a short, natural closing line, rather than leaving a chapter feeling cut off or padded with filler.
- For every non-general chapter, reasonKind/reasonLabel must correspond to exactly one entity from USER PROFILE (a holding, a watchlist item, or an interest label) that the chapter is actually about. Use "general" only for broad market/economy context not tied to one entity.
- List the id(s) of the items each chapter is based on in sourceItemIds.`;
}

export function buildVerificationPrompt(script: PodcastScript, items: CollectedItem[]): string {
  return `You are a strict fact-checker and compliance reviewer for a Hebrew investment-news podcast script.

Given the SCRIPT below and the exact VERIFIED ITEMS it was supposed to be based on, review every chapter and flag any sentence that:
(a) states a claim, number, or fact not directly supported by the VERIFIED ITEMS (hallucination),
(b) gives investment advice, a buy/sell/hold recommendation, a forecast, or a price target,
(c) makes a defamatory, unlawful, or otherwise legally risky statement about any person, company, or entity.

Return ok=true only if there are zero issues. Otherwise return ok=false with one entry per problem sentence, naming which chapter (0-indexed) it's in and why it's flagged.

SCRIPT:
${JSON.stringify(script)}

VERIFIED ITEMS:
${JSON.stringify(items)}`;
}

export function buildCorrectivePrompt(
  originalPrompt: string,
  verdict: Pick<VerificationVerdict, "issues"> | { issues: Array<{ chapterIndex: number; sentence: string; reason: string }> },
): string {
  const issueLines = verdict.issues
    .map((issue) => `- Chapter ${issue.chapterIndex}: "${issue.sentence}" — ${issue.reason}`)
    .join("\n");
  return `${originalPrompt}

IMPORTANT — a previous attempt had these problems. Fix all of them in this new version, while still following every rule above:
${issueLines}`;
}
