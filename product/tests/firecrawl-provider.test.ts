import { describe, expect, it, vi } from "vitest";
import { FirecrawlArticleProvider } from "../lib/ingestion/providers/firecrawl";
import { ProviderFailure } from "../lib/ingestion/providers/types";

const request = { url: "https://example.com/article", sourceSite: "example" };

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function provider(fetcher: typeof fetch, apiKey = "firecrawl-key") {
  return new FirecrawlArticleProvider({
    apiKey,
    fetcher,
    now: () => new Date("2026-09-16T12:00:00.000Z"),
  });
}

describe("FirecrawlArticleProvider", () => {
  it("requests main article Markdown and normalizes metadata", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      success: true,
      data: {
        markdown: "# Market update\n\nThe complete article body.",
        html: "<h1>Market update</h1>",
        metadata: {
          title: "Market update",
          author: "Reporter",
          publishedTime: "2026-09-16T08:00:00Z",
          language: "en",
          sourceURL: "https://example.com/canonical",
          statusCode: 200,
        },
      },
    }));
    const result = await provider(fetcher).extract(request);

    expect(result).toMatchObject({
      provider: "firecrawl",
      canonicalUrl: "https://example.com/canonical",
      title: "Market update",
      author: "Reporter",
      publishedAt: "2026-09-16T08:00:00Z",
      language: "en",
      extractedAt: "2026-09-16T12:00:00.000Z",
      metadata: { targetStatus: 200 },
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer firecrawl-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      url: request.url,
      formats: ["markdown", "html"],
      onlyMainContent: true,
      timeout: 60_000,
    });
  });

  it("uses the Markdown heading when title metadata is absent", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      success: true,
      data: { markdown: "# Fallback title\n\nBody", metadata: {} },
    }));
    await expect(provider(fetcher).extract(request)).resolves.toMatchObject({ title: "Fallback title" });
  });

  it.each([
    [401, "authentication_error"],
    [403, "authentication_error"],
    [402, "payment_required"],
    [408, "network_error"],
    [503, "server_error"],
    [400, "invalid_response"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("error", { status }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({ code } satisfies Partial<ProviderFailure>);
  });

  it("preserves Retry-After for rate limiting", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("slow", {
      status: 429,
      headers: { "retry-after": "3" },
    }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterMs: 3_000,
    } satisfies Partial<ProviderFailure>);
  });

  it.each([
    [401, "invalid_response"],
    [402, "invalid_response"],
    [403, "invalid_response"],
    [404, "invalid_response"],
    [429, "rate_limited"],
    [500, "server_error"],
  ] as const)("rejects target HTTP %s as %s", async (statusCode, code) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      success: true,
      data: {
        markdown: "# Error page\n\nThis is not an article.",
        metadata: { statusCode },
      },
    }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({ code } satisfies Partial<ProviderFailure>);
  });

  it("prioritizes a retryable target status over empty content", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      success: true,
      data: { markdown: "", metadata: { statusCode: 500 } },
    }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({ code: "server_error" });
  });

  it.each([
    { success: false },
    { success: true },
    { success: true, data: { markdown: "" } },
  ])("rejects unsuccessful or empty responses", async (payload) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(payload));
    await expect(provider(fetcher).extract(request)).rejects.toBeInstanceOf(ProviderFailure);
  });

  it("maps malformed JSON and fetch failures without exposing the key", async () => {
    const malformed = vi.fn<typeof fetch>(async () => new Response("not-json", { status: 200 }));
    await expect(provider(malformed).extract(request)).rejects.toMatchObject({ code: "invalid_response" });

    const failed = vi.fn<typeof fetch>(async () => { throw new Error("offline"); });
    const error = await provider(failed, "private-key").extract(request).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "network_error", message: "Firecrawl request failed" });
    expect(String(error)).not.toContain("private-key");
  });
});
