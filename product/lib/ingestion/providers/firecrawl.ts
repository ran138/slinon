import { ProviderFailure, type ArticleProvider, type ExtractedArticle, type ExtractionRequest } from "./types";

const API_URL = "https://api.firecrawl.dev/v2/scrape";

type Fetcher = typeof fetch;

export interface FirecrawlProviderOptions {
  apiKey: string;
  fetcher?: Fetcher;
  requestTimeoutMs?: number;
  now?: () => Date;
}

interface FirecrawlMetadata {
  title?: unknown;
  author?: unknown;
  publishedTime?: unknown;
  language?: unknown;
  sourceURL?: unknown;
  statusCode?: unknown;
}

interface FirecrawlData {
  markdown?: unknown;
  html?: unknown;
  metadata?: FirecrawlMetadata;
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function failureForStatus(response: Response): ProviderFailure {
  const status = response.status;
  const message = `Firecrawl API failed with HTTP ${status}`;
  if (status === 401 || status === 403) return new ProviderFailure("authentication_error", message);
  if (status === 402) return new ProviderFailure("payment_required", message);
  if (status === 429) {
    return new ProviderFailure("rate_limited", message, { retryAfterMs: retryAfterMs(response) });
  }
  if (status === 408) return new ProviderFailure("network_error", message);
  if (status >= 500) return new ProviderFailure("server_error", message);
  return new ProviderFailure("invalid_response", message);
}

function failureForTargetStatus(status: number): ProviderFailure {
  const message = `Firecrawl target returned HTTP ${status}`;
  if (status === 408) return new ProviderFailure("network_error", message);
  if (status === 429) return new ProviderFailure("rate_limited", message);
  if (status >= 500) return new ProviderFailure("server_error", message);
  return new ProviderFailure("invalid_response", message);
}

function markdownTitle(content: string): string | null {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 300) || null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class FirecrawlArticleProvider implements ArticleProvider {
  readonly name = "firecrawl" as const;
  private readonly apiKey: string;
  private readonly fetcher: Fetcher;
  private readonly requestTimeoutMs: number;
  private readonly now: () => Date;

  constructor(options: FirecrawlProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("FIRECRAWL_API_KEY is required");
    this.apiKey = options.apiKey.trim();
    this.fetcher = options.fetcher ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 70_000;
    this.now = options.now ?? (() => new Date());
  }

  async extract(request: ExtractionRequest): Promise<ExtractedArticle> {
    let response: Response;
    try {
      response = await this.fetcher(API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: request.url,
          formats: ["markdown", "html"],
          onlyMainContent: true,
          timeout: 60_000,
        }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (cause) {
      throw new ProviderFailure("network_error", "Firecrawl request failed", { cause });
    }

    if (!response.ok) throw failureForStatus(response);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new ProviderFailure("invalid_response", "Firecrawl returned non-JSON data", { cause });
    }
    if (typeof payload !== "object" || payload === null || !("success" in payload) || payload.success !== true) {
      throw new ProviderFailure("invalid_response", "Firecrawl returned an unsuccessful response");
    }
    const data = "data" in payload && typeof payload.data === "object" && payload.data !== null
      ? payload.data as FirecrawlData
      : null;
    if (!data) throw new ProviderFailure("invalid_response", "Firecrawl returned no data object");

    const metadata = data.metadata ?? {};
    if (typeof metadata.statusCode === "number" && Number.isInteger(metadata.statusCode)
      && (metadata.statusCode < 200 || metadata.statusCode >= 300)) {
      throw failureForTargetStatus(metadata.statusCode);
    }
    const content = optionalString(data.markdown);
    if (!content) throw new ProviderFailure("empty_content", "Firecrawl returned no Markdown content");
    const title = optionalString(metadata.title) ?? markdownTitle(content);
    if (!title) throw new ProviderFailure("empty_content", "Firecrawl returned content without a title");
    const canonicalUrl = optionalString(metadata.sourceURL) ?? request.url;

    return {
      sourceUrl: request.url,
      canonicalUrl,
      title,
      content,
      author: optionalString(metadata.author),
      publishedAt: optionalString(metadata.publishedTime),
      language: optionalString(metadata.language),
      extractedAt: this.now().toISOString(),
      provider: "firecrawl",
      metadata: {
        targetStatus: typeof metadata.statusCode === "number" ? metadata.statusCode : null,
      },
    };
  }
}
