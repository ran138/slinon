import { describe, expect, it } from "vitest";
import { rankNewsCandidates } from "../lib/ingestion/ranking";
import type { ArticleCandidate, NewsSource } from "../lib/ingestion/discovery/types";

function candidate(overrides: Partial<ArticleCandidate> & Pick<ArticleCandidate, "title">): ArticleCandidate {
  const source = overrides.source ?? "ynet";
  const slug = overrides.sourceId ?? overrides.title.replace(/\s+/g, "-");
  return {
    source,
    sourceId: `${source}:${slug}`,
    url: `https://example-${source}.com/${slug}`,
    canonicalUrl: `https://example-${source}.com/${slug}`,
    summary: null,
    publishedAt: "2026-09-15T12:00:00.000Z",
    language: "en",
    metadata: {},
    ...overrides,
  };
}

describe("rankNewsCandidates", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");

  it("prioritizes broad and market-moving news before user relevance", () => {
    const result = rankNewsCandidates([
      candidate({ title: "ACME launches a minor product", summary: "Tracked ACME topic" }),
      candidate({ source: "cnbc", title: "Federal Reserve interest rate decision moves markets" }),
    ], { now, preferences: { symbols: ["ACME"] } });
    expect(result[0].source).toBe("cnbc");
    expect(result[0].scoreReasons).toContain("broad_economic_impact");
  });

  it("enforces every ranking tier lexicographically under adversarial recency", () => {
    const old = "2026-09-09T12:00:01.000Z";
    const fresh = "2026-09-16T11:59:00.000Z";
    const broadVsMarket = rankNewsCandidates([
      candidate({ source: "ynet", title: "Inflation report released", publishedAt: old }),
      candidate({ source: "cnbc", title: "Company earnings beat guidance", publishedAt: fresh }),
    ], { now });
    expect(broadVsMarket[0].title).toContain("Inflation");

    const marketVsCoverage = rankNewsCandidates([
      candidate({ source: "ynet", title: "Company earnings announcement", publishedAt: old }),
      candidate({ source: "globes", title: "Global shipping disruption continues", publishedAt: fresh }),
      candidate({ source: "cnbc", title: "Global shipping disruption continues today", publishedAt: fresh }),
    ], { now });
    expect(marketVsCoverage[0].title).toContain("earnings");

    const coverageVsRecency = rankNewsCandidates([
      candidate({ source: "ynet", title: "Semiconductor supply disruption expands", publishedAt: old }),
      candidate({ source: "globes", title: "Semiconductor supply disruption expands globally", publishedAt: old }),
      candidate({ source: "cnbc", title: "Fresh unrelated local business update", publishedAt: fresh }),
    ], { now });
    expect(coverageVsRecency[0].coverageCount).toBe(2);

    const recencyVsPreference = rankNewsCandidates([
      candidate({ source: "ynet", title: "ACME routine corporate update", publishedAt: old }),
      candidate({ source: "cnbc", title: "Fresh routine corporate update", publishedAt: fresh }),
    ], { now, preferences: { symbols: ["ACME"] } });
    expect(recencyVsPreference[0].title).toContain("Fresh");
  });

  it("rewards coverage of the same event across sources", () => {
    const result = rankNewsCandidates([
      candidate({ source: "ynet", title: "Central bank announces major interest rate decision" }),
      candidate({ source: "globes", title: "Major central bank interest rate decision announced" }),
      candidate({ source: "cnbc", title: "A separate technology story" }),
    ], { now });
    expect(result.filter((item) => item.coverageCount === 2)).toHaveLength(2);
  });

  it("removes exact and near duplicates within a source", () => {
    const result = rankNewsCandidates([
      candidate({ title: "Company reports quarterly earnings and raises guidance", sourceId: "one" }),
      candidate({ title: "Company reports quarterly earnings and raises guidance today", sourceId: "two" }),
    ], { now });
    expect(result).toHaveLength(1);
  });

  it("does not merge generic subsets or opposing updates", () => {
    const result = rankNewsCandidates([
      candidate({ title: "Company earnings rise after product launch", sourceId: "one" }),
      candidate({ title: "Company earnings rise after product launch in Europe amid strong demand", sourceId: "two" }),
      candidate({ title: "Company earnings fall after product launch", sourceId: "three" }),
    ], { now });
    expect(result).toHaveLength(3);
  });

  it("matches short preferences as complete tokens", () => {
    const result = rankNewsCandidates([
      candidate({ title: "Education company said revenue was stable" }),
      candidate({ source: "cnbc", title: "AI and CAT shares update" }),
    ], { now, preferences: { symbols: ["AI", "CAT"] } });
    expect(result[0].scoreReasons).toContain("user_relevance");
    expect(result[1].scoreReasons).not.toContain("user_relevance");
  });

  it("matches high-priority keywords only at token boundaries", () => {
    const result = rankNewsCandidates([
      candidate({ source: "ynet", title: "A selection of Tripoli business stories" }),
      candidate({ source: "cnbc", title: "Fed announces policy decision" }),
    ], { now });
    expect(result[0].title).toContain("Fed");
    expect(result[1].scoreReasons).not.toContain("broad_economic_impact");
    expect(result[1].scoreReasons).not.toContain("market_moving_event");
  });

  it("preserves case-sensitive paths during exact URL deduplication", () => {
    const result = rankNewsCandidates([
      candidate({ title: "First distinct report", canonicalUrl: "https://example.com/Company/A" }),
      candidate({ title: "Second distinct report", canonicalUrl: "https://EXAMPLE.com/company/a" }),
    ], { now });
    expect(result).toHaveLength(2);
  });

  it("rejects undated, future, and older-than-seven-day items", () => {
    const result = rankNewsCandidates([
      candidate({ title: "Undated", publishedAt: null }),
      candidate({ title: "Old", publishedAt: "2026-09-08T11:00:00Z" }),
      candidate({ title: "Future", publishedAt: "2026-09-17T11:00:00Z" }),
      candidate({ title: "Current" }),
    ], { now });
    expect(result.map((item) => item.title)).toEqual(["Current"]);
  });

  it("caps the daily result and prevents one source from dominating", () => {
    const sources: NewsSource[] = ["ynet", "globes", "themarker"];
    const uniqueWords = [
      "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet",
      "kilo", "lima", "mango", "nectar", "olive", "piano", "quartz", "river", "solar", "tango",
      "umbra", "violet", "whisky", "xray", "yellow", "zebra", "amber", "birch", "coral", "denim",
    ];
    const input = sources.flatMap((source, sourceIndex) => Array.from({ length: 30 }, (_, index) => candidate({
      source,
      sourceId: `${sourceIndex}-${index}`,
      title: `${source} ${uniqueWords[index]} market development`,
      canonicalUrl: `https://${source}.example/${index}`,
      url: `https://${source}.example/${index}`,
    })));
    const result = rankNewsCandidates(input, { now, maxItems: 50, maxSourceShare: 0.4 });
    const ynetCount = result.filter((item) => item.source === "ynet").length;
    expect(result).toHaveLength(50);
    expect(ynetCount).toBeLessThanOrEqual(20);
  });

  it("keeps the hard cap when runtime options are non-finite", () => {
    const input = Array.from({ length: 70 }, (_, index) => candidate({
      sourceId: `nan-${index}`,
      title: `Unique eventcode${index} market development`,
      canonicalUrl: `https://ynet.example/nan-${index}`,
      url: `https://ynet.example/nan-${index}`,
    }));
    const result = rankNewsCandidates(input, { now, maxItems: Number.NaN, maxSourceShare: 1 });
    expect(result).toHaveLength(50);
  });

  it("enforces source share against the actual skewed result size", () => {
    const counts: Array<[NewsSource, number]> = [["ynet", 30], ["globes", 10], ["cnbc", 10]];
    const input = counts.flatMap(([source, count]) => Array.from({ length: count }, (_, index) => candidate({
      source,
      sourceId: `${source}-skew-${index}`,
      title: `${source} skewtopic${index} routine update`,
      canonicalUrl: `https://${source}.example/skew-${index}`,
      url: `https://${source}.example/skew-${index}`,
    })));
    const result = rankNewsCandidates(input, { now, maxItems: 50, maxSourceShare: 0.4 });
    const sourceCounts = new Map<NewsSource, number>();
    for (const item of result) sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
    expect(result).toHaveLength(33);
    expect([...sourceCounts.values()].every((count) => count / result.length <= 0.4)).toBe(true);
  });
});
