import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type { ArticleCandidate, NewsSource } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
});

function array<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  if (value && typeof value === "object" && "#text" in value) return text((value as { "#text": unknown })["#text"]);
  return null;
}

function stripMarkup(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function canonicalizeUrl(value: string, allowedHosts: readonly string[]): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const allowed = allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    if (!allowed) return null;
    url.protocol = "https:";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || ["guccounter", "soc_src", "soc_trk"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function stableSourceId(source: NewsSource, url: string): string {
  return `${source}:${createHash("sha256").update(url).digest("hex")}`;
}

function candidate(
  source: NewsSource,
  allowedHosts: readonly string[],
  values: { url: unknown; title: unknown; summary?: unknown; publishedAt?: unknown; language?: unknown },
  feedUrl: string,
): ArticleCandidate | null {
  const rawUrl = text(values.url);
  const title = stripMarkup(text(values.title));
  if (!rawUrl || !title) return null;
  const canonicalUrl = canonicalizeUrl(rawUrl, allowedHosts);
  if (!canonicalUrl) return null;
  return {
    source,
    sourceId: stableSourceId(source, canonicalUrl),
    url: canonicalUrl,
    canonicalUrl,
    title,
    summary: stripMarkup(text(values.summary)),
    publishedAt: isoDate(values.publishedAt),
    language: text(values.language),
    metadata: { discoveredFrom: feedUrl },
  };
}

export function parseDiscoveryXml(
  xml: string,
  options: { source: NewsSource; allowedHosts: readonly string[]; feedUrl: string },
): ArticleCandidate[] {
  const document = parser.parse(xml) as Record<string, unknown>;
  const rss = document.rss as { channel?: Record<string, unknown> } | undefined;
  if (rss?.channel) {
    const language = rss.channel.language;
    return array(rss.channel.item as Record<string, unknown> | Record<string, unknown>[] | undefined)
      .map((item) => candidate(options.source, options.allowedHosts, {
        url: item.link ?? item.guid,
        title: item.title,
        summary: item.description ?? item.encoded,
        publishedAt: item.pubDate ?? item.published ?? item.updated,
        language,
      }, options.feedUrl))
      .filter((item): item is ArticleCandidate => item !== null);
  }

  const feed = document.feed as Record<string, unknown> | undefined;
  if (feed) {
    return array(feed.entry as Record<string, unknown> | Record<string, unknown>[] | undefined)
      .map((entry) => {
        const links = array(entry.link as Record<string, unknown> | string | undefined);
        const structuredLinks = links.filter((value): value is Record<string, unknown> => (
          typeof value === "object" && value !== null
        ));
        const alternate = structuredLinks.find((value) => value["@_rel"] === "alternate" && typeof value["@_href"] === "string");
        const unqualified = structuredLinks.find((value) => value["@_rel"] === undefined && typeof value["@_href"] === "string");
        const stringLink = links.find((value): value is string => typeof value === "string");
        const link = alternate?.["@_href"] ?? unqualified?.["@_href"] ?? stringLink;
        return candidate(options.source, options.allowedHosts, {
          url: link,
          title: entry.title,
          summary: entry.summary ?? entry.content,
          publishedAt: entry.published ?? entry.updated,
          language: feed["@_lang"],
        }, options.feedUrl);
      })
      .filter((item): item is ArticleCandidate => item !== null);
  }

  const urlset = document.urlset as Record<string, unknown> | undefined;
  if (urlset) {
    return array(urlset.url as Record<string, unknown> | Record<string, unknown>[] | undefined)
      .map((entry) => {
        const news = entry.news as Record<string, unknown> | undefined;
        const publication = news?.publication as Record<string, unknown> | undefined;
        return candidate(options.source, options.allowedHosts, {
          url: entry.loc,
          title: news?.title ?? entry.loc,
          publishedAt: news?.publication_date ?? entry.lastmod,
          language: publication?.language,
        }, options.feedUrl);
      })
      .filter((item): item is ArticleCandidate => item !== null);
  }

  throw new Error("Unsupported discovery XML document");
}
