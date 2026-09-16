import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createDiscoveryConnectors, discoverAllSources } from "../lib/ingestion/discovery/connectors";
import type { DiscoveryConnector } from "../lib/ingestion/discovery/types";
import { parseDiscoveryXml } from "../lib/ingestion/discovery/xml";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/discovery/${name}`, import.meta.url)), "utf8");
}

describe("discovery XML", () => {
  it("normalizes RSS items and rejects foreign hosts", () => {
    const items = parseDiscoveryXml(fixture("rss.xml"), {
      source: "ynet",
      allowedHosts: ["ynet.co.il"],
      feedUrl: "https://www.ynet.co.il/feed.xml",
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      source: "ynet",
      canonicalUrl: "https://www.ynet.co.il/economy/article/abc",
      title: "חדשות כלכליות חשובות",
      summary: "תקציר הכתבה",
      publishedAt: "2026-09-15T10:00:00.000Z",
      language: "he",
    });
  });

  it("parses Google News sitemaps", () => {
    const items = parseDiscoveryXml(fixture("news-sitemap.xml"), {
      source: "cnbc",
      allowedHosts: ["cnbc.com"],
      feedUrl: "https://www.cnbc.com/sitemap_news.xml",
    });
    expect(items[0]).toMatchObject({
      title: "Markets move after policy decision",
      language: "en",
      publishedAt: "2026-09-15T11:30:00.000Z",
    });
  });
});

describe("source connectors", () => {
  it("declares all seven independent sources", () => {
    expect(createDiscoveryConnectors().map((connector) => connector.source)).toEqual([
      "calcalist", "ynet", "globes", "themarker", "reuters", "cnbc", "yahoo_finance",
    ]);
  });

  it("keeps other sources when one source fails", async () => {
    const good: DiscoveryConnector = {
      source: "ynet",
      discover: vi.fn().mockResolvedValue([{
        source: "ynet",
        sourceId: "ynet:1",
        url: "https://www.ynet.co.il/economy/1",
        canonicalUrl: "https://www.ynet.co.il/economy/1",
        title: "Economic story",
        summary: null,
        publishedAt: "2026-09-15T10:00:00.000Z",
        language: "he",
        metadata: {},
      }]),
    };
    const bad: DiscoveryConnector = {
      source: "reuters",
      discover: vi.fn().mockRejectedValue(new Error("blocked")),
    };
    const result = await discoverAllSources([good, bad], { since: new Date("2026-09-10") });
    expect(result.candidates).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].source).toBe("reuters");
  });

  it("keeps Calcalist disabled until an authorized structured feed is configured", async () => {
    const connector = createDiscoveryConnectors()[0];
    await expect(connector.discover({
      since: new Date("2026-09-10"),
      now: new Date("2026-09-16"),
    })).rejects.toThrow(/no authorized structured discovery feed/i);
  });

  it("blocks redirects to unapproved hosts", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/internal" },
    }));
    const ynet = createDiscoveryConnectors({ fetcher })[1];
    await expect(ynet.discover({
      since: new Date("2026-09-10"),
      now: new Date("2026-09-16"),
    })).rejects.toThrow(/all ynet discovery endpoints failed/i);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects undated candidates from bounded discovery", async () => {
    const xml = `<rss><channel><item><title>Undated story</title><link>https://www.ynet.co.il/economy/a</link></item></channel></rss>`;
    const fetcher = vi.fn().mockResolvedValue(new Response(xml));
    const ynet = createDiscoveryConnectors({ fetcher })[1];
    await expect(ynet.discover({
      since: new Date("2026-09-10"),
      now: new Date("2026-09-16"),
    })).resolves.toEqual([]);
  });
});
