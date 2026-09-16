import { ProviderFailure, type ArticleProvider, type ExtractedArticle, type ExtractionRequest } from "./types";

const API_URL = "https://api.scraperapi.com";

type Fetcher = typeof fetch;

export interface ScraperApiProviderOptions {
  apiKey: string;
  fetcher?: Fetcher;
  requestTimeoutMs?: number;
  now?: () => Date;
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function failureForResponse(response: Response, body: string): ProviderFailure {
  const status = response.status;
  const message = `ScraperAPI failed with HTTP ${status}`;
  if (status === 401) return new ProviderFailure("authentication_error", message);
  if (status === 403) {
    if (/quota|credit|limit\s+(?:has\s+been\s+)?(?:reached|exhausted)/i.test(body)) {
      return new ProviderFailure("quota_exhausted", message);
    }
    if (/max[_ -]?cost|payment|billing|upgrade/i.test(body)) {
      return new ProviderFailure("payment_required", message);
    }
    return new ProviderFailure("authentication_error", message);
  }
  if (status === 429) {
    return new ProviderFailure("rate_limited", message, { retryAfterMs: retryAfterMs(response) });
  }
  if (status === 408) return new ProviderFailure("network_error", message);
  if (status >= 500) return new ProviderFailure("server_error", message);
  return new ProviderFailure("invalid_response", message);
}

function markdownTitle(content: string): string | null {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 300);
  const firstLine = content.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return firstLine?.replace(/^#+\s*/, "").slice(0, 300) || null;
}

interface StructuredArticle {
  articleBody?: unknown;
  headline?: unknown;
  author?: unknown;
  datePublished?: unknown;
  inLanguage?: unknown;
  url?: unknown;
  mainEntityOfPage?: unknown;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&", apos: "'", gt: ">", hellip: "…", ldquo: "“", lsquo: "‘",
    lt: "<", nbsp: " ", quot: "\"", rdquo: "”", rsquo: "’",
  };
  return value.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      const validCodePoint = Number.isInteger(codePoint)
        && codePoint >= 0
        && codePoint <= 0x10ffff
        && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
      return validCodePoint ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function textFromHtml(html: string): string {
  const preferred = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    ?? html;
  return decodeEntities(preferred
    .replace(/<(script|style|noscript|svg|nav|footer|form|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|hr)\b[^>]*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|section|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function structuredArticle(html: string): StructuredArticle | null {
  const scripts = html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const visit = (value: unknown): StructuredArticle | null => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }
    if (typeof value !== "object" || value === null) return null;
    const object = value as Record<string, unknown>;
    const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
    if (types.some((type) => typeof type === "string"
      && /^(?:Article|NewsArticle|ReportageNewsArticle)$/i.test(type.trim()))) {
      return object as StructuredArticle;
    }
    return visit(object["@graph"]);
  };
  for (const match of scripts) {
    try {
      const found = visit(JSON.parse(match[1]));
      if (found) return found;
    } catch {
      // Ignore malformed page metadata and continue with visible HTML.
    }
  }
  return null;
}

function metaContent(html: string, key: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const name = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1];
    if (name?.toLowerCase() !== key.toLowerCase()) continue;
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (content?.trim()) return decodeEntities(content.trim());
  }
  return null;
}

function canonicalUrl(html: string, fallback: string): string {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/rel=["'][^"']*canonical/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1]?.trim();
    if (href) {
      try {
        const parsed = new URL(decodeEntities(href), fallback);
        return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : fallback;
      } catch { return fallback; }
    }
  }
  return fallback;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? decodeEntities(value.trim()) : null;
}

function structuredAuthor(value: unknown): string | null {
  if (typeof value === "string") return stringValue(value);
  if (Array.isArray(value)) return value.map(structuredAuthor).filter(Boolean).join(", ") || null;
  if (typeof value === "object" && value !== null) return stringValue((value as Record<string, unknown>).name);
  return null;
}

function structuredUrl(value: unknown): string | null {
  if (typeof value === "string") return stringValue(value);
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return stringValue(object["@id"]) ?? stringValue(object.url);
  }
  return null;
}

function safeStructuredUrl(value: unknown, fallback: string): string | null {
  const candidate = structuredUrl(value);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate, fallback);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export class ScraperApiArticleProvider implements ArticleProvider {
  readonly name = "scraperapi" as const;
  private readonly apiKey: string;
  private readonly fetcher: Fetcher;
  private readonly requestTimeoutMs: number;
  private readonly now: () => Date;

  constructor(options: ScraperApiProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("SCRAPERAPI_API_KEY is required");
    this.apiKey = options.apiKey.trim();
    this.fetcher = options.fetcher ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 80_000;
    this.now = options.now ?? (() => new Date());
  }

  async extract(request: ExtractionRequest): Promise<ExtractedArticle> {
    const url = new URL(API_URL);
    url.searchParams.set("url", request.url);
    url.searchParams.set("max_cost", "1");

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "x-sapi-api_key": this.apiKey,
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (cause) {
      throw new ProviderFailure("network_error", "ScraperAPI request failed", { cause });
    }

    let content: string;
    try {
      content = (await response.text()).trim();
    } catch (cause) {
      throw new ProviderFailure("invalid_response", "ScraperAPI response could not be read", { cause });
    }
    if (!response.ok) throw failureForResponse(response, content);
    if (!content) throw new ProviderFailure("empty_content", "ScraperAPI returned no HTML content");
    const structured = structuredArticle(content);
    const articleContent = stringValue(structured?.articleBody) ?? textFromHtml(content);
    if (!articleContent) throw new ProviderFailure("empty_content", "ScraperAPI returned no article content");
    const htmlTitle = content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const title = stringValue(structured?.headline)
      ?? metaContent(content, "og:title")
      ?? (htmlTitle ? textFromHtml(htmlTitle) : null)
      ?? markdownTitle(articleContent);
    if (!title) throw new ProviderFailure("empty_content", "ScraperAPI returned content without a title");

    const creditCostHeader = response.headers.get("sa-credit-cost");
    const creditCost = creditCostHeader === null ? null : Number(creditCostHeader);

    return {
      sourceUrl: request.url,
      canonicalUrl: safeStructuredUrl(structured?.url, request.url)
        ?? safeStructuredUrl(structured?.mainEntityOfPage, request.url)
        ?? canonicalUrl(content, request.url),
      title,
      content: articleContent,
      author: structuredAuthor(structured?.author) ?? metaContent(content, "author"),
      publishedAt: stringValue(structured?.datePublished) ?? metaContent(content, "article:published_time"),
      language: stringValue(structured?.inLanguage),
      extractedAt: this.now().toISOString(),
      provider: "scraperapi",
      metadata: {
        creditCost: creditCost !== null && Number.isFinite(creditCost) ? creditCost : null,
        extractionFormat: "html",
      },
    };
  }
}
