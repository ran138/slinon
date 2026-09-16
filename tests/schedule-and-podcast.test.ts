import { afterEach, describe, expect, it } from "vitest";
import { computeNextRunAt, targetMinutesForPlan } from "../product/lib/schedule";
import { podcastDisplayTitle } from "../product/lib/podcast/display";
import {
  estimateOutputTokenBudget,
  estimateRequestTimeoutMs,
  resolveTextModel,
  resolveVerifyModel,
} from "../product/lib/podcast/constants";
import { computeCacheKey } from "../product/lib/podcast/cache";
import { buildCorrectivePrompt, buildScriptPrompt, buildVerificationPrompt } from "../product/lib/podcast/prompt";
import { podcastScriptSchema, verificationVerdictSchema, type CollectedItem, type GeneratePodcastInput } from "../product/lib/podcast/types";
import { checkLatinScriptLeakage, checkProhibitedPhrases, checkReferentialIntegrity } from "../product/lib/podcast/verify";
import { audioObjectPath } from "../product/db";

const input: GeneratePodcastInput = {
  profile: {
    podcastPlan: "daily",
    holdings: [{ name: "NVIDIA", symbol: "NVDA" }],
    watchlist: [{ name: "Apple", symbol: "AAPL" }],
    interests: [{ label: "שבבים" }],
    targetMinutes: 5,
  },
  windowStart: "2026-09-15T00:00:00.000Z",
  windowEnd: "2026-09-16T00:00:00.000Z",
};

const item: CollectedItem = {
  id: "item-1",
  topicKind: "holding",
  topicLabel: "NVDA",
  relatedSymbols: ["NVDA"],
  occurredAt: "2026-09-15T10:00:00.000Z",
  headline: "Chip company update",
  summary: "A verified summary",
  numericFacts: [{ label: "change", value: "4", unit: "%" }],
};

function script(text = "זהו עדכון מאומת.", sourceItemIds = ["item-1"]) {
  return {
    title: "עדכון השוק",
    chapters: [{
      title: "פרק ראשון",
      script: text,
      reasonKind: "portfolio" as const,
      reasonLabel: "NVDA",
      sourceItemIds,
    }],
  };
}

afterEach(() => {
  delete process.env.OPENAI_TEXT_MODEL;
  delete process.env.OPENAI_VERIFY_MODEL;
});

describe("podcast scheduling", () => {
  it("maps daily and weekly plans to their product durations", () => {
    expect(targetMinutesForPlan("daily")).toBe(5);
    expect(targetMinutesForPlan("weekly")).toBe(15);
  });

  it("schedules the next weekday at Jerusalem wall-clock time", () => {
    expect(computeNextRunAt({
      podcastPlan: "daily", scheduleTime: "07:00", scheduleDay: null, scheduleTimezone: "Asia/Jerusalem",
    }, new Date("2026-09-14T02:00:00.000Z"))).toBe("2026-09-14T04:00:00.000Z");
  });

  it("moves a passed daily time to the next weekday", () => {
    expect(computeNextRunAt({
      podcastPlan: "daily", scheduleTime: "07:00", scheduleDay: null, scheduleTimezone: "Asia/Jerusalem",
    }, new Date("2026-09-18T06:00:00.000Z"))).toBe("2026-09-21T04:00:00.000Z");
  });

  it("skips Saturday and Sunday for a daily plan", () => {
    expect(computeNextRunAt({
      podcastPlan: "daily", scheduleTime: "07:00", scheduleDay: null, scheduleTimezone: "Asia/Jerusalem",
    }, new Date("2026-09-19T07:00:00.000Z"))).toBe("2026-09-21T04:00:00.000Z");
  });

  it("schedules a weekly plan on its selected weekday", () => {
    expect(computeNextRunAt({
      podcastPlan: "weekly", scheduleTime: "09:30", scheduleDay: 3, scheduleTimezone: "Asia/Jerusalem",
    }, new Date("2026-09-14T10:00:00.000Z"))).toBe("2026-09-16T06:30:00.000Z");
  });

  it("preserves Jerusalem wall-clock time across daylight-saving changes", () => {
    const summer = computeNextRunAt({
      podcastPlan: "daily", scheduleTime: "07:00", scheduleDay: null, scheduleTimezone: "Asia/Jerusalem",
    }, new Date("2026-09-14T00:00:00.000Z"));
    const winter = computeNextRunAt({
      podcastPlan: "daily", scheduleTime: "07:00", scheduleDay: null, scheduleTimezone: "Asia/Jerusalem",
    }, new Date("2026-11-02T00:00:00.000Z"));
    expect(summer.endsWith("04:00:00.000Z")).toBe(true);
    expect(winter.endsWith("05:00:00.000Z")).toBe(true);
  });
});

