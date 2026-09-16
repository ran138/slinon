import { describe, expect, it } from "vitest";
import { FirecrawlArticleProvider } from "../lib/ingestion/providers/firecrawl";
import { ScraperApiArticleProvider } from "../lib/ingestion/providers/scraperapi";

const runLive = process.env.RUN_LIVE_PROVIDER_TESTS === "1";
const liveIt = runLive ? it : it.skip;
// This stable public fixture costs one ScraperAPI credit; example.com is classified as protected and costs ten.
const target = { url: "https://httpbin.org/html", sourceSite: "httpbin" };

describe("live article providers", () => {
  liveIt("validates the Firecrawl credential with one scrape", async () => {
    const provider = new FirecrawlArticleProvider({
      apiKey: process.env.FIRECRAWL_API_KEY ?? "",
    });
    const article = await provider.extract(target);
    expect(article.provider).toBe("firecrawl");
    expect(article.title.length).toBeGreaterThan(0);
    expect(article.content.length).toBeGreaterThan(0);
  }, 90_000);

  liveIt("validates the ScraperAPI credential with a one-credit scrape", async () => {
    const provider = new ScraperApiArticleProvider({
      apiKey: process.env.SCRAPERAPI_API_KEY ?? "",
    });
    const article = await provider.extract(target);
    expect(article.provider).toBe("scraperapi");
    expect(article.title.length).toBeGreaterThan(0);
    expect(article.content.length).toBeGreaterThan(0);
  }, 100_000);
});
