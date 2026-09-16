import { z } from "zod";

export type TopicKind = "holding" | "watchlist" | "interest";

export interface CollectedItem {
  id: string;
  topicKind: TopicKind;
  topicLabel: string;
  // Every holding/watchlist symbol this item is actually tagged with, not
  // just the primary topicLabel above — a single article commonly covers
  // several correlated symbols at once (e.g. SPY/QQQ/SPXL/TQQQ all move
  // together on a broad index swing). Without this, the model only ever
  // sees the one arbitrarily-first-matched symbol and silently never
  // mentions the others, even when the source material covers them too.
  relatedSymbols: string[];
  occurredAt: string; // ISO datetime the event actually happened
  headline: string;
  summary: string;
  numericFacts: Array<{ label: string; value: string; unit?: string }>;
  sourceUrl?: string;
  sourceName?: string;
}

export interface ProfileInput {
  podcastPlan: "daily" | "weekly";
  holdings: Array<{ name: string; symbol: string }>;
  watchlist: Array<{ name: string; symbol: string }>;
  interests: Array<{ label: string }>;
  targetMinutes: number;
}

export interface GeneratePodcastInput {
  profile: ProfileInput;
  windowStart: string; // ISO
  windowEnd: string; // ISO
}

// Matches the existing `chapters.reason_kind` enum in db/schema.ts exactly,
// so a chapter produced here can be inserted into that table with no translation.
export const podcastScriptSchema = z.object({
  title: z.string().max(120),
  chapters: z.array(
    z.object({
      title: z.string().max(120),
      // Sized as a safety ceiling for the longest supported episode (15 min),
      // not a per-chapter target — the actual length is driven by the
      // word-count instruction in buildScriptPrompt.
      script: z.string().max(4200),
      reasonKind: z.enum(["portfolio", "watchlist", "interest", "general"]),
      reasonLabel: z.string().max(80),
      sourceItemIds: z.array(z.string()),
    }),
  ).min(1).max(10),
});

export type PodcastScript = z.infer<typeof podcastScriptSchema>;

export const verificationVerdictSchema = z.object({
  ok: z.boolean(),
  issues: z.array(
    z.object({
      chapterIndex: z.number().int(),
      sentence: z.string(),
      reason: z.string(),
    }),
  ),
});

export type VerificationVerdict = z.infer<typeof verificationVerdictSchema>;
