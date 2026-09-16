import type { ArticleCandidate, NewsSource } from "./discovery/types";

export interface RankingPreferences {
  symbols?: string[];
  topics?: string[];
}

export interface RankedCandidate extends ArticleCandidate {
  score: number;
  scoreReasons: string[];
  coverageCount: number;
}

export interface RankingOptions {
  now?: Date;
  maxItems?: number;
  maxSourceShare?: number;
  preferences?: RankingPreferences;
}

const BROAD_IMPACT = [
  "inflation", "interest rate", "central bank", "federal reserve", "fed ", "recession", "gdp", "unemployment",
  "trade war", "tariff", "sanctions", "election", "budget", "deficit", "אינפלציה", "ריבית", "בנק ישראל",
  "מיתון", "תוצר", "אבטלה", "תקציב", "גירעון", "בחירות", "סנקציות", "מכסים",
];

const MARKET_MOVING = [
  "earnings", "merger", "acquisition", "bankruptcy", "default", "guidance", "profit warning", "ipo", "layoffs",
  "regulation", "investigation", "דוחות", "מיזוג", "רכישה", "פשיטת רגל", "חדלות פירעון", "אזהרת רווח",
  "הנפקה", "פיטורים", "רגולציה", "חקירה",
];

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "after", "into", "over", "של", "את", "על", "עם",
  "לא", "אל", "כי", "מה", "איך", "אחרי", "לפני", "יותר", "חדש", "חדשה",
]);

function haystack(candidate: ArticleCandidate): string {
  return `${candidate.title} ${candidate.summary ?? ""}`.toLocaleLowerCase();
}

function containsAny(value: string, terms: readonly string[]): boolean {
  const tokens = lexicalTokens(value);
  return terms.some((term) => {
    const phrase = lexicalTokens(term);
    if (!phrase.length || phrase.length > tokens.length) return false;
    return tokens.some((_, start) => phrase.every((token, offset) => tokens[start + offset] === token));
  });
}

