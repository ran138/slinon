import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectedItem, GeneratePodcastInput, PodcastScript } from "../product/lib/podcast/types";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  fetchCollectedItems: vi.fn(),
  verifyScript: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { parse: mocks.parse };
  },
}));

vi.mock("../product/lib/podcast/dataSource", () => ({
  fetchCollectedItems: mocks.fetchCollectedItems,
}));

vi.mock("../product/lib/podcast/verify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../product/lib/podcast/verify")>();
  return { ...actual, verifyScript: mocks.verifyScript };
});

import { generatePodcastScript } from "../product/lib/podcast/generate";

const input: GeneratePodcastInput = {
  profile: {
    podcastPlan: "daily",
    holdings: [{ name: "אנבידיה", symbol: "NVDA" }],
    watchlist: [],
    interests: [{ label: "שבבים" }],
    targetMinutes: 5,
  },
  windowStart: "2026-09-15T00:00:00.000Z",
  windowEnd: "2026-09-16T00:00:00.000Z",
};

const item: CollectedItem = {
  id: "source-1",
  topicKind: "holding",
  topicLabel: "NVDA",
  relatedSymbols: ["NVDA"],
  occurredAt: "2026-09-15T10:00:00.000Z",
  headline: "עדכון חברה",
  summary: "מידע מאומת",
  numericFacts: [],
  sourceUrl: "https://example.com/story",
  sourceName: "Example",
};

function script(text = "זהו משפט תקין ומאומת.", sourceItemIds = ["source-1"]): PodcastScript {
  return {
    title: "עדכון אישי",
    chapters: [{
      title: "אנבידיה",
      script: text,
      reasonKind: "portfolio",
      reasonLabel: "NVDA",
      sourceItemIds,
    }],
  };
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  mocks.fetchCollectedItems.mockResolvedValue([item]);
  mocks.parse.mockResolvedValue({ output_parsed: script(), usage: undefined });
  mocks.verifyScript.mockResolvedValue({ ok: true, structuralIssues: [], factCheckIssues: [] });
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_TEXT_MODEL;
});

describe("podcast script generation", () => {
  it("fails before external work when the OpenAI key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(generatePodcastScript(input)).rejects.toThrow("missing_api_key");
    expect(mocks.fetchCollectedItems).not.toHaveBeenCalled();
  });

  it("fails safely when there is no verified research material", async () => {
    mocks.fetchCollectedItems.mockResolvedValue([]);
    await expect(generatePodcastScript(input)).rejects.toThrow("research_failed");
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("queries every profile seam and returns the verified script with its evidence", async () => {
    const result = await generatePodcastScript(input);
    expect(mocks.fetchCollectedItems).toHaveBeenCalledWith([
      { kind: "holding", label: "NVDA" },
      { kind: "interest", label: "שבבים" },
    ], input.windowStart, input.windowEnd);
    expect(mocks.parse).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5.6-terra",
      store: false,
      max_output_tokens: 5400,
    }));
    expect(mocks.verifyScript).toHaveBeenCalledOnce();
    expect(result).toEqual({ script: script(), itemsUsed: [item] });
  });

  it("makes one corrective generation attempt when verification finds an issue", async () => {
    const corrected = script("זהו הנוסח המתוקן והמאומת.");
    mocks.parse
      .mockResolvedValueOnce({ output_parsed: script("משפט בעייתי."), usage: undefined })
      .mockResolvedValueOnce({ output_parsed: corrected, usage: undefined });
    mocks.verifyScript
      .mockResolvedValueOnce({
        ok: false,
        structuralIssues: [],
        factCheckIssues: [{ chapterIndex: 0, sentence: "משפט בעייתי.", reason: "לא נתמך" }],
      })
      .mockResolvedValueOnce({ ok: true, structuralIssues: [], factCheckIssues: [] });

    const result = await generatePodcastScript(input);
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(String(mocks.parse.mock.calls[1][0].input)).toContain('Chapter 0: "משפט בעייתי." — לא נתמך');
    expect(result.script).toEqual(corrected);
  });

  it("surgically removes a fact-check failure after the corrective retry also fails", async () => {
    const retry = script("משפט מאומת נשאר. משפט בעייתי נמחק. משפט סיום נשאר.");
    mocks.parse
      .mockResolvedValueOnce({ output_parsed: script("טיוטה ראשונה."), usage: undefined })
      .mockResolvedValueOnce({ output_parsed: retry, usage: undefined });
    mocks.verifyScript
      .mockResolvedValueOnce({
        ok: false, structuralIssues: [],
        factCheckIssues: [{ chapterIndex: 0, sentence: "טיוטה ראשונה.", reason: "לא נתמך" }],
      })
      .mockResolvedValueOnce({
        ok: false, structuralIssues: [],
        factCheckIssues: [{ chapterIndex: 0, sentence: "משפט בעייתי נמחק.", reason: "לא נתמך" }],
      });

    const result = await generatePodcastScript(input);
    expect(result.script.chapters[0].script).toBe("משפט מאומת נשאר. משפט סיום נשאר.");
    expect(result.script.chapters[0].sourceItemIds).toEqual(["source-1"]);
  });

  it("removes unknown citations and replaces an unresolvable chapter with a safe placeholder", async () => {
    const retry = script("תוכן שלא ניתן לאמת.", ["source-1", "invented"]);
    mocks.parse
      .mockResolvedValueOnce({ output_parsed: script("טיוטה ראשונה."), usage: undefined })
      .mockResolvedValueOnce({ output_parsed: retry, usage: undefined });
    mocks.verifyScript
      .mockResolvedValueOnce({
        ok: false, structuralIssues: ["Chapter 0 cites unknown item id \"invented\""], factCheckIssues: [],
      })
      .mockResolvedValueOnce({
        ok: false,
        structuralIssues: ["Chapter 0 cites unknown item id \"invented\""],
        factCheckIssues: [{ chapterIndex: 0, sentence: "", reason: "verification_unavailable" }],
      });

    const result = await generatePodcastScript(input);
    expect(result.script.chapters[0]).toMatchObject({
      title: "אנבידיה",
      reasonLabel: "NVDA",
      script: "אין לנו כרגע עדכון מאומת לגבי NVDA. נבדוק שוב ונעדכן אתכם בהמשך.",
      sourceItemIds: [],
    });
  });
});
