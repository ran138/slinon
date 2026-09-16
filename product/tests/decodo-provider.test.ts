import { describe, expect, it, vi } from "vitest";
import { DecodoArticleProvider } from "../lib/ingestion/providers/decodo";
import { ProviderFailure } from "../lib/ingestion/providers/types";

const request = { url: "https://example.com/article", sourceSite: "example" };

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function provider(fetcher: typeof fetch, apiToken = "token") {
  return new DecodoArticleProvider({
    apiToken,
    fetcher,
    now: () => new Date("2026-09-16T12:00:00.000Z"),
  });
}

describe("DecodoArticleProvider", () => {
  it("requests standard Markdown and normalizes the result", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      results: [{
        content: "# Market update\n\nThe complete article body.",
        status_code: 200,
        task_id: "task-1",
      }],
    }));
    const result = await provider(fetcher).extract(request);

    expect(result).toMatchObject({
      provider: "decodo",
      title: "Market update",
      content: "# Market update\n\nThe complete article body.",
      extractedAt: "2026-09-16T12:00:00.000Z",
      metadata: { taskId: "task-1", targetStatus: 200 },
    });
    const [, init] = fetcher.mock.calls[0];
    expect(fetcher.mock.calls[0][0]).toBe("https://scraper-api.decodo.com/v2/scrape");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Basic token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      url: request.url,
      proxy_pool: "standard",
      markdown: true,
    });
  });

  it("does not duplicate a Basic prefix copied from the playground", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      results: [{ content: "# Title\n\nBody", status_code: 200 }],
    }));
    await provider(fetcher, "Basic copied-token").extract(request);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Basic copied-token" });
  });

  it.each([
    [401, "authentication_error"],
    [402, "payment_required"],
    [429, "rate_limited"],
    [503, "server_error"],
    [400, "invalid_response"],
  ] as const)("maps API HTTP %s to %s", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("error", { status }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({ code } satisfies Partial<ProviderFailure>);
  });

  it("maps a target error returned inside HTTP 200", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      results: [{ content: "", status_code: 503 }],
    }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({
      code: "server_error",
    } satisfies Partial<ProviderFailure>);
  });

  it("rejects an empty Markdown result", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ results: [{ content: "", status_code: 200 }] }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({
      code: "empty_content",
    } satisfies Partial<ProviderFailure>);
  });

  it("rejects malformed JSON and missing results", async () => {
    const malformed = vi.fn<typeof fetch>(async () => new Response("not-json", { status: 200 }));
    await expect(provider(malformed).extract(request)).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<ProviderFailure>);

    const missingResults = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    await expect(provider(missingResults).extract(request)).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<ProviderFailure>);
  });

  it.each([undefined, "200", 200.5])("rejects invalid target status_code: %s", async (statusCode) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      results: [{ content: "# Title\n\nBody", status_code: statusCode }],
    }));
    await expect(provider(fetcher).extract(request)).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<ProviderFailure>);
  });

  it("maps fetch timeouts and network failures without exposing the token", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const error = await provider(fetcher, "private-token").extract(request).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "network_error", message: "Decodo request failed" });
    expect(String(error)).not.toContain("private-token");
  });
});
