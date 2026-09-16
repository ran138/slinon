import { describe, expect, it, vi } from "vitest";
import { ScraperApiArticleProvider } from "../lib/ingestion/providers/scraperapi";
import { ProviderFailure } from "../lib/ingestion/providers/types";

const request = { url: "https://example.com/article?topic=markets", sourceSite: "example" };

function provider(fetcher: typeof fetch, apiKey = "scraperapi-key") {
  return new ScraperApiArticleProvider({
    apiKey,
    fetcher,
    now: () => new Date("2026-09-16T12:00:00.000Z"),
  });
}

describe("ScraperApiArticleProvider", () => {
  it("requests one-credit HTML and normalizes structured article data", async () => {
    const html = `<!doctype html><html><head>
      <title>Fallback title</title><link rel="canonical" href="https://example.com/canonical">
      <script type="application/ld+json">{
        "@type":"NewsArticle","headline":"Market update","articleBody":"Full article body.",
        "author":{"name":"Reporter"},"datePublished":"2026-09-16T08:00:00Z","inLanguage":"en",
        "url":"https://example.com/structured"
      }</script></head><body><article><h1>Market update</h1><p>Full article body.</p></article></body></html>`;
    const fetcher = vi.fn<typeof fetch>(async () => new Response(html, {
      status: 200,
      headers: { "sa-credit-cost": "1" },
    }));
    const result = await provider(fetcher).extract(request);

    expect(result).toMatchObject({
      provider: "scraperapi",
      sourceUrl: request.url,
      canonicalUrl: "https://example.com/structured",
      title: "Market update",
      content: "Full article body.",
      author: "Reporter",
      publishedAt: "2026-09-16T08:00:00Z",
      language: "en",
      extractedAt: "2026-09-16T12:00:00.000Z",
      metadata: { creditCost: 1, extractionFormat: "html" },
    });
    const [calledUrl, init] = fetcher.mock.calls[0];
    const parsed = new URL(String(calledUrl));
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://api.scraperapi.com/");
    expect(parsed.searchParams.get("url")).toBe(request.url);
    expect(parsed.searchParams.has("output_format")).toBe(false);
    expect(parsed.searchParams.get("max_cost")).toBe("1");
    expect(init?.headers).toMatchObject({ "x-sapi-api_key": "scraperapi-key" });
  });

  it("falls back to visible article HTML and metadata", async () => {
    const html = `<html><head><meta property="og:title" content="Market &amp; Economy">
      <meta name="author" content="Desk"><link href="/canonical" rel="canonical"></head>
      <body><nav>Menu</nav><article><h1>Ignored heading</h1><p>First paragraph.</p><p>Second paragraph.</p></article></body></html>`;
    const fetcher = vi.fn<typeof fetch>(async () => new Response(html, { status: 200 }));
    await expect(provider(fetcher).extract(request)).resolves.toMatchObject({
      title: "Market & Economy",
      author: "Desk",
      canonicalUrl: "https://example.com/canonical",
      content: "Ignored heading\nFirst paragraph.\nSecond paragraph.",
    });
  });

  it("resolves relative structured URLs and rejects unsafe canonical schemes", async () => {
    const relative = `<html><head><script type="application/ld+json">{
      "@type":"NewsArticle","headline":"Market update","articleBody":"Body","url":"/relative"
    }</script></head></html>`;
    const unsafe = `<html><head><script type="application/ld+json">{
      "@type":"NewsArticle","headline":"Market update","articleBody":"Body","url":"javascript:alert(1)"
    }</script><link rel="canonical" href="data:text/html,unsafe"></head></html>`;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(relative, { status: 200 }))
      .mockResolvedValueOnce(new Response(unsafe, { status: 200 }));

    await expect(provider(fetcher).extract(request)).resolves.toMatchObject({
      canonicalUrl: "https://example.com/relative",
    });
    await expect(provider(fetcher).extract(request)).resolves.toMatchObject({
      canonicalUrl: request.url,
    });
  });

  it("does not throw for invalid numeric HTML entities", async () => {
    const html = `<html><head><title>Market update</title></head>
      <body><article><p>Body &#999999999; remains readable.</p></article></body></html>`;
    const fetcher = vi.fn<typeof fetch>(async () => new Response(html, { status: 200 }));

    await expect(provider(fetcher).extract(request)).resolves.toMatchObject({
      content: "Body &#999999999; remains readable.",
    });
  });

  it("does not mistake unrelated JSON-LD types for articles", async () => {
    const html = `<html><head><script type="application/ld+json">{"@graph":[
      {"@type":"NonArticle","headline":"Wrong","articleBody":"Wrong body"},
      {"@type":"NewsArticle","headline":"Correct","articleBody":"Correct body"}
    ]}</script></head></html>`;
    const fetcher = vi.fn<typeof fetch>(async () => new Response(html, { status: 200 }));

    await expect(provider(fetcher).extract(request)).resolves.toMatchObject({
      title: "Correct",
      content: "Correct body",
    });
  });

  it.each([
    [400, "invalid_response", "bad request"],
    [401, "authentication_error", "bad key"],
    [403, "quota_exhausted", "Your API credit limit has been reached"],
    [403, "payment_required", "Request exceeds max_cost"],
    [403, "authentication_error", "forbidden"],
    [404, "invalid_response", "not found"],
    [408, "network_error", "timeout"],
    [503, "server_error", "unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, code, body) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(body, { status }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({ code } satisfies Partial<ProviderFailure>);
  });

  it("preserves Retry-After for rate limiting", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("slow", {
      status: 429,
      headers: { "retry-after": "4" },
    }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterMs: 4_000,
    } satisfies Partial<ProviderFailure>);
  });

  it("rejects an empty response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("", { status: 200 }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({ code: "empty_content" });
  });

  it("maps fetch failures without exposing the key", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error("offline"); });
    const error = await provider(fetcher, "private-key").extract(request).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "network_error", message: "ScraperAPI request failed" });
    expect(String(error)).not.toContain("private-key");
  });
});
