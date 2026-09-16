import { ProviderFailure, type ArticleProvider, type ExtractedArticle, type ExtractionRequest } from "./types";

const API_URL = "https://scraper-api.decodo.com/v2/scrape";

type Fetcher = typeof fetch;

export interface DecodoProviderOptions {
  apiToken: string;
  fetcher?: Fetcher;
  requestTimeoutMs?: number;
  now?: () => Date;
}

interface DecodoResult {
  content?: unknown;
  headers?: unknown;
  status_code?: unknown;
  task_id?: unknown;
}

function authorizationValue(token: string): string {
  const trimmed = token.trim();
  return /^Basic\s+/i.test(trimmed) ? trimmed : `Basic ${trimmed}`;
}

function failureForStatus(status: number, message: string): ProviderFailure {
  if (status === 401 || status === 403) return new ProviderFailure("authentication_error", message);
  if (status === 402) return new ProviderFailure("payment_required", message);
  if (status === 429) return new ProviderFailure("rate_limited", message);
  if (status >= 500) return new ProviderFailure("server_error", message);
  return new ProviderFailure("invalid_response", message);
}

function markdownTitle(content: string): string | null {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading;
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine?.replace(/^#+\s*/, "").slice(0, 300) || null;
}

export class DecodoArticleProvider implements ArticleProvider {
  readonly name = "decodo" as const;
  private readonly token: string;
  private readonly fetcher: Fetcher;
  private readonly requestTimeoutMs: number;
  private readonly now: () => Date;

  constructor(options: DecodoProviderOptions) {
    if (!options.apiToken.trim()) throw new Error("DECODO_API_KEY is required");
    this.token = authorizationValue(options.apiToken);
    this.fetcher = options.fetcher ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 150_000;
    this.now = options.now ?? (() => new Date());
  }

  async extract(request: ExtractionRequest): Promise<ExtractedArticle> {
    let response: Response;
    try {
      response = await this.fetcher(API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: this.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: request.url,
          proxy_pool: "standard",
          markdown: true,
        }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (cause) {
      throw new ProviderFailure("network_error", "Decodo request failed", { cause });
    }

    if (!response.ok) throw failureForStatus(response.status, `Decodo API failed with HTTP ${response.status}`);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new ProviderFailure("invalid_response", "Decodo returned non-JSON data", { cause });
    }
    if (typeof payload !== "object" || payload === null || !("results" in payload) || !Array.isArray(payload.results)) {
      throw new ProviderFailure("invalid_response", "Decodo returned no results array");
    }
    const result = payload.results[0] as DecodoResult | undefined;
    if (!result) throw new ProviderFailure("empty_content", "Decodo returned no result");

    if (typeof result.status_code !== "number" || !Number.isInteger(result.status_code)) {
      throw new ProviderFailure("invalid_response", "Decodo result is missing a valid status_code");
    }
    const targetStatus = result.status_code;
    if (targetStatus < 200 || targetStatus >= 300) {
      throw failureForStatus(targetStatus, `Decodo target returned HTTP ${targetStatus}`);
    }
    const content = typeof result.content === "string" ? result.content.trim() : "";
    if (!content) throw new ProviderFailure("empty_content", "Decodo returned no Markdown content");
    const title = markdownTitle(content);
    if (!title) throw new ProviderFailure("empty_content", "Decodo returned content without a title");

    return {
      sourceUrl: request.url,
      canonicalUrl: request.url,
      title,
      content,
      author: null,
      publishedAt: null,
      language: null,
      extractedAt: this.now().toISOString(),
      provider: "decodo",
      metadata: {
        taskId: typeof result.task_id === "string" ? result.task_id : null,
        targetStatus,
      },
    };
  }
}