describe("podcast presentation and budgets", () => {
  it("prefers a meaningful editorial title", () => {
    expect(podcastDisplayTitle({ title: "  השווקים מגיבים להחלטת הריבית  ", chapters: [] })).toBe("השווקים מגיבים להחלטת הריבית");
  });

  it("replaces generic generated titles with unique chapter topics", () => {
    expect(podcastDisplayTitle({
      title: "הפודקאסט של היום",
      chapters: [{ title: "אנבידיה" }, { title: "ריבית" }, { title: "אנבידיה" }] as never,
    })).toBe("אנבידיה · ריבית");
  });

  it("uses a safe fallback and truncates excessively long titles", () => {
    expect(podcastDisplayTitle(null)).toBe("עדכון השוק שלך");
    const longTitle = podcastDisplayTitle({ title: "מילה ".repeat(30), chapters: [] });
    expect(longTitle.length).toBeLessThanOrEqual(108);
    expect(longTitle.endsWith("…")).toBe(true);
  });

  it("scales generation budget and request timeout with episode length", () => {
    expect(estimateOutputTokenBudget(5)).toBe(5400);
    expect(estimateOutputTokenBudget(15)).toBe(13400);
    expect(estimateRequestTimeoutMs(5)).toBe(90_000);
    expect(estimateRequestTimeoutMs(15)).toBe(150_000);
  });

  it("allows a separate verification model and falls back to the text model", () => {
    expect(resolveTextModel()).toBe("gpt-5.6-terra");
    expect(resolveVerifyModel()).toBe("gpt-5.6-terra");
    process.env.OPENAI_TEXT_MODEL = "writer";
    expect(resolveVerifyModel()).toBe("writer");
    process.env.OPENAI_VERIFY_MODEL = "checker";
    expect(resolveVerifyModel()).toBe("checker");
  });
});

describe("podcast data contracts", () => {
  it("accepts a valid script and enforces chapter bounds", () => {
    expect(podcastScriptSchema.safeParse(script()).success).toBe(true);
    expect(podcastScriptSchema.safeParse({ title: "x", chapters: [] }).success).toBe(false);
    expect(podcastScriptSchema.safeParse({ title: "x", chapters: Array.from({ length: 11 }, () => script().chapters[0]) }).success).toBe(false);
  });

  it("enforces valid reason kinds and verification issue indexes", () => {
    expect(podcastScriptSchema.safeParse({ ...script(), chapters: [{ ...script().chapters[0], reasonKind: "made-up" }] }).success).toBe(false);
    expect(verificationVerdictSchema.safeParse({ ok: false, issues: [{ chapterIndex: 0.5, sentence: "x", reason: "y" }] }).success).toBe(false);
  });

  it("detects unknown source references", () => {
    expect(checkReferentialIntegrity(script("עדכון תקין.", ["missing"]), [item]))
      .toEqual(['Chapter 0 cites unknown item id "missing"']);
  });

  it.each(["קנה עכשיו.", "כדאי למכור את המניה.", "Buy this asset."])("detects prohibited advice: %s", (text) => {
    expect(checkProhibitedPhrases(script(text))).toHaveLength(1);
  });

  it("does not confuse neutral mentions of selling with a direct instruction", () => {
    expect(checkProhibitedPhrases(script("החברה דיווחה שהלקוחות מכרו נכסים."))).toEqual([]);
  });

  it("detects Latin-script leakage only in spoken text", () => {
    expect(checkLatinScriptLeakage(script("מניית NVDA עלתה."))).toHaveLength(1);
    expect(checkLatinScriptLeakage(script("מניית אנבידיה עלתה."))).toEqual([]);
  });

  it("builds a bounded, source-grounded script prompt", () => {
    const prompt = buildScriptPrompt(input, [item]);
    expect(prompt).toContain("725 Hebrew words");
    expect(prompt).toContain(input.windowStart);
    expect(prompt).toContain(input.windowEnd);
    expect(prompt).toContain('"relatedSymbols":["NVDA"]');
    expect(prompt).toContain("No investment advice");
    expect(prompt).toContain("never write Latin-script letters directly");
  });

  it("builds verification and corrective prompts with exact evidence", () => {
    expect(buildVerificationPrompt(script(), [item])).toContain('"id":"item-1"');
    expect(buildCorrectivePrompt("original", {
      issues: [{ chapterIndex: 0, sentence: "משפט בעייתי", reason: "לא נתמך" }],
    })).toContain('Chapter 0: "משפט בעייתי" — לא נתמך');
  });

  it("computes an order-independent cache key that changes with content", () => {
    const a = computeCacheKey({ profile: input.profile, windowStart: input.windowStart, windowEnd: input.windowEnd, itemIds: ["b", "a"] });
    const reordered = computeCacheKey({
      profile: { ...input.profile, holdings: [...input.profile.holdings], interests: [...input.profile.interests] },
      windowStart: input.windowStart, windowEnd: input.windowEnd, itemIds: ["a", "b"],
    });
    const changed = computeCacheKey({ profile: input.profile, windowStart: input.windowStart, windowEnd: input.windowEnd, itemIds: ["a", "c"] });
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(a);
    expect(changed).not.toBe(a);
  });

  it("normalizes legacy and current audio object paths", () => {
    expect(audioObjectPath("brief-1", "chapter.mp3")).toBe("brief-1/chapter.mp3");
    expect(audioObjectPath("brief-1", "brief-1/chapter.mp3")).toBe("brief-1/chapter.mp3");
  });
});
