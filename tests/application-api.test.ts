import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, responseJson } from "./helpers";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  assertSupabase: vi.fn((error: { message: string } | null, operation: string) => {
    if (error) throw new Error(`${operation}: ${error.message}`);
  }),
  createBrief: vi.fn(),
  getBrief: vi.fn(),
  getMarketQuotes: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/db", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
  assertSupabase: mocks.assertSupabase,
  AUDIO_BUCKET: "vestory-audio",
  audioObjectPath: (briefId: string, value: string) => value.includes("/") ? value : `${briefId}/${value}`,
}));
vi.mock("@/lib/briefs", () => ({ createBrief: mocks.createBrief, getBrief: mocks.getBrief }));
vi.mock("@/lib/marketData", () => ({ getMarketQuotes: mocks.getMarketQuotes }));

import { GET as listBriefs, POST as createBriefRoute } from "../product/app/api/briefs/route";
import { GET as getBriefRoute } from "../product/app/api/briefs/[id]/route";
import { GET as marketDataRoute } from "../product/app/api/market-data/route";
import { GET as getDraft, PUT as putDraft, DELETE as deleteDraft } from "../product/app/api/onboarding/draft/route";
import { POST as parsePortfolio } from "../product/app/api/portfolio/parse/route";
import { POST as parsePortfolioImage } from "../product/app/api/portfolio/parse-image/route";
import { GET as getProfile, PUT as putProfile } from "../product/app/api/profile/route";

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.getMarketQuotes.mockResolvedValue({});
  mocks.createBrief.mockResolvedValue("brief-1");
  mocks.getBrief.mockResolvedValue(null);
  delete process.env.LOCAL_PREVIEW;
  delete process.env.OPENAI_API_KEY;
});

describe("protected product APIs", () => {
  it("requires a user for every read endpoint", async () => {
    const responses = await Promise.all([
      listBriefs(),
      getBriefRoute(new Request("https://www.slinon.me/api/briefs/1"), { params: Promise.resolve({ id: "1" }) }),
      marketDataRoute(new Request("https://www.slinon.me/api/market-data?tickers=AAPL")),
      getDraft(),
      getProfile(),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    for (const response of responses) expect(await responseJson(response)).toEqual({ error: "unauthorized" });
  });

  it("requires a user for portfolio text and image parsing", async () => {
    const text = await parsePortfolio(jsonRequest("/api/portfolio/parse", { text: "NVDA" }));
    const image = await parsePortfolioImage(jsonRequest("/api/portfolio/parse-image", { imageDataUrl: "data:image/png;base64,AA==" }));
    expect(text.status).toBe(401);
    expect(image.status).toBe(401);
  });

  it.each([
    [createBriefRoute, "/api/briefs", {}],
    [putProfile, "/api/profile", {}],
    [putDraft, "/api/onboarding/draft", { text: "", assets: [] }],
    [deleteDraft, "/api/onboarding/draft", {}],
  ])("blocks cross-origin writes before authentication", async (handler, path, body) => {
    const response = await handler(jsonRequest(path, body, { method: handler === deleteDraft ? "DELETE" : "POST", origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(await responseJson(response)).toEqual({ error: "origin_not_allowed" });
  });
});

describe("portfolio parsing", () => {
  it("uses deterministic local parsing in onboarding preview", async () => {
    process.env.LOCAL_PREVIEW = "true";
    const response = await parsePortfolio(jsonRequest("/api/portfolio/parse?preview=onboarding", {
      text: "אנבידיה, בינה מלאכותית, אנרגיה ירוקה",
    }));
    expect(response.status).toBe(200);
    expect(await responseJson(response)).toEqual({
      assets: [{ name: "NVIDIA", symbol: "NVDA", quantity: null, averageCost: null, currency: null }],
      interests: ["AI", "אנרגיה ירוקה"],
      localPreview: true,
    });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it("falls back safely when OpenAI is not configured", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await parsePortfolio(jsonRequest("/api/portfolio/parse", { text: "Apple, קריפטו" }));
    expect(await responseJson(response)).toEqual({
      assets: [{ name: "Apple", symbol: "AAPL", quantity: null, averageCost: null, currency: null }],
      interests: ["קריפטו"],
      localFallback: true,
    });
  });

  it("reports unavailable image recognition without an API key", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await parsePortfolioImage(jsonRequest("/api/portfolio/parse-image", {
      imageDataUrl: "data:image/png;base64,AA==",
    }));
    expect(response.status).toBe(502);
    expect(await responseJson(response)).toEqual({ error: "זיהוי תמונות אינו זמין כרגע (חסר מפתח OpenAI)." });
  });
});

describe("brief and market endpoints", () => {
  it("starts an on-demand brief asynchronously", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await createBriefRoute(jsonRequest("/api/briefs", {}));
    expect(response.status).toBe(202);
    expect(await responseJson(response)).toEqual({ id: "brief-1" });
    expect(mocks.createBrief).toHaveBeenCalledWith("user-1");
  });

  it("returns a stable profile-incomplete error instead of an internal exception", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.createBrief.mockRejectedValue(new Error("profile_incomplete"));
    const response = await createBriefRoute(jsonRequest("/api/briefs", {}));
    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ error: "profile_incomplete" });
  });

  it("returns a user-owned brief and hides missing or foreign briefs", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.getBrief.mockResolvedValueOnce({ id: "brief-1", status: "completed" }).mockResolvedValueOnce(null);
    const found = await getBriefRoute(new Request("https://www.slinon.me/api/briefs/brief-1"), {
      params: Promise.resolve({ id: "brief-1" }),
    });
    const missing = await getBriefRoute(new Request("https://www.slinon.me/api/briefs/foreign"), {
      params: Promise.resolve({ id: "foreign" }),
    });
    expect(found.status).toBe(200);
    expect(mocks.getBrief).toHaveBeenNthCalledWith(1, "brief-1", "user-1");
    expect(missing.status).toBe(404);
  });

  it("normalizes and caps a market-data request at twenty tickers", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const tickers = Array.from({ length: 25 }, (_, index) => `T${index}`).join(",");
    const response = await marketDataRoute(new Request(`https://www.slinon.me/api/market-data?tickers=${tickers}`));
    expect(response.headers.get("cache-control")).toBe("private, max-age=30");
    expect(mocks.getMarketQuotes).toHaveBeenCalledWith(Array.from({ length: 20 }, (_, index) => `T${index}`));
  });

  it("returns an empty market response without calling the provider", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await marketDataRoute(new Request("https://www.slinon.me/api/market-data"));
    expect(await responseJson(response)).toEqual({});
    expect(mocks.getMarketQuotes).not.toHaveBeenCalled();
  });
});

describe("onboarding draft validation", () => {
  it("rejects an invalid draft before storage", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await putDraft(jsonRequest("/api/onboarding/draft", {
      text: "x".repeat(2001), assets: [],
    }, { method: "PUT" }));
    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ error: "invalid_draft" });
  });
});
