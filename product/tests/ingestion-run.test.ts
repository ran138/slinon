import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { DiscoveryConnector } from "../lib/ingestion/discovery/types";
import { EMBEDDING_DIMENSIONS, type KnowledgeStore } from "../lib/ingestion/knowledge-pipeline";
import type { FallbackExtractor } from "../lib/ingestion/providers/fallback";
import { isSecEligibleAsset, runIngestion } from "../lib/ingestion/run";
import type { SecEdgarClient } from "../lib/ingestion/sec-edgar";

function fakeSupabase(existingSourceIds: string[] = [], failCleanup = false) {
  const runUpdates: unknown[] = [];
  const attempts: unknown[] = [];
  const failedItems: unknown[] = [];
  const from = vi.fn((table: string) => {
    if (table === "knowledge_ingestion_runs") return {
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "run-1" }, error: null })) })) })),
      update: vi.fn((value: unknown) => {
        runUpdates.push(value);
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
    };
    if (table === "ingestion_extraction_attempts") return {
      insert: vi.fn(async (value: unknown) => {
        attempts.push(value);
        return { error: null };
      }),
    };
    if (table === "ingestion_failed_items") return {
      upsert: vi.fn(async (value: unknown) => {
        failedItems.push(value);
        return { error: null };
      }),
      delete: vi.fn(() => {
        return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: failCleanup ? { message: "cleanup failed" } : null })) })) };
      }),
    };
    if (table === "knowledge_documents") {
      let sourceId = "";
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: string) => {
          if (column === "source_id") sourceId = value;
          return query;
        }),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({
          data: existingSourceIds.includes(sourceId) ? { id: "existing" } : null,
          error: null,
        })),
      };
      return query;
    }
    throw new Error(`Unexpected table ${table}`);
  });
  return { client: { from } as unknown as SupabaseClient, runUpdates, attempts, failedItems };
}

function candidate(sourceId: string, publishedAt: string) {
  return {
    source: "ynet" as const,
    sourceId,
    url: `https://www.ynet.co.il/${sourceId}`,
    canonicalUrl: `https://www.ynet.co.il/${sourceId}`,
    title: `Economy ${sourceId}`,
    summary: "Interest rate and TEST markets",
    publishedAt,
    language: "en",
    metadata: {},
  };
}

function knowledgeDependencies() {
  const store: KnowledgeStore = {
    prepare: vi.fn(async () => ({ id: crypto.randomUUID(), version: 1, unchanged: false, inProgress: false, ownerToken: "owner" })),
    commitChunks: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  };
  return {
    store,
    embeddings: {
      model: "test-model",
      create: vi.fn(async (inputs: string[]) => inputs.map(() => Array(EMBEDDING_DIMENSIONS).fill(0.1))),
    },
  };
}

