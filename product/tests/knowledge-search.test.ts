import { describe, expect, it } from "vitest";
import { mergeKnowledgeChunkMatches } from "../lib/knowledge.mjs";

describe("chunk search compatibility", () => {
  it("merges relevant chunks by document and keeps the original citation", () => {
    const rows = [
      {
        chunk_id: "chunk-2", document_id: "doc-1", source_site: "cnbc", source_kind: "news",
        source_url: "https://cnbc.com/original", canonical_url: "https://www.cnbc.com/article",
        title: "Markets", published_at: "2026-09-16T10:00:00Z", accessed_at: "2026-09-16T11:00:00Z",
        content: "Second relevant section", chunk_index: 2, symbols: ["TEST"], topics: ["markets"],
        metadata: { provider: "decodo" }, similarity: 0.9,
      },
      {
        chunk_id: "chunk-1", document_id: "doc-1", source_site: "cnbc", source_kind: "news",
        source_url: "https://cnbc.com/original", canonical_url: "https://www.cnbc.com/article",
        title: "Markets", published_at: "2026-09-16T10:00:00Z", accessed_at: "2026-09-16T11:00:00Z",
        content: "First relevant section", chunk_index: 1, symbols: ["TEST"], topics: ["markets"],
        metadata: { provider: "decodo" }, similarity: 0.8,
      },
      {
        chunk_id: "other", document_id: "doc-2", source_site: "globes", source_kind: "news",
        source_url: "https://globes.co.il/a", title: "Other", content: "Other content", chunk_index: 0,
        symbols: [], topics: [], metadata: {}, similarity: 0.7,
      },
    ];
    const result = mergeKnowledgeChunkMatches(rows, 10);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "doc-1", canonical_url: "https://www.cnbc.com/article", chunk_indexes: [1, 2], similarity: 0.9,
    });
    expect(result[0].content).toBe("First relevant section\n\nSecond relevant section");
  });

  it("limits documents rather than raw chunk rows", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      document_id: `doc-${index}`, source_site: "cnbc", source_kind: "news", source_url: `https://cnbc.com/${index}`,
      title: `Story ${index}`, content: `Chunk ${index}`, chunk_index: 0, similarity: 1 - index / 10,
    }));
    expect(mergeKnowledgeChunkMatches(rows, 3)).toHaveLength(3);
  });
});
