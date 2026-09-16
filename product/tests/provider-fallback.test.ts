import { describe, expect, it, vi } from "vitest";
import { FallbackExtractor } from "../lib/ingestion/providers/fallback";
import {
  ProviderFailure,
  type ArticleProvider,
  type ExtractedArticle,
  type ExtractionRequest,
  type ProviderName,
} from "../lib/ingestion/providers/types";

function article(provider: ProviderName, request: ExtractionRequest): ExtractedArticle {
  return {
    sourceUrl: request.url,
    canonicalUrl: request.url,
    title: "Market update",
    content: "A complete article body",
    author: null,
    publishedAt: "2026-09-16T08:00:00.000Z",
    language: "en",
    extractedAt: "2026-09-16T09:00:00.000Z",
    provider,
    metadata: {},
  };
}

function provider(name: ProviderName, implementation: ArticleProvider["extract"]): ArticleProvider {
  return { name, extract: vi.fn(implementation) };
}

const request = { url: "https://example.com/article", sourceSite: "example" };

describe("FallbackExtractor", () => {
  it("uses providers in configured order", async () => {
    const first = provider("decodo", async (value) => article("decodo", value));
    const second = provider("firecrawl", async (value) => article("firecrawl", value));
    const result = await new FallbackExtractor([first, second]).extract(request);

    expect(result.ok).toBe(true);
    expect(first.extract).toHaveBeenCalledOnce();
    expect(second.extract).not.toHaveBeenCalled();
  });

  it("disables an exhausted provider for the rest of the run", async () => {
    const exhausted = provider("decodo", async () => {
      throw new ProviderFailure("quota_exhausted", "free quota used");
    });
    const fallback = provider("firecrawl", async (value) => article("firecrawl", value));
    const extractor = new FallbackExtractor([exhausted, fallback]);

    const [first, second] = await extractor.extractMany([
      request,
      { ...request, url: "https://example.com/second" },
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(exhausted.extract).toHaveBeenCalledOnce();
    expect(second.attempts[0]).toMatchObject({ provider: "decodo", status: "skipped" });
  });

  it("retries temporary failures before falling back", async () => {
    const temporary = provider("decodo", vi.fn()
      .mockRejectedValueOnce(new ProviderFailure("rate_limited", "slow down"))
      .mockRejectedValueOnce(new ProviderFailure("server_error", "unavailable"))
      .mockRejectedValueOnce(new ProviderFailure("network_error", "timeout")));
    const fallback = provider("firecrawl", async (value) => article("firecrawl", value));
    const wait = vi.fn(async () => undefined);

    const result = await new FallbackExtractor([temporary, fallback], { wait }).extract(request);

    expect(result.ok).toBe(true);
    expect(temporary.extract).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(fallback.extract).toHaveBeenCalledOnce();
  });

  it("falls back immediately for empty content", async () => {
    const empty = provider("decodo", async (value) => ({ ...article("decodo", value), content: "" }));
    const fallback = provider("firecrawl", async (value) => article("firecrawl", value));
    const result = await new FallbackExtractor([empty, fallback]).extract(request);

    expect(result.ok).toBe(true);
    expect(empty.extract).toHaveBeenCalledOnce();
    expect(fallback.extract).toHaveBeenCalledOnce();
  });

  it("rejects invalid URLs before invoking a provider", async () => {
    const mock = provider("decodo", async (value) => article("decodo", value));
    const result = await new FallbackExtractor([mock]).extract({ ...request, url: "http://example.com" });

    expect(result).toMatchObject({ ok: false, failureCode: "invalid_url" });
    expect(mock.extract).not.toHaveBeenCalled();
  });

  it("returns independent outcomes when one article fails", async () => {
    const mock = provider("decodo", async (value) => {
      if (value.url.endsWith("/bad")) throw new ProviderFailure("invalid_response", "bad page");
      return article("decodo", value);
    });
    const results = await new FallbackExtractor([mock]).extractMany([
      request,
      { ...request, url: "https://example.com/bad" },
    ]);

    expect(results.map((result) => result.ok)).toEqual([true, false]);
  });

  it("does not call a provider when the persistent quota store rejects a reservation", async () => {
    const first = provider("decodo", async (value) => article("decodo", value));
    const second = provider("firecrawl", async (value) => article("firecrawl", value));
    const quotaStore = {
      reserve: vi.fn(async (name: ProviderName) => ({
        reserved: name === "firecrawl",
        usedCredits: name === "firecrawl" ? 1 : 10,
        monthlyLimit: name === "firecrawl" ? 1000 : 10,
        unavailableUntil: null,
      })),
      recordFailure: vi.fn(async () => undefined),
    };
    const result = await new FallbackExtractor([first, second], { quotaStore }).extract(request);

    expect(result.ok).toBe(true);
    expect(first.extract).not.toHaveBeenCalled();
    expect(second.extract).toHaveBeenCalledOnce();
  });

  it("reserves one credit for every external retry", async () => {
    const temporary = provider("decodo", vi.fn()
      .mockRejectedValueOnce(new ProviderFailure("network_error", "first"))
      .mockRejectedValueOnce(new ProviderFailure("network_error", "second"))
      .mockImplementation(async (value) => article("decodo", value)));
    const quotaStore = {
      reserve: vi.fn(async () => ({ reserved: true, usedCredits: 1, monthlyLimit: 10, unavailableUntil: null })),
      recordFailure: vi.fn(async () => undefined),
    };
    const result = await new FallbackExtractor([temporary], {
      quotaStore,
      wait: async () => undefined,
    }).extract(request);

    expect(result.ok).toBe(true);
    expect(temporary.extract).toHaveBeenCalledTimes(3);
    expect(quotaStore.reserve).toHaveBeenCalledTimes(3);
  });

  it("persists provider-disabling failures", async () => {
    const unauthorized = provider("decodo", async () => {
      throw new ProviderFailure("authentication_error", "bad token");
    });
    const quotaStore = {
      reserve: vi.fn(async () => ({ reserved: true, usedCredits: 1, monthlyLimit: 10, unavailableUntil: null })),
      recordFailure: vi.fn(async () => undefined),
    };
    await new FallbackExtractor([unauthorized], { quotaStore }).extract(request);
    expect(quotaStore.recordFailure).toHaveBeenCalledWith("decodo", "authentication_error");
  });

  it("isolates quota-store failures and tries the next provider", async () => {
    const first = provider("decodo", async (value) => article("decodo", value));
    const second = provider("firecrawl", async (value) => article("firecrawl", value));
    const quotaStore = {
      reserve: vi.fn(async (name: ProviderName) => {
        if (name === "decodo") throw new Error("database unavailable");
        return { reserved: true, usedCredits: 1, monthlyLimit: 10, unavailableUntil: null };
      }),
      recordFailure: vi.fn(async () => undefined),
    };
    const result = await new FallbackExtractor([first, second], { quotaStore }).extract(request);
    expect(result.ok).toBe(true);
    expect(result.attempts[0]).toMatchObject({
      provider: "decodo",
      failureCode: "unknown_error",
      creditsReserved: 0,
    });
    expect(first.extract).not.toHaveBeenCalled();
    expect(second.extract).toHaveBeenCalledOnce();
  });
});
