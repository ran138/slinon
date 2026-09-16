import { parseDiscoveryXml } from "./xml";
import {
  DiscoverySourceError,
  type ArticleCandidate,
  type DiscoveryConnector,
  type DiscoveryRequest,
  type NewsSource,
} from "./types";

type Fetcher = typeof fetch;

interface ConnectorDefinition {
  source: NewsSource;
  language: string;
  allowedHosts: string[];
  endpointUrls: (now: Date) => string[];
  endpointAllowedHosts?: string[];
  unsupportedReason?: string;
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const DEFINITIONS: ConnectorDefinition[] = [
  {
    source: "calcalist",
    language: "he",
    allowedHosts: ["calcalist.co.il"],
    endpointUrls: () => [],
    unsupportedReason: "Calcalist has no authorized structured discovery feed configured",
  },
  {
    source: "ynet",
    language: "he",
    allowedHosts: ["ynet.co.il"],
    endpointUrls: () => [
      "https://www.ynet.co.il/Integration/StoryRss2.xml",
      "https://www.ynet.co.il/Integration/StoryRss1854.xml",
    ],
  },
  {
    source: "globes",
    language: "he",
    allowedHosts: ["globes.co.il"],
    endpointUrls: () => [
      "https://www.globes.co.il/WebService/Rss/RssFeeder.asmx/FeederNode?iID=585",
      "https://www.globes.co.il/WebService/Rss/RssFeeder.asmx/FeederNode?iID=9917",
    ],
  },
  {
    source: "themarker",
    language: "he",
    allowedHosts: ["themarker.com"],
    endpointUrls: () => [
      "https://www.themarker.com/srv/tm-all-articles",
      "https://www.themarker.com/news-sitemap-latest.xml",
    ],
  },
  {
    source: "reuters",
    language: "en",
    allowedHosts: ["reuters.com"],
    endpointUrls: () => [],
    unsupportedReason: "Reuters requires an authorized API or licensed feed",
  },
  {
    source: "cnbc",
    language: "en",
    allowedHosts: ["cnbc.com"],
    endpointAllowedHosts: ["search.cnbc.com", "www.cnbc.com"],
    endpointUrls: () => [
      "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
      "https://www.cnbc.com/sitemap_news.xml",
    ],
  },
  {
    source: "yahoo_finance",
    language: "en",
    allowedHosts: ["finance.yahoo.com", "yahoo.com"],
    endpointAllowedHosts: ["finance.yahoo.com", "feeds.finance.yahoo.com"],
    endpointUrls: () => [
      "https://finance.yahoo.com/rss/topstories",
      "https://finance.yahoo.com/news-sitemap.xml",
    ],
  },
];

function withinWindow(candidate: ArticleCandidate, since: Date, now: Date): boolean {
  if (!candidate.publishedAt) return false;
  const time = Date.parse(candidate.publishedAt);
  return Number.isFinite(time) && time >= since.getTime() && time <= now.getTime();
}

function allowedEndpoint(url: URL, hosts: readonly string[]): boolean {
  return url.protocol === "https:" && hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

async function boundedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("Discovery response is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Discovery response is too large");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function richerCandidate(left: ArticleCandidate, right: ArticleCandidate): ArticleCandidate {
  const leftScore = (left.summary?.length ?? 0) + (left.publishedAt ? 1000 : 0) + left.title.length;
  const rightScore = (right.summary?.length ?? 0) + (right.publishedAt ? 1000 : 0) + right.title.length;
  const primary = rightScore > leftScore ? right : left;
  const secondary = primary === left ? right : left;
  return {
    ...primary,
    summary: primary.summary ?? secondary.summary,
    publishedAt: primary.publishedAt ?? secondary.publishedAt,
    language: primary.language ?? secondary.language,
    metadata: { ...secondary.metadata, ...primary.metadata },
  };
}

function mergeCandidates(candidates: readonly ArticleCandidate[]): ArticleCandidate[] {
  const merged = new Map<string, ArticleCandidate>();
  for (const item of candidates) {
    const existing = merged.get(item.canonicalUrl);
    merged.set(item.canonicalUrl, existing ? richerCandidate(existing, item) : item);
  }
  return [...merged.values()];
}

class SourceConnector implements DiscoveryConnector {
  readonly source: NewsSource;
  private readonly definition: ConnectorDefinition;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;

  constructor(definition: ConnectorDefinition, fetcher: Fetcher, timeoutMs: number) {
    this.source = definition.source;
    this.definition = definition;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }

  async discover(request: DiscoveryRequest): Promise<ArticleCandidate[]> {
    const now = request.now ?? new Date();
    const limit = Math.max(1, request.limit ?? 500);
    if (this.definition.unsupportedReason) {
      throw new DiscoverySourceError(this.source, this.definition.unsupportedReason);
    }
    const endpoints = this.definition.endpointUrls(now);
    const endpointHosts = this.definition.endpointAllowedHosts
      ?? endpoints.map((endpoint) => new URL(endpoint).hostname);
    const errors: unknown[] = [];
    const collected: ArticleCandidate[] = [];

    for (const endpoint of endpoints) {
      try {
        let currentUrl = new URL(endpoint);
        let response: Response | null = null;
        for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
          if (!allowedEndpoint(currentUrl, endpointHosts)) throw new Error("Discovery redirect target is not allowed");
          response = await this.fetcher(currentUrl, {
            headers: {
              Accept: "application/xml,text/xml;q=0.9,*/*;q=0.5",
              "User-Agent": "VestoryLocalIngestion/1.0 (+local-development)",
            },
            redirect: "manual",
            signal: AbortSignal.timeout(this.timeoutMs),
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get("location");
          if (!location || redirects === MAX_REDIRECTS) throw new Error("Invalid discovery redirect");
          currentUrl = new URL(location, currentUrl);
          response = null;
        }
        if (!response) throw new Error("Discovery redirect failed");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await boundedBody(response);
        const items = parseDiscoveryXml(body, {
          source: this.source,
          allowedHosts: this.definition.allowedHosts,
          feedUrl: endpoint,
        });
        collected.push(...items.map((item) => ({
          ...item,
          language: item.language ?? this.definition.language,
        })));
      } catch (error) {
        errors.push(error);
      }
    }

    const unique = mergeCandidates(collected)
      .filter((item) => withinWindow(item, request.since, now))
      .sort((left, right) => (right.publishedAt ?? "").localeCompare(left.publishedAt ?? ""))
      .slice(0, limit);
    if (!unique.length && errors.length === endpoints.length) {
      throw new DiscoverySourceError(this.source, `All ${this.source} discovery endpoints failed`, errors);
    }
    return unique;
  }
}

export function createDiscoveryConnectors(options: { fetcher?: Fetcher; timeoutMs?: number } = {}): DiscoveryConnector[] {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;
  return DEFINITIONS.map((definition) => new SourceConnector(definition, fetcher, timeoutMs));
}

export async function discoverAllSources(
  connectors: readonly DiscoveryConnector[],
  request: DiscoveryRequest,
): Promise<{ candidates: ArticleCandidate[]; failures: Array<{ source: NewsSource; error: unknown }> }> {
  const settled = await Promise.allSettled(connectors.map((connector) => connector.discover(request)));
  const candidates: ArticleCandidate[] = [];
  const failures: Array<{ source: NewsSource; error: unknown }> = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") candidates.push(...result.value);
    else failures.push({ source: connectors[index].source, error: result.reason });
  });
  return {
    candidates: mergeCandidates(candidates),
    failures,
  };
}
