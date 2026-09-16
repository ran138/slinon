import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  SupabaseKnowledgeStore,
  processKnowledgeDocument,
  type EmbeddingProvider,
  type KnowledgeDocumentInput,
} from "../lib/ingestion/knowledge-pipeline";
import { sha256 } from "../lib/ingestion/chunking";

const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const integration = describe.runIf(configured);

integration("atomic knowledge processing", () => {
  const supabase = createClient(
    process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "missing",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const store = new SupabaseKnowledgeStore(supabase);
  const sourceId = `pipeline:${crypto.randomUUID()}`;
  const canonicalUrl = `https://www.cnbc.com/${sourceId}`;
  const input: KnowledgeDocumentInput = {
    sourceSite: "cnbc",
    sourceKind: "news",
    sourceId,
    canonicalUrl,
    sourceUrl: canonicalUrl,
    title: "Concurrent processing test",
    content: "A complete financial article body used to verify atomic local processing.",
    publishedAt: "2026-09-16T10:00:00Z",
    symbols: ["TEST"],
    topics: ["markets"],
    metadata: {},
    sourceMetadata: { origin: "integration" },
  };

  afterAll(async () => {
    await supabase.from("knowledge_documents").delete().like("source_id", `${sourceId}%`);
  });

  it("gives concurrent identical work a single embedding owner", async () => {
    const create = vi.fn(async (values: string[]) => values.map(() => Array(EMBEDDING_DIMENSIONS).fill(0.1)));
    const embeddings: EmbeddingProvider = { model: "integration-model", create };
    const results = await Promise.all([
      processKnowledgeDocument(input, { store, embeddings }),
      processKnowledgeDocument(input, { store, embeddings }),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.chunkCount > 0)).toHaveLength(1);
    const documents = await supabase.from("knowledge_documents")
      .select("id,processing_status")
      .eq("canonical_url", canonicalUrl);
    expect(documents.error).toBeNull();
    expect(documents.data).toHaveLength(1);
    expect(documents.data?.[0].processing_status).toBe("ready");
    const chunks = await supabase.from("knowledge_chunks")
      .select("id")
      .eq("document_id", documents.data![0].id);
    expect(chunks.data).toHaveLength(1);
  });

  it("resolves the canonical-content identity and refreshes metadata", async () => {
    const prepared = await store.prepare({
      ...input,
      sourceId: `${sourceId}:alternate`,
      title: "Refreshed title",
      symbols: ["TEST", "NEW"],
      contentHash: sha256(input.content),
      processingConfigHash: sha256(
        `chunker:v1|max:700|overlap:100|model:integration-model|dimensions:${EMBEDDING_DIMENSIONS}`,
      ),
    });
    expect(prepared.unchanged).toBe(true);
    const row = await supabase.from("knowledge_documents")
      .select("title,symbols")
      .eq("id", prepared.id)
      .single();
    expect(row.data).toMatchObject({ title: "Refreshed title", symbols: ["TEST", "NEW"] });
  });

  it("serializes first-time alternate identities for the same canonical content", async () => {
    const freshUrl = `https://www.cnbc.com/concurrent-${crypto.randomUUID()}`;
    const base = { ...input, canonicalUrl: freshUrl, sourceUrl: freshUrl, content: "Shared new canonical body." };
    const create = vi.fn(async (values: string[]) => values.map(() => Array(EMBEDDING_DIMENSIONS).fill(0.2)));
    const embeddings: EmbeddingProvider = { model: "integration-model", create };
    const results = await Promise.all([
      processKnowledgeDocument({ ...base, sourceId: `${sourceId}:first` }, { store, embeddings }),
      processKnowledgeDocument({ ...base, sourceId: `${sourceId}:second` }, { store, embeddings }),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(results.some((result) => result.inProgress || result.unchanged)).toBe(true);
    await supabase.from("knowledge_documents").delete().eq("canonical_url", freshUrl);
  });

  it("avoids crossed identity deadlocks during concurrent reconciliation", async () => {
    const collision = crypto.randomUUID();
    const content = `Crossed identity ${collision}`;
    const contentHash = sha256(content);
    const firstId = `cross-a:${collision}`;
    const secondId = `cross-b:${collision}`;
    const firstUrl = `https://www.cnbc.com/cross-a-${collision}`;
    const secondUrl = `https://www.cnbc.com/cross-b-${collision}`;
    const inserted = await supabase.from("knowledge_documents").insert([
      {
        source_site: "cnbc", source_kind: "news", source_url: firstUrl, canonical_url: firstUrl,
        source_id: firstId, title: "First", content, content_hash: contentHash,
        version: 1, processing_status: "ready", processing_config_hash: "cross-config",
      },
      {
        source_site: "cnbc", source_kind: "news", source_url: secondUrl, canonical_url: secondUrl,
        source_id: secondId, title: "Second", content, content_hash: contentHash,
        version: 1, processing_status: "ready", processing_config_hash: "cross-config",
      },
    ]).select("id,source_id");
    expect(inserted.error).toBeNull();
    const aliases = inserted.data!.map((document) => ({
      source_site: "cnbc",
      source_id: document.source_id,
      content_hash: contentHash,
      document_id: document.id,
    }));
    expect((await supabase.from("knowledge_document_aliases").insert(aliases)).error).toBeNull();
    const prepared = await Promise.all([
      store.prepare({
        ...input, sourceId: firstId, sourceUrl: secondUrl, canonicalUrl: secondUrl,
        content, contentHash, processingConfigHash: "cross-config",
      }),
      store.prepare({
        ...input, sourceId: secondId, sourceUrl: firstUrl, canonicalUrl: firstUrl,
        content, contentHash, processingConfigHash: "cross-config",
      }),
    ]);
    expect(new Set(prepared.map((result) => result.id)).size).toBe(1);
    const remaining = await supabase.from("knowledge_documents").select("id").eq("content_hash", contentHash);
    expect(remaining.data).toHaveLength(1);
    await supabase.from("knowledge_documents").delete().eq("content_hash", contentHash);
  });

  it("preserves ready chunks on failed reprocessing and rejects an empty atomic commit", async () => {
    const prepared = await store.prepare({
      ...input,
      contentHash: sha256(input.content),
      processingConfigHash: sha256("new-config"),
    });
    expect(prepared.ownerToken).toBeTruthy();
    const empty = await supabase.rpc("commit_knowledge_chunks", {
      p_document_id: prepared.id,
      p_owner_token: prepared.ownerToken,
      p_chunks: [],
    });
    expect(empty.error).not.toBeNull();
    await store.markFailed(prepared.id, prepared.ownerToken!, "new model failed");
    const row = await supabase.from("knowledge_documents")
      .select("processing_status,source_metadata")
      .eq("id", prepared.id)
      .single();
    expect(row.data?.processing_status).toBe("ready");
    expect(row.data?.source_metadata).toMatchObject({ processingError: "new model failed" });
    const chunks = await supabase.from("knowledge_chunks").select("id").eq("document_id", prepared.id);
    expect(chunks.data).toHaveLength(1);
    const embeddings: EmbeddingProvider = {
      model: "recovery-model",
      create: vi.fn(async (values) => values.map(() => Array(EMBEDDING_DIMENSIONS).fill(0.1))),
    };
    const retry = await processKnowledgeDocument(input, { store, embeddings });
    expect(retry.chunkCount).toBe(1);
    const recovered = await supabase.from("knowledge_documents").select("source_metadata").eq("id", prepared.id).single();
    expect(recovered.data?.source_metadata).not.toHaveProperty("processingError");
  });

  it("finds unchanged content by stable source identity when its canonical URL changes", async () => {
    const changedUrl = `${canonicalUrl}?canonical=changed`;
    const prepared = await store.prepare({
      ...input,
      canonicalUrl: changedUrl,
      sourceUrl: changedUrl,
      contentHash: sha256(input.content),
      processingConfigHash: sha256(
        `chunker:v1|max:700|overlap:100|model:recovery-model|dimensions:${EMBEDDING_DIMENSIONS}`,
      ),
    });
    expect(prepared.unchanged).toBe(true);
    const row = await supabase.from("knowledge_documents").select("canonical_url").eq("id", prepared.id).single();
    expect(row.data?.canonical_url).toBe(changedUrl);
  });

  it("deterministically reconciles stable and canonical identities that already exist", async () => {
    const collision = crypto.randomUUID();
    const content = "Same collision content";
    const contentHash = sha256(content);
    const firstUrl = `https://www.cnbc.com/collision-a-${collision}`;
    const secondUrl = `https://www.cnbc.com/collision-b-${collision}`;
    const inserted = await supabase.from("knowledge_documents").insert([
      {
        source_site: "cnbc", source_kind: "news", source_url: firstUrl, canonical_url: firstUrl,
        source_id: `collision-a:${collision}`, title: "First", content, content_hash: contentHash,
        version: 1, processing_status: "ready", processing_config_hash: "collision-config",
      },
      {
        source_site: "cnbc", source_kind: "news", source_url: secondUrl, canonical_url: secondUrl,
        source_id: `collision-b:${collision}`, title: "Second", content, content_hash: contentHash,
        version: 1, processing_status: "ready", processing_config_hash: "collision-config",
      },
    ]);
    expect(inserted.error).toBeNull();
    const originalRows = await supabase.from("knowledge_documents")
      .select("id,source_id")
      .eq("content_hash", contentHash)
      .in("source_id", [`collision-a:${collision}`, `collision-b:${collision}`]);
    const canonicalDocument = originalRows.data?.find((row) => row.source_id === `collision-b:${collision}`);
    expect(canonicalDocument).toBeTruthy();
    const chunk = await supabase.from("knowledge_chunks").insert({
      document_id: canonicalDocument!.id,
      chunk_index: 0,
      content: "Preserved collision chunk",
      content_hash: `collision-chunk:${collision}`,
      token_count: 3,
      embedding: Array(EMBEDDING_DIMENSIONS).fill(0.3),
      embedding_model: "collision-model",
    });
    expect(chunk.error).toBeNull();
    const prepared = await store.prepare({
      ...input,
      sourceId: `collision-a:${collision}`,
      sourceUrl: secondUrl,
      canonicalUrl: secondUrl,
      content,
      contentHash,
      processingConfigHash: "collision-config",
    });
    expect(prepared.unchanged).toBe(true);
    const rows = await supabase.from("knowledge_documents")
      .select("id,source_id,canonical_url")
      .eq("content_hash", contentHash)
      .in("source_id", [`collision-a:${collision}`, `collision-b:${collision}`]);
    expect(rows.data).toHaveLength(1);
    expect(rows.data?.[0].canonical_url).toBe(secondUrl);
    expect(rows.data?.[0].source_id).toBe(`collision-a:${collision}`);
    const preservedChunks = await supabase.from("knowledge_chunks")
      .select("content")
      .eq("document_id", prepared.id);
    expect(preservedChunks.data).toEqual([{ content: "Preserved collision chunk" }]);

    const aliasPrepared = await store.prepare({
      ...input,
      sourceId: `collision-b:${collision}`,
      sourceUrl: secondUrl,
      canonicalUrl: secondUrl,
      content,
      contentHash,
      processingConfigHash: "collision-config",
    });
    expect(aliasPrepared).toMatchObject({ id: prepared.id, unchanged: true });
    const afterAlias = await supabase.from("knowledge_documents")
      .select("id")
      .eq("content_hash", contentHash);
    expect(afterAlias.data).toHaveLength(1);

    const updatedContent = `${content} with a material update`;
    const updatedHash = sha256(updatedContent);
    const updated = await store.prepare({
      ...input,
      sourceId: `collision-b:${collision}`,
      sourceUrl: secondUrl,
      canonicalUrl: secondUrl,
      content: updatedContent,
      contentHash: updatedHash,
      processingConfigHash: "collision-config",
    });
    expect(updated).toMatchObject({ version: 2, unchanged: false, inProgress: false });
    expect(updated.ownerToken).toBeTruthy();
    await store.commitChunks(updated.id, updated.ownerToken!, [{
      index: 0,
      content: "Updated collision chunk",
      contentHash: `updated-collision-chunk:${collision}`,
      tokenCount: 3,
      embedding: Array(EMBEDDING_DIMENSIONS).fill(0.3),
      embeddingModel: "collision-model",
    }]);
    const updatedAliases = await supabase.from("knowledge_document_aliases")
      .select("source_id")
      .eq("document_id", updated.id)
      .eq("content_hash", updatedHash);
    expect(updatedAliases.data?.map((alias) => alias.source_id).sort()).toEqual([
      `collision-a:${collision}`,
      `collision-b:${collision}`,
    ]);
    const vector = `[${Array(EMBEDDING_DIMENSIONS).fill(0.3).join(",")}]`;
    const latestMatches = await supabase.rpc("match_knowledge_chunks", {
      query_embedding: vector,
      filter_symbols: ["TEST"],
      match_count: 50,
      min_similarity: 0.1,
    });
    expect(latestMatches.error).toBeNull();
    const collisionMatches = latestMatches.data?.filter((row: { document_id: string }) =>
      row.document_id === prepared.id || row.document_id === updated.id
    );
    expect(collisionMatches?.map((row: { document_id: string }) => row.document_id)).toEqual([updated.id]);

    const concurrentVersions = await Promise.all([
      store.prepare({
        ...input,
        sourceId: `collision-a:${collision}`,
        sourceUrl: firstUrl,
        canonicalUrl: firstUrl,
        content: `${content} concurrent update A`,
        contentHash: sha256(`${content} concurrent update A`),
        processingConfigHash: "collision-config",
      }),
      store.prepare({
        ...input,
        sourceId: `collision-b:${collision}`,
        sourceUrl: secondUrl,
        canonicalUrl: secondUrl,
        content: `${content} concurrent update B`,
        contentHash: sha256(`${content} concurrent update B`),
        processingConfigHash: "collision-config",
      }),
    ]);
    expect(concurrentVersions.map((result) => result.version).sort()).toEqual([3, 4]);
    await supabase.from("knowledge_documents").delete()
      .in("source_id", [`collision-a:${collision}`, `collision-b:${collision}`]);
  });
});
