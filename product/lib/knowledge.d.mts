import type { SupabaseClient } from "@supabase/supabase-js";

export const EMBEDDING_MODEL: "text-embedding-3-large";
export const EMBEDDING_DIMENSIONS: 1536;

type KnowledgeAsset = {
  kind: string;
  name: string;
  symbol: string;
  assetClass?: string | null;
};

export type KnowledgeDocument = {
  id: string;
  document_id: string;
  source_site: "calcalist" | "ynet" | "globes" | "themarker" | "reuters" | "cnbc" | "yahoo_finance" | "sec_edgar";
  source_kind: "news" | "financial_report";
  source_url: string;
  canonical_url: string;
  title: string;
  published_at: string | null;
  accessed_at: string;
  content: string;
  chunk_indexes: number[];
  symbols: string[];
  topics: string[];
  metadata: Record<string, unknown>;
  similarity: number;
};

export function refreshPortfolioKnowledge(options: {
  supabase: SupabaseClient;
  assets: KnowledgeAsset[];
  openaiApiKey: string;
  textModel?: string;
  embeddingModel?: string;
}): Promise<{ runId: string; sourceCounts: Record<string, number>; documentCount: number }>;

export function searchPortfolioKnowledge(options: {
  supabase: SupabaseClient;
  openaiApiKey: string;
  query: string;
  symbols: string[];
  limit?: number;
  embeddingModel?: string;
}): Promise<KnowledgeDocument[]>;

export function formatKnowledgeDossier(documents: KnowledgeDocument[]): string;

export function mergeKnowledgeChunkMatches(rows: Array<Record<string, unknown>>, limit?: number): KnowledgeDocument[];
