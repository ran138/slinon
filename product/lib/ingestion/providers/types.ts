export const PROVIDER_NAMES = ["decodo", "firecrawl", "scraperapi"] as const;

export type ProviderName = (typeof PROVIDER_NAMES)[number];

export interface ExtractionRequest {
  url: string;
  sourceSite: string;
  sourceId?: string;
}

export interface ExtractedArticle {
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  content: string;
  author: string | null;
  publishedAt: string | null;
  language: string | null;
  extractedAt: string;
  provider: ProviderName;
  metadata: Record<string, unknown>;
}

export interface ArticleProvider {
  readonly name: ProviderName;
  extract(request: ExtractionRequest): Promise<ExtractedArticle>;
}

export const PROVIDER_FAILURE_CODES = [
  "quota_exhausted",
  "payment_required",
  "rate_limited",
  "network_error",
  "server_error",
  "authentication_error",
  "empty_content",
  "invalid_response",
  "invalid_url",
  "unknown_error",
] as const;

export type ProviderFailureCode = (typeof PROVIDER_FAILURE_CODES)[number];

export class ProviderFailure extends Error {
  readonly code: ProviderFailureCode;
  readonly retryAfterMs: number | null;

  constructor(code: ProviderFailureCode, message: string, options: { retryAfterMs?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "ProviderFailure";
    this.code = code;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export interface ExtractionAttempt {
  provider: ProviderName;
  attempt: number;
  status: "succeeded" | "failed" | "skipped";
  failureCode?: ProviderFailureCode;
  message?: string;
  creditsReserved?: number;
}

export type ExtractionOutcome =
  | { ok: true; article: ExtractedArticle; attempts: ExtractionAttempt[] }
  | { ok: false; url: string; failureCode: ProviderFailureCode; attempts: ExtractionAttempt[] };
