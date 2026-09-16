import { describe, expect, it, vi } from "vitest";
import { chunkContent, sha256 } from "../lib/ingestion/chunking";
import {
  EMBEDDING_DIMENSIONS,
  processKnowledgeDocument,
  type EmbeddingProvider,
  type KnowledgeDocumentInput,
  type KnowledgeStore,
} from "../lib/ingestion/knowledge-pipeline";

const input: KnowledgeDocumentInput = {
  sourceSite: "cnbc",
  sourceKind: "news",
  sourceId: "cnbc:story-1",
  canonicalUrl: "https://www.cnbc.com/story-1",
  sourceUrl: "https://www.cnbc.com/story-1",
  title: "Story one",
  content: "A sufficiently detailed body for a financial news article.",
  publishedAt: "2026-09-16T10:00:00Z",
  symbols: ["TEST"],
  topics: ["markets"],
  metadata: {},
  sourceMetadata: { taskId: "one" },
};

function dependencies(unchanged = false) {
  const store: KnowledgeStore = {
    prepare: vi.fn().mockResolvedValue({
      id: "document-1", version: 1, unchanged, inProgress: false, ownerToken: unchanged ? null : "owner-1",
    }),
    commitChunks: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
  const embeddings: EmbeddingProvider = {
    model: "test-embedding",
    create: vi.fn().mockImplementation(async (values: string[]) => (
      values.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1))
    )),
  };
  return { store, embeddings };
}

describe("token-aware chunking", () => {
  it("uses bounded token chunks with deterministic overlap and hashes", () => {
    const content = Array.from({ length: 300 }, (_, index) => `Sentence ${index} about markets.`).join(" ");
    const chunks = chunkContent(content, { maxTokens: 80, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.tokenCount <= 80 && chunk.tokenCount > 0)).toBe(true);
    expect(chunks.every((chunk) => chunk.contentHash === sha256(chunk.content))).toBe(true);
    expect(chunks.map((chunk) => chunk.index)).toEqual(chunks.map((_, index) => index));
  });

  it("returns no chunks for empty content", () => {
    expect(chunkContent(" \n\n ")).toEqual([]);
  });
});

describe("knowledge processing", () => {
  it("embeds and saves each chunk once", async () => {
    const deps = dependencies();
    const result = await processKnowledgeDocument(input, deps);
    expect(result.chunkCount).toBe(1);
    expect(deps.embeddings.create).toHaveBeenCalledTimes(1);
    expect(deps.store.commitChunks).toHaveBeenCalledTimes(1);
  });

  it("does not embed unchanged content again", async () => {
    const deps = dependencies(true);
    const result = await processKnowledgeDocument(input, deps);
    expect(result).toMatchObject({ unchanged: true, chunkCount: 0 });
    expect(deps.embeddings.create).not.toHaveBeenCalled();
    expect(deps.store.commitChunks).not.toHaveBeenCalled();
  });

  it("marks the document failed when embeddings are invalid", async () => {
    const deps = dependencies();
    vi.mocked(deps.embeddings.create).mockResolvedValue([[1, 2, 3]]);
    await expect(processKnowledgeDocument(input, deps)).rejects.toThrow(/invalid vector batch/i);
    expect(deps.store.markFailed).toHaveBeenCalledWith("document-1", "owner-1", expect.stringMatching(/invalid vector batch/i));
  });

  it("normalizes equivalent content before computing identity", async () => {
    const deps = dependencies();
    await processKnowledgeDocument({ ...input, content: "Line one\r\n\r\n\r\nLine two" }, deps);
    expect(deps.store.prepare).toHaveBeenCalledWith(expect.objectContaining({
      content: "Line one\n\nLine two",
      contentHash: sha256("Line one\n\nLine two"),
      processingConfigHash: expect.any(String),
    }));
  });
});
