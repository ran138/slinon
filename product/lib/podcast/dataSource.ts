import "server-only";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { searchPortfolioKnowledge, type KnowledgeDocument } from "@/lib/knowledge.mjs";
import type { CollectedItem, TopicKind } from "./types";

export interface TopicQuery {
  kind: TopicKind;
  label: string;
}

const SOURCE_NAMES: Record<string, string> = {
  calcalist: "כלכליסט",
  ynet: "Ynet",
  sec_edgar: "SEC EDGAR",
};

function pickTopic(documentSymbols: string[], topics: TopicQuery[]): { kind: TopicKind; label: string } {
  for (const topic of topics) {
    if (topic.kind !== "interest" && documentSymbols.includes(topic.label.toUpperCase())) {
      return { kind: topic.kind, label: topic.label };
    }
  }
  // No holding/watchlist symbol matched (a general item, e.g. broad AI/market
  // coverage with no ticker of its own) — attribute it to one of the user's
  // actual interest topics rather than an arbitrary unrelated holding symbol,
  // so interest-only topics (like "AI") can ever get their own chapter.
  // (createBrief requires at least one interest before generating, so this
  // find() succeeds in practice; the ?? topics[0] is a type-safe last resort.)
  const interestTopic = topics.find((topic) => topic.kind === "interest") ?? topics[0];
  return { kind: interestTopic?.kind ?? "interest", label: interestTopic?.label ?? "כללי" };
}

function toCollectedItem(document: KnowledgeDocument, topics: TopicQuery[]): CollectedItem {
  const { kind, label } = pickTopic(document.symbols ?? [], topics);
  return {
    id: document.id,
    topicKind: kind,
    topicLabel: label,
    occurredAt: document.published_at ?? document.accessed_at,
    headline: document.title,
    summary: document.content,
    numericFacts: [],
    sourceUrl: document.source_url,
    sourceName: SOURCE_NAMES[document.source_site] ?? document.source_site,
  };
}

/**
 * Reads from the `knowledge_documents` Supabase table via semantic vector
 * search (lib/knowledge.mjs — built by your partner, populated by
 * scripts/import-portfolio-knowledge.mjs / refreshPortfolioKnowledge()).
 * Replaces the earlier version that read the always-empty `collected_items`
 * table — this is real, populated data with working retrieval.
 *
 * windowStart/windowEnd are accepted for interface compatibility with the
 * original design but not applied as a hard filter here: semantic search
 * ranks by relevance, not recency, and the underlying RPC doesn't expose a
 * date-range parameter. Ingestion (refreshPortfolioKnowledge, called from
 * lib/briefs.ts before this runs) keeps the indexed set current instead.
 */
export async function fetchCollectedItems(
  topics: TopicQuery[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for interface compatibility with generate.ts's call site, see comment above
  _windowStart: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for interface compatibility with generate.ts's call site, see comment above
  _windowEnd: string,
): Promise<CollectedItem[]> {
  if (!topics.length || !process.env.OPENAI_API_KEY) return [];

  const symbols = topics.filter((t) => t.kind !== "interest").map((t) => t.label.toUpperCase());
  const interestLabels = topics.filter((t) => t.kind === "interest").map((t) => t.label);
  const query = [
    "חדשות, פוליטיקה, רגולציה ודוחות כספיים שרלוונטיים לתיק",
    symbols.length ? `סימולים: ${symbols.join(", ")}` : "",
    interestLabels.length ? `תחומי עניין: ${interestLabels.join(", ")}` : "",
  ].filter(Boolean).join(". ");

  const documents = await searchPortfolioKnowledge({
    supabase: getSupabaseAdmin(),
    openaiApiKey: process.env.OPENAI_API_KEY,
    query,
    symbols,
    limit: 18,
  });

  return documents.map((document) => toCollectedItem(document, topics));
}