function lexicalTokens(value: string): string[] {
  return value.toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function titleTokens(title: string): Set<string> {
  return new Set(lexicalTokens(title).filter((token) => token.length >= 3 && !STOP_WORDS.has(token)));
}

function similarity(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

const OPPOSITES: Array<[string, string]> = [
  ["rises", "falls"], ["rise", "fall"], ["gains", "drops"], ["beats", "misses"],
  ["higher", "lower"], ["up", "down"], ["עולה", "יורד"], ["עלייה", "ירידה"],
  ["עקף", "פספס"], ["אושר", "נדחה"],
];

function contradicts(left: Set<string>, right: Set<string>): boolean {
  return OPPOSITES.some(([positive, negative]) => (
    (left.has(positive) && right.has(negative)) || (left.has(negative) && right.has(positive))
  ));
}

function closeInTime(left: ArticleCandidate, right: ArticleCandidate, hours: number): boolean {
  const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : Number.NaN;
  const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : Number.NaN;
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    && Math.abs(leftTime - rightTime) <= hours * 3_600_000;
}

function dedupe(candidates: readonly ArticleCandidate[]): ArticleCandidate[] {
  const exact = new Map<string, ArticleCandidate>();
  for (const candidate of candidates) {
    let key = candidate.canonicalUrl;
    try {
      const url = new URL(candidate.canonicalUrl);
      key = `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${url.pathname}${url.search}`;
    } catch {
      // Discovery already validates URLs; preserve the exact value if a custom connector did not.
    }
    const current = exact.get(key);
    if (!current || (candidate.summary?.length ?? 0) > (current.summary?.length ?? 0)) exact.set(key, candidate);
  }
  const result: ArticleCandidate[] = [];
  const tokenSets: Set<string>[] = [];
  for (const candidate of exact.values()) {
    const tokens = titleTokens(candidate.title);
    const duplicateIndex = tokenSets.findIndex((existing, index) => (
      result[index].source === candidate.source
      && closeInTime(result[index], candidate, 24)
      && !contradicts(existing, tokens)
      && similarity(existing, tokens) >= 0.85
    ));
    if (duplicateIndex === -1) {
      result.push(candidate);
      tokenSets.push(tokens);
    } else if ((candidate.summary?.length ?? 0) > (result[duplicateIndex].summary?.length ?? 0)) {
      result[duplicateIndex] = candidate;
      tokenSets[duplicateIndex] = tokens;
    }
  }
  return result;
}

function coverageFor(candidate: ArticleCandidate, all: readonly ArticleCandidate[]): number {
  const tokens = titleTokens(candidate.title);
  const sources = new Set<NewsSource>([candidate.source]);
  for (const other of all) {
    const otherTokens = titleTokens(other.title);
    if (other.source !== candidate.source
      && closeInTime(candidate, other, 48)
      && !contradicts(tokens, otherTokens)
      && similarity(tokens, otherTokens) >= 0.55) sources.add(other.source);
  }
  return sources.size;
}

function scoreCandidate(
  candidate: ArticleCandidate,
  all: readonly ArticleCandidate[],
  now: Date,
  preferences: RankingPreferences,
): RankedCandidate {
  const text = haystack(candidate);
  const reasons: string[] = [];
  let score = 0;
  if (containsAny(text, BROAD_IMPACT)) {
    score += 35;
    reasons.push("broad_economic_impact");
  }
  if (containsAny(text, MARKET_MOVING)) {
    score += 30;
    reasons.push("market_moving_event");
  }
  const coverageCount = coverageFor(candidate, all);
  if (coverageCount > 1) {
    score += Math.min(20, (coverageCount - 1) * 7);
    reasons.push("cross_source_coverage");
  }
  const published = candidate.publishedAt ? Date.parse(candidate.publishedAt) : Number.NaN;
  const ageHours = Number.isFinite(published) ? Math.max(0, (now.getTime() - published) / 3_600_000) : 168;
  score += Math.max(0, 12 * (1 - ageHours / 168));
  reasons.push("recency");
  const preferenceTerms = [...(preferences.symbols ?? []), ...(preferences.topics ?? [])]
    .map((term) => term.trim().toLocaleLowerCase())
    .filter(Boolean);
  const textTokens = new Set(lexicalTokens(text));
  const preferenceMatch = preferenceTerms.some((term) => {
    const tokens = lexicalTokens(term);
    if (!tokens.length) return false;
    return tokens.every((token) => textTokens.has(token));
  });
  if (preferenceMatch) {
    score += 8;
    reasons.push("user_relevance");
  }
  return { ...candidate, score: Number(score.toFixed(3)), scoreReasons: reasons, coverageCount };
}

export function rankNewsCandidates(
  input: readonly ArticleCandidate[],
  options: RankingOptions = {},
): RankedCandidate[] {
  const now = options.now ?? new Date();
  const rawMaxItems = Number.isFinite(options.maxItems) ? Math.trunc(options.maxItems!) : 50;
  const maxItems = Math.max(1, Math.min(50, rawMaxItems));
  const rawSourceShare = Number.isFinite(options.maxSourceShare) ? options.maxSourceShare! : 0.4;
  const maxSourceShare = Math.max(0.1, Math.min(1, rawSourceShare));
  const oldest = now.getTime() - 7 * 24 * 60 * 60 * 1_000;
  const candidates = dedupe(input.filter((candidate) => {
    if (!candidate.publishedAt) return false;
    const time = Date.parse(candidate.publishedAt);
    return Number.isFinite(time) && time >= oldest && time <= now.getTime();
  }));
  const ranked = candidates
    .map((candidate) => scoreCandidate(candidate, candidates, now, options.preferences ?? {}))
    .sort((left, right) => {
      const broad = Number(right.scoreReasons.includes("broad_economic_impact"))
        - Number(left.scoreReasons.includes("broad_economic_impact"));
      if (broad) return broad;
      const market = Number(right.scoreReasons.includes("market_moving_event"))
        - Number(left.scoreReasons.includes("market_moving_event"));
      if (market) return market;
      if (right.coverageCount !== left.coverageCount) return right.coverageCount - left.coverageCount;
      const recency = (Date.parse(right.publishedAt ?? "") || 0) - (Date.parse(left.publishedAt ?? "") || 0);
      if (recency) return recency;
      const relevance = Number(right.scoreReasons.includes("user_relevance"))
        - Number(left.scoreReasons.includes("user_relevance"));
      if (relevance) return relevance;
      return right.score - left.score;
    });
  const availableBySource = new Map<NewsSource, number>();
  for (const candidate of ranked) availableBySource.set(candidate.source, (availableBySource.get(candidate.source) ?? 0) + 1);
  const minimumSources = Math.ceil(1 / maxSourceShare);
  let targetSize = Math.min(maxItems, ranked.length);
  let perSourceLimit = targetSize;
  if (availableBySource.size >= minimumSources) {
    for (; targetSize > 0; targetSize -= 1) {
      const cap = Math.max(1, Math.floor(targetSize * maxSourceShare));
      const capacity = [...availableBySource.values()].reduce((sum, count) => sum + Math.min(count, cap), 0);
      if (capacity >= targetSize) {
        perSourceLimit = cap;
        break;
      }
    }
  }
  const sourceCounts = new Map<NewsSource, number>();
  const selected: RankedCandidate[] = [];
  for (const candidate of ranked) {
    if (selected.length >= targetSize) break;
    const count = sourceCounts.get(candidate.source) ?? 0;
    if (count >= perSourceLimit) continue;
    selected.push(candidate);
    sourceCounts.set(candidate.source, count + 1);
  }
  return selected;
}
