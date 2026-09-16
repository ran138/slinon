import type {
  ArticleProvider,
  ExtractedArticle,
  ExtractionAttempt,
  ExtractionOutcome,
  ExtractionRequest,
  ProviderFailureCode,
  ProviderName,
} from "./types";
import { ProviderFailure } from "./types";
import type { ProviderQuotaStore } from "./quota";

const TEMPORARY_FAILURES = new Set<ProviderFailureCode>([
  "rate_limited",
  "network_error",
  "server_error",
]);
const DISABLING_FAILURES = new Set<ProviderFailureCode>([
  "quota_exhausted",
  "payment_required",
  "authentication_error",
]);

export interface FallbackExtractorOptions {
  maxTemporaryRetries?: number;
  defaultRetryDelayMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
  quotaStore?: ProviderQuotaStore;
}

function defaultWait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeFailure(error: unknown): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  return new ProviderFailure("unknown_error", error instanceof Error ? error.message : "Unknown provider failure", {
    cause: error,
  });
}

function validateRequest(request: ExtractionRequest): ProviderFailure | null {
  try {
    const url = new URL(request.url);
    if (url.protocol !== "https:" || url.username || url.password) {
      return new ProviderFailure("invalid_url", "Article URL must be an HTTPS URL without credentials");
    }
    return null;
  } catch {
    return new ProviderFailure("invalid_url", "Article URL is invalid");
  }
}

function validateArticle(article: ExtractedArticle, provider: ProviderName): ProviderFailure | null {
  if (article.provider !== provider || !article.title.trim() || !article.content.trim()) {
    return new ProviderFailure("empty_content", "Provider returned an empty or mismatched article");
  }
  try {
    new URL(article.canonicalUrl);
    new URL(article.sourceUrl);
  } catch {
    return new ProviderFailure("invalid_response", "Provider returned invalid article URLs");
  }
  return null;
}

export class FallbackExtractor {
  private readonly providers: readonly ArticleProvider[];
  private readonly unavailableProviders = new Map<ProviderName, ProviderFailureCode>();
  private readonly maxTemporaryRetries: number;
  private readonly defaultRetryDelayMs: number;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly quotaStore: ProviderQuotaStore | null;

  constructor(providers: readonly ArticleProvider[], options: FallbackExtractorOptions = {}) {
    this.providers = providers;
    this.maxTemporaryRetries = options.maxTemporaryRetries ?? 2;
    this.defaultRetryDelayMs = options.defaultRetryDelayMs ?? 500;
    this.wait = options.wait ?? defaultWait;
    this.quotaStore = options.quotaStore ?? null;
  }

  async extract(request: ExtractionRequest): Promise<ExtractionOutcome> {
    const attempts: ExtractionAttempt[] = [];
    const invalidRequest = validateRequest(request);
    if (invalidRequest) {
      return { ok: false, url: request.url, failureCode: invalidRequest.code, attempts };
    }

    let lastFailure: ProviderFailureCode = "unknown_error";
    for (const provider of this.providers) {
      const unavailableReason = this.unavailableProviders.get(provider.name);
      if (unavailableReason) {
        attempts.push({ provider: provider.name, attempt: 0, status: "skipped", failureCode: unavailableReason });
        lastFailure = unavailableReason;
        continue;
      }

      for (let attempt = 1; attempt <= this.maxTemporaryRetries + 1; attempt += 1) {
        let creditsReserved = this.quotaStore ? 0 : 1;
        if (this.quotaStore) {
          try {
            const reservation = await this.quotaStore.reserve(provider.name);
            if (!reservation.reserved) {
              this.unavailableProviders.set(provider.name, "quota_exhausted");
              attempts.push({
                provider: provider.name,
                attempt,
                status: "skipped",
                failureCode: "quota_exhausted",
                message: `Monthly quota ${reservation.usedCredits}/${reservation.monthlyLimit}`,
              });
              lastFailure = "quota_exhausted";
              break;
            }
            creditsReserved = 1;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Quota reservation failed";
            attempts.push({
              provider: provider.name,
              attempt,
              status: "failed",
              failureCode: "unknown_error",
              message,
              creditsReserved: 0,
            });
            lastFailure = "unknown_error";
            break;
          }
        }

        try {
          const article = await provider.extract(request);
          const validationFailure = validateArticle(article, provider.name);
          if (validationFailure) throw validationFailure;
          attempts.push({ provider: provider.name, attempt, status: "succeeded", creditsReserved });
          return { ok: true, article, attempts };
        } catch (error) {
          const failure = normalizeFailure(error);
          lastFailure = failure.code;
          attempts.push({
            provider: provider.name,
            attempt,
            status: "failed",
            failureCode: failure.code,
            message: failure.message,
            creditsReserved,
          });

          if (DISABLING_FAILURES.has(failure.code)) {
            this.unavailableProviders.set(provider.name, failure.code);
            if (this.quotaStore) {
              try {
                await this.quotaStore.recordFailure(provider.name, failure.code);
              } catch {
                // The extraction result remains isolated even if persistence is temporarily unavailable.
              }
            }
            break;
          }
          if (!TEMPORARY_FAILURES.has(failure.code) || attempt > this.maxTemporaryRetries) break;
          await this.wait(failure.retryAfterMs ?? this.defaultRetryDelayMs * attempt);
        }
      }
    }

    return { ok: false, url: request.url, failureCode: lastFailure, attempts };
  }

  async extractMany(requests: readonly ExtractionRequest[]): Promise<ExtractionOutcome[]> {
    const outcomes: ExtractionOutcome[] = [];
    for (const request of requests) outcomes.push(await this.extract(request));
    return outcomes;
  }
}
