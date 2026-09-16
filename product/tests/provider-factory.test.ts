import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createConfiguredArticleExtractor } from "../lib/ingestion/providers/factory";

function supabaseWithConfig(rows: unknown[]) {
  const order = vi.fn(async () => ({ data: rows, error: null }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn();
  return { client: { from, rpc } as unknown as SupabaseClient, from, select, eq, order };
}

describe("createConfiguredArticleExtractor", () => {
  it("builds Decodo when it is enabled", async () => {
    const supabase = supabaseWithConfig([
      { provider: "decodo", priority: 1, enabled: true },
    ]);
    const configured = await createConfiguredArticleExtractor(supabase.client, {
      environment: {
        DECODO_API_KEY: "decodo-token",
      },
    });

    expect(configured.providerNames).toEqual(["decodo"]);
    expect(supabase.from).toHaveBeenCalledWith("ingestion_provider_config");
    expect(supabase.eq).toHaveBeenCalledWith("enabled", true);
    expect(supabase.order).toHaveBeenCalledWith("priority", { ascending: true });
  });

  it("fails closed when the active provider credentials are missing", async () => {
    const supabase = supabaseWithConfig([
      { provider: "decodo", priority: 1, enabled: true },
    ]);
    await expect(createConfiguredArticleExtractor(supabase.client, { environment: {} }))
      .rejects.toThrow(/DECODO_API_KEY/);
  });

  it("builds Decodo when earlier providers are disabled", async () => {
    const supabase = supabaseWithConfig([
      { provider: "decodo", priority: 1, enabled: true },
    ]);
    const configured = await createConfiguredArticleExtractor(supabase.client, {
      environment: { DECODO_API_KEY: "token" },
    });
    expect(configured.providerNames).toEqual(["decodo"]);
  });

  it("builds all implemented providers in database priority order", async () => {
    const supabase = supabaseWithConfig([
      { provider: "decodo", priority: 1, enabled: true },
      { provider: "firecrawl", priority: 2, enabled: true },
      { provider: "scraperapi", priority: 3, enabled: true },
    ]);
    const configured = await createConfiguredArticleExtractor(supabase.client, {
      environment: {
        DECODO_API_KEY: "decodo-token",
        FIRECRAWL_API_KEY: "firecrawl-token",
        SCRAPERAPI_API_KEY: "scraperapi-token",
      },
    });

    expect(configured.providerNames).toEqual(["decodo", "firecrawl", "scraperapi"]);
  });

  it.each([
    ["firecrawl", "FIRECRAWL_API_KEY"],
    ["scraperapi", "SCRAPERAPI_API_KEY"],
  ] as const)("fails closed when %s is enabled without %s", async (provider, variable) => {
    const supabase = supabaseWithConfig([{ provider, priority: 1, enabled: true }]);
    await expect(createConfiguredArticleExtractor(supabase.client, { environment: {} }))
      .rejects.toThrow(variable);
  });
});
