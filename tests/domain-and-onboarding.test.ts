import { describe, expect, it } from "vitest";
import { assetInputSchema, profileUpdateSchema } from "../product/lib/domain";
import {
  conceptKey,
  editDistance,
  matchAsset,
  matchInterest,
  normalizeInterests,
  parseOnboardingText,
  searchAssets,
  searchInterests,
} from "../product/lib/onboarding";

const validProfile = {
  targetMinutes: 5,
  podcastPlan: "daily" as const,
  scheduleTime: "07:00",
  scheduleDay: null,
  scheduleTimezone: "Asia/Jerusalem" as const,
  notifyByEmail: true,
  onboardingComplete: true,
  assets: [{ kind: "holding" as const, name: "NVIDIA", symbol: "nvda" }],
  interests: [],
};

describe("profile validation", () => {
  it("normalizes ticker casing and surrounding whitespace", () => {
    expect(assetInputSchema.parse({ kind: "holding", name: " NVIDIA ", symbol: " nvda " }))
      .toMatchObject({ name: "NVIDIA", symbol: "NVDA" });
  });

  it.each([5, 10, 15])("accepts the supported %s-minute durations", (targetMinutes) => {
    expect(profileUpdateSchema.safeParse({ ...validProfile, targetMinutes }).success).toBe(true);
  });

  it.each([0, 7, 20])("rejects unsupported duration %s", (targetMinutes) => {
    expect(profileUpdateSchema.safeParse({ ...validProfile, targetMinutes }).success).toBe(false);
  });

  it("requires a weekday for weekly delivery", () => {
    const parsed = profileUpdateSchema.safeParse({ ...validProfile, podcastPlan: "weekly", scheduleDay: null });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues).toContainEqual(expect.objectContaining({ path: ["scheduleDay"] }));
  });

  it("accepts weekdays one through five and rejects weekends", () => {
    expect(profileUpdateSchema.safeParse({ ...validProfile, podcastPlan: "weekly", scheduleDay: 1 }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...validProfile, podcastPlan: "weekly", scheduleDay: 5 }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...validProfile, podcastPlan: "weekly", scheduleDay: 0 }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...validProfile, podcastPlan: "weekly", scheduleDay: 6 }).success).toBe(false);
  });

  it("requires at least one tracked asset or interest", () => {
    expect(profileUpdateSchema.safeParse({ ...validProfile, assets: [], interests: [] }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...validProfile, assets: [], interests: [{ label: "שבבים" }] }).success).toBe(true);
  });

  it.each(["7:00", "24:00", "12:60", "noon"])("rejects invalid schedule time %s", (scheduleTime) => {
    expect(profileUpdateSchema.safeParse({ ...validProfile, scheduleTime }).success).toBe(false);
  });

  it("enforces collection and field-size limits", () => {
    expect(assetInputSchema.safeParse({ kind: "holding", name: "x".repeat(101), symbol: "X" }).success).toBe(false);
    expect(assetInputSchema.safeParse({ kind: "holding", name: "X", symbol: "X".repeat(21) }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({
      ...validProfile,
      assets: Array.from({ length: 51 }, (_, index) => ({ kind: "holding", name: `Asset ${index}`, symbol: `A${index}` })),
    }).success).toBe(false);
  });
});

describe("onboarding matching", () => {
  it("creates stable keys across case, punctuation and Hebrew cantillation", () => {
    expect(conceptKey(" S&P 500 ")).toBe("sp500");
    expect(conceptKey("שָׁלוֹם")).toBe(conceptKey("שלום"));
  });

  it("supports one edit and adjacent transposition", () => {
    expect(editDistance("apple", "appl")).toBe(1);
    expect(editDistance("apple", "appel")).toBe(1);
  });

  it.each([
    ["אנבידיה", "NVDA"],
    ["Google", "GOOGL"],
    ["1120300", "TASE:TEVA"],
    ["ביטקוין", "BTC"],
  ])("matches asset alias %s", (value, ticker) => {
    expect(matchAsset(value)?.ticker).toBe(ticker);
  });

  it("corrects a single unambiguous typo but never autocorrects a short ticker", () => {
    expect(matchAsset("Microsft")?.ticker).toBe("MSFT");
    expect(matchAsset("MSF")).toBeUndefined();
  });

  it.each([
    ["technology", "טכנולוגיה"],
    ["בינה מלאכותית", "AI"],
    ["interest rates", "ריבית ואינפלציה"],
    ["gold", "זהב"],
  ])("normalizes interest alias %s", (value, expected) => {
    expect(matchInterest(value)).toBe(expected);
  });

  it("deduplicates equivalent interests while preserving custom topics", () => {
    expect(normalizeInterests(["AI", "בינה מלאכותית", "  אנרגיה ", "energy", "נושא אישי"]))
      .toEqual(["AI", "אנרגיה", "נושא אישי"]);
  });

  it("ranks exact and partial asset matches ahead of fuzzy results", () => {
    expect(searchAssets("nvda")[0]?.ticker).toBe("NVDA");
    expect(searchAssets("micro")[0]?.ticker).toBe("MSFT");
    expect(searchAssets("Microsft")[0]?.ticker).toBe("MSFT");
  });

  it("searches interests in Hebrew and English", () => {
    expect(searchInterests("semi").map((item) => item.id)).toContain("שבבים");
    expect(searchInterests("ריבית").map((item) => item.id)).toContain("ריבית ואינפלציה");
  });

  it("parses mixed free text without dropping unresolved investment topics", () => {
    expect(parseOnboardingText("אנבידיה, Apple; בינה מלאכותית\nאנרגיה ירוקה")).toEqual({
      assets: [
        { name: "NVIDIA", symbol: "NVDA", quantity: null, averageCost: null, currency: null },
        { name: "Apple", symbol: "AAPL", quantity: null, averageCost: null, currency: null },
      ],
      interests: ["AI", "אנרגיה ירוקה"],
    });
  });

  it("deduplicates the same asset supplied through different aliases", () => {
    expect(parseOnboardingText("NVDA, אנבידיה, NVIDIA").assets).toHaveLength(1);
  });
});