describe("runIngestion", () => {
  it("excludes non-SEC asset classes while retaining public-company tickers", () => {
    expect(isSecEligibleAsset({ symbol: "AAPL", asset_class: "stock", exchange: "NASDAQ" })).toBe(true);
    expect(isSecEligibleAsset({ symbol: "BTC", asset_class: "crypto", exchange: null })).toBe(false);
    expect(isSecEligibleAsset({ symbol: "EURUSD", asset_class: "forex", exchange: null })).toBe(false);
    expect(isSecEligibleAsset({ symbol: "bad symbol", asset_class: "stock", exchange: "NYSE" })).toBe(false);
  });
  it("skips stored articles, isolates source failures and records attempts", async () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const database = fakeSupabase(["stored"]);
    const connectors: DiscoveryConnector[] = [
      { source: "ynet", discover: vi.fn(async () => [candidate("stored", now.toISOString()), candidate("fresh", now.toISOString())]) },
      { source: "globes", discover: vi.fn(async () => { throw new Error("feed unavailable"); }) },
    ];
    const extractor = {
      extract: vi.fn(async (request) => ({
        ok: true as const,
        article: {
          sourceUrl: request.url, canonicalUrl: request.url, title: "Full article", content: "A sufficiently complete body.",
          author: null, publishedAt: now.toISOString(), language: "en", extractedAt: now.toISOString(),
          provider: "decodo" as const, metadata: {},
        },
        attempts: [{ provider: "decodo" as const, attempt: 1, status: "succeeded" as const }],
      })),
    } as unknown as FallbackExtractor;
    const knowledge = knowledgeDependencies();

    const result = await runIngestion("daily", {
      companies: [], symbols: ["TEST"], topics: ["interest rate"],
    }, {
      supabase: database.client, connectors, extractor, knowledgeStore: knowledge.store,
      embeddings: knowledge.embeddings, now,
    });

    expect(result).toMatchObject({ newsCandidateCount: 2, newsSavedCount: 1, sourceFailures: 1, itemFailures: 0 });
    expect(extractor.extract).toHaveBeenCalledTimes(1);
    expect(database.attempts).toHaveLength(1);
    expect(knowledge.store.commitChunks).toHaveBeenCalledTimes(1);
    expect(database.runUpdates.at(-1)).toMatchObject({ status: "completed", news_saved_count: 1 });
  });

  it("uses a one-year SEC window for backfill and isolates a filing failure", async () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const database = fakeSupabase();
    const knowledge = knowledgeDependencies();
    const secClient = {
      listFilings: vi.fn(async () => [{ sourceId: "sec:1" }, { sourceId: "sec:2" }]),
      fetchFiling: vi.fn(async (filing: { sourceId: string }) => {
        if (filing.sourceId === "sec:2") throw new Error("bad filing");
        return {
          sourceSite: "sec_edgar", sourceKind: "financial_report" as const, sourceId: filing.sourceId,
          canonicalUrl: "https://www.sec.gov/filing", sourceUrl: "https://www.sec.gov/filing",
          title: "Filing", content: "Complete filing body", publishedAt: now.toISOString(),
          symbols: ["TEST"], topics: ["financial_reports"], metadata: {}, sourceMetadata: {},
        };
      }),
    } as unknown as SecEdgarClient;
    const result = await runIngestion("backfill", {
      companies: [{ symbol: "TEST", portfolio: true }], symbols: ["TEST"], topics: [],
    }, {
      supabase: database.client, connectors: [], extractor: {} as FallbackExtractor,
      knowledgeStore: knowledge.store, embeddings: knowledge.embeddings, secClient, now,
    });

    expect(result).toMatchObject({ filingSavedCount: 1, itemFailures: 1 });
    expect(secClient.listFilings).toHaveBeenCalledWith(expect.objectContaining({
      includeHistory: true,
      limit: 50,
      since: new Date("2025-09-16T12:00:00.000Z"),
    }));
  });

  it("persists a failed candidate when all providers are unavailable", async () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const database = fakeSupabase();
    const connector: DiscoveryConnector = {
      source: "ynet",
      discover: vi.fn(async () => [candidate("failed", now.toISOString())]),
    };
    const extractor = {
      extract: vi.fn(async () => ({
        ok: false as const,
        url: "https://www.ynet.co.il/failed",
        failureCode: "quota_exhausted" as const,
        attempts: [{
          provider: "decodo" as const, attempt: 1, status: "skipped" as const,
          failureCode: "quota_exhausted" as const, creditsReserved: 0,
        }],
      })),
    } as unknown as FallbackExtractor;
    const knowledge = knowledgeDependencies();
    const result = await runIngestion("daily", { companies: [], symbols: [], topics: [] }, {
      supabase: database.client, connectors: [connector], extractor,
      knowledgeStore: knowledge.store, embeddings: knowledge.embeddings, now,
    });

    expect(result).toMatchObject({ newsSavedCount: 0, itemFailures: 1 });
    expect(database.failedItems).toEqual([expect.objectContaining({
      source_id: "failed",
      failure_code: "quota_exhausted",
    })]);
    expect(database.attempts).toEqual([[expect.objectContaining({ credits_reserved: 0 })]]);
  });

  it("does not reclassify committed content when stale-failure cleanup fails", async () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const database = fakeSupabase([], true);
    const connector: DiscoveryConnector = {
      source: "ynet",
      discover: vi.fn(async () => [candidate("cleanup", now.toISOString())]),
    };
    const extractor = {
      extract: vi.fn(async (request) => ({
        ok: true as const,
        article: {
          sourceUrl: request.url, canonicalUrl: request.url, title: "Article", content: "Complete article body",
          author: null, publishedAt: now.toISOString(), language: "en", extractedAt: now.toISOString(),
          provider: "decodo" as const, metadata: {},
        },
        attempts: [{ provider: "decodo" as const, attempt: 1, status: "succeeded" as const, creditsReserved: 1 }],
      })),
    } as unknown as FallbackExtractor;
    const knowledge = knowledgeDependencies();
    const result = await runIngestion("daily", { companies: [], symbols: [], topics: [] }, {
      supabase: database.client, connectors: [connector], extractor,
      knowledgeStore: knowledge.store, embeddings: knowledge.embeddings, now,
    });

    expect(result).toMatchObject({ newsSavedCount: 1, itemFailures: 0, sourceFailures: 1 });
    expect(database.failedItems).toHaveLength(0);
  });
});
