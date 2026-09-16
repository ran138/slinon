import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { chunkContent, normalizeContent, sha256, type ContentChunk } from "./chunking";
import type { ExtractedArticle } from "./providers/types";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large";
export const EMBEDDING_DIMENSIONS = 1536;

export interface KnowledgeDocumentInput {
  sourceSite: string;
  sourceKind: "news" | "financial_report";
  sourceId: string;
  canonicalUrl: string;
  sourceUrl: string;
  title: string;
  content: string;
  publishedAt: string | null;
  symbols: string[];
  topics: string[];
  metadata: Record<string, unknown>;
  sourceMetadata: Record<string, unknown>;
}

export interface PreparedDocument {
  id: string;
  version: number;
  unchanged: boolean;
  inProgress: boolean;
  ownerToken: string | null;
}

export interface KnowledgeStore {
  prepare(input: KnowledgeDocumentInput & { contentHash: string; processingConfigHash: string }): Promise<PreparedDocument>;
  commitChunks(documentId: string, ownerToken: string, chunks: Array<ContentChunk & { embedding: number[]; embeddingModel: string }>): Promise<void>;
  markFailed(documentId: string, ownerToken: string, error: string): Promise<void>;
}

export interface EmbeddingProvider {
  readonly model: string;
  create(inputs: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  private readonly client: OpenAI;

  constructor(client: OpenAI, model = DEFAULT_EMBEDDING_MODEL) {
    this.client = client;
    this.model = model;
  }

  async create(inputs: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
      input: inputs,
    });
    return response.data.sort((left, right) => left.index - right.index).map((item) => item.embedding);
  }
}

export class SupabaseKnowledgeStore implements KnowledgeStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async prepare(input: KnowledgeDocumentInput & { contentHash: string; processingConfigHash: string }): Promise<PreparedDocument> {
    const result = await this.supabase.rpc("prepare_knowledge_document", {
      p_source_site: input.sourceSite,
      p_source_kind: input.sourceKind,
      p_source_url: input.sourceUrl,
      p_canonical_url: input.canonicalUrl,
      p_source_id: input.sourceId,
      p_title: input.title,
      p_published_at: input.publishedAt,
      p_content: input.content,
      p_content_hash: input.contentHash,
      p_symbols: input.symbols,
      p_topics: input.topics,
      p_metadata: input.metadata,
      p_source_metadata: input.sourceMetadata,
      p_processing_config_hash: input.processingConfigHash,
    });
    if (result.error) throw new Error(`prepare knowledge document: ${result.error.message}`);
    const row = result.data?.[0];
    if (!row) throw new Error("prepare knowledge document returned no row");
    return {
      id: row.id,
      version: row.version,
      unchanged: row.unchanged,
      inProgress: row.in_progress,
      ownerToken: row.owner_token,
    };
  }

  async commitChunks(
    documentId: string,
    ownerToken: string,
    chunks: Array<ContentChunk & { embedding: number[]; embeddingModel: string }>,
  ): Promise<void> {
    const committed = await this.supabase.rpc("commit_knowledge_chunks", {
      p_document_id: documentId,
      p_owner_token: ownerToken,
      p_chunks: chunks,
    });
    if (committed.error) throw new Error(`commit knowledge chunks: ${committed.error.message}`);
    if (!committed.data) throw new Error("knowledge processing lease was lost");
  }

  async markFailed(documentId: string, ownerToken: string, error: string): Promise<void> {
    const failed = await this.supabase.rpc("fail_knowledge_processing", {
      p_document_id: documentId,
      p_owner_token: ownerToken,
      p_error: error,
    });
    if (failed.error) throw new Error(`fail knowledge processing: ${failed.error.message}`);
  }
}

export async function processKnowledgeDocument(
  input: KnowledgeDocumentInput,
  dependencies: { store: KnowledgeStore; embeddings: EmbeddingProvider },
): Promise<PreparedDocument & { chunkCount: number }> {
  const normalizedContent = normalizeContent(input.content);
  const processingConfigHash = sha256(`chunker:v1|max:700|overlap:100|model:${dependencies.embeddings.model}|dimensions:${EMBEDDING_DIMENSIONS}`);
  const contentHash = sha256(normalizedContent);
  const prepared = await dependencies.store.prepare({
    ...input,
    content: normalizedContent,
    contentHash,
    processingConfigHash,
  });
  if (prepared.unchanged) return { ...prepared, chunkCount: 0 };
  if (prepared.inProgress) return { ...prepared, chunkCount: 0 };
  if (!prepared.ownerToken) throw new Error("knowledge processing owner token is missing");
  try {
    const chunks = chunkContent(normalizedContent);
    if (!chunks.length) throw new Error("Document content produced no chunks");
    const vectors = await dependencies.embeddings.create(chunks.map((chunk) => chunk.content));
    if (vectors.length !== chunks.length || vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
      throw new Error("Embedding provider returned an invalid vector batch");
    }
    await dependencies.store.commitChunks(prepared.id, prepared.ownerToken, chunks.map((chunk, index) => ({
      ...chunk,
      embedding: vectors[index],
      embeddingModel: dependencies.embeddings.model,
    })));
    return { ...prepared, chunkCount: chunks.length };
  } catch (error) {
    await dependencies.store.markFailed(
      prepared.id,
      prepared.ownerToken,
      error instanceof Error ? error.message : "unknown_error",
    );
    throw error;
  }
}

export function articleToKnowledgeInput(
  article: ExtractedArticle,
  options: { sourceSite: string; sourceId: string; symbols?: string[]; topics?: string[] },
): KnowledgeDocumentInput {
  return {
    sourceSite: options.sourceSite,
    sourceKind: "news",
    sourceId: options.sourceId,
    canonicalUrl: article.canonicalUrl,
    sourceUrl: article.sourceUrl,
    title: article.title,
    content: article.content,
    publishedAt: article.publishedAt,
    symbols: options.symbols ?? [],
    topics: options.topics ?? [],
    metadata: { provider: article.provider },
    sourceMetadata: article.metadata,
  };
}
