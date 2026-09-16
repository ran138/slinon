import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.POSTGRES_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const vector = `[${Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0).join(",")}]`;

describeDatabase("versioned knowledge chunks", () => {
  const sql = postgres(databaseUrl!, { max: 2 });
  const sourceId = `integration:${crypto.randomUUID()}`;
  let documentId: string;

  beforeAll(async () => {
    const [document] = await sql<{ id: string }[]>`
      insert into public.knowledge_documents (
        source_site, source_kind, source_url, canonical_url, source_id, title,
        content, content_hash, version, processing_status, symbols, topics, embedding, embedding_model
      ) values (
        'cnbc', 'news', ${`https://www.cnbc.com/${sourceId}`}, ${`https://www.cnbc.com/${sourceId}`},
        ${sourceId}, 'Integration document', 'Full body', 'body-hash-1', 1, 'chunked', array['TEST'], array['markets'],
        ${vector}::extensions.vector, 'legacy-model'
      ) returning id
    `;
    documentId = document.id;
  });

  afterAll(async () => {
    await sql`delete from public.knowledge_documents where source_id = ${sourceId}`;
    await sql.end();
  });

  it("prevents duplicate canonical content across source IDs and duplicate chunk embeddings", async () => {
    await expect(sql`
      insert into public.knowledge_documents (
        source_site, source_kind, source_url, canonical_url, source_id, title,
        content, content_hash, version, processing_status
      ) values (
        'cnbc', 'news', ${`https://www.cnbc.com/${sourceId}?duplicate=1`}, ${`https://www.cnbc.com/${sourceId}`},
        ${`${sourceId}:different`}, 'Duplicate', 'Full body', 'body-hash-1', 1, 'extracted'
      )
    `).rejects.toThrow();

    await sql`
      insert into public.knowledge_chunks (
        document_id, chunk_index, content, content_hash, token_count, embedding, embedding_model
      ) values (${documentId}::uuid, 0, 'First chunk', 'chunk-hash-1', 2, ${vector}::extensions.vector, 'test-model')
    `;
    await expect(sql`
      insert into public.knowledge_chunks (
        document_id, chunk_index, content, content_hash, token_count, embedding, embedding_model
      ) values (${documentId}::uuid, 1, 'First chunk', 'chunk-hash-1', 2, ${vector}::extensions.vector, 'test-model')
    `).rejects.toThrow();
  });

  it("returns chunks with their source document", async () => {
    await sql`update public.knowledge_documents set processing_status = 'ready' where id = ${documentId}::uuid`;
    const rows = await sql`
      select * from public.match_knowledge_chunks(${vector}::extensions.vector, array['TEST'], 5, 0.1)
      where document_id = ${documentId}::uuid
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "Integration document", content: "First chunk", chunk_index: 0 });
  });

  it("searches only the latest chunk version while preserving the latest usable legacy embedding", async () => {
    const [newer] = await sql<{ id: string }[]>`
      insert into public.knowledge_documents (
        source_site, source_kind, source_url, canonical_url, source_id, title,
        content, content_hash, version, processing_status, symbols, topics
      ) values (
        'cnbc', 'news', ${`https://www.cnbc.com/${sourceId}?v=2`}, ${`https://www.cnbc.com/${sourceId}`},
        ${sourceId}, 'Integration document v2', 'Changed body', 'body-hash-2', 2, 'ready', array['TEST'], array['markets']
      ) returning id
    `;
    await sql`
      insert into public.knowledge_chunks (
        document_id, chunk_index, content, content_hash, token_count, embedding, embedding_model
      ) values (${newer.id}::uuid, 0, 'Newest chunk', 'chunk-hash-2', 2, ${vector}::extensions.vector, 'test-model')
    `;
    const chunks = await sql`
      select * from public.match_knowledge_chunks(${vector}::extensions.vector, array['TEST'], 5, 0.1)
      where source_url like ${`%${sourceId}%`}
    `;
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ document_id: newer.id, content: "Newest chunk" });

    const legacy = await sql`
      select * from public.match_knowledge_documents(${vector}::extensions.vector, array['TEST'], 5, 0.1)
      where source_url = ${`https://www.cnbc.com/${sourceId}`}
    `;
    expect(legacy).toHaveLength(1);
    expect(legacy[0]).toMatchObject({ id: documentId, title: "Integration document" });

    await sql`
      insert into public.knowledge_documents (
        source_site, source_kind, source_url, canonical_url, source_id, title,
        content, content_hash, version, processing_status, symbols, topics, embedding, embedding_model
      ) values (
        'cnbc', 'news', ${`https://www.cnbc.com/${sourceId}?v=3`}, ${`https://www.cnbc.com/${sourceId}?canonical=v3`},
        ${sourceId}, 'Legacy-only v3', 'Legacy body', 'body-hash-3', 3, 'ready', array['TEST'], array['markets'],
        ${vector}::extensions.vector, 'legacy-model'
      )
    `;
    const chunksAfterLegacy = await sql`
      select * from public.match_knowledge_chunks(${vector}::extensions.vector, array['TEST'], 5, 0.1)
      where source_url like ${`%${sourceId}%`}
    `;
    expect(chunksAfterLegacy).toHaveLength(1);
    expect(chunksAfterLegacy[0]).toMatchObject({ document_id: newer.id, content: "Newest chunk" });
  });

  it("enforces news and filing batch limits for daily and backfill runs", async () => {
    await expect(sql`
      insert into public.knowledge_ingestion_runs (
        status, portfolio_symbols, news_saved_count, filing_saved_count
      ) values ('running', array[]::text[], 51, 0)
    `).rejects.toThrow();
    await expect(sql`
      insert into public.knowledge_ingestion_runs (
        status, portfolio_symbols, run_type, news_saved_count, filing_saved_count
      ) values ('running', array[]::text[], 'backfill', 0, 51)
    `).rejects.toThrow();
  });
});
