create extension if not exists pgcrypto with schema extensions;

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_source_site_check;
alter table public.knowledge_documents
  add constraint knowledge_documents_source_site_check check (
    source_site in (
      'calcalist', 'ynet', 'globes', 'themarker', 'reuters', 'cnbc', 'yahoo_finance', 'sec_edgar'
    )
  );

alter table public.knowledge_documents
  alter column embedding drop not null,
  alter column embedding_model drop not null,
  drop constraint if exists knowledge_documents_source_url_key,
  add column if not exists canonical_url text,
  add column if not exists source_id text,
  add column if not exists content_hash text,
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists processing_status text not null default 'ready'
    check (processing_status in ('discovered', 'extracted', 'chunked', 'ready', 'failed')),
  add column if not exists processing_token uuid,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_config_hash text,
  add column if not exists pending_processing_config_hash text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

update public.knowledge_documents
set canonical_url = coalesce(canonical_url, source_url),
    source_id = coalesce(source_id, source_site || ':' || encode(extensions.digest(source_url, 'sha256'), 'hex')),
    content_hash = coalesce(content_hash, encode(extensions.digest(content, 'sha256'), 'hex'))
where canonical_url is null or source_id is null or content_hash is null;

alter table public.knowledge_documents
  alter column canonical_url set not null,
  alter column source_id set not null,
  alter column content_hash set not null;

create unique index if not exists idx_knowledge_documents_source_version
  on public.knowledge_documents(source_site, source_id, version);
create unique index if not exists idx_knowledge_documents_content_identity
  on public.knowledge_documents(source_site, source_id, content_hash);
create unique index if not exists idx_knowledge_documents_canonical_content
  on public.knowledge_documents(canonical_url, content_hash);
create index if not exists idx_knowledge_documents_canonical_url
  on public.knowledge_documents(canonical_url);
create index if not exists idx_knowledge_documents_processing_status
  on public.knowledge_documents(processing_status, accessed_at desc);

create table if not exists public.knowledge_document_aliases (
  source_site text not null,
  source_id text not null,
  content_hash text not null,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (source_site, source_id, content_hash)
);

create index if not exists idx_knowledge_document_aliases_document
  on public.knowledge_document_aliases(document_id);

insert into public.knowledge_document_aliases (source_site, source_id, content_hash, document_id)
select source_site, source_id, content_hash, id from public.knowledge_documents
on conflict (source_site, source_id, content_hash) do update set document_id = excluded.document_id;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (length(btrim(content)) > 0),
  content_hash text not null,
  token_count integer not null check (token_count > 0),
  embedding extensions.vector(1536) not null,
  embedding_model text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index),
  unique (document_id, content_hash)
);

create index if not exists idx_knowledge_chunks_document
  on public.knowledge_chunks(document_id, chunk_index);
create index if not exists idx_knowledge_chunks_embedding
  on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.prepare_knowledge_document(
  p_source_site text, p_source_kind text, p_source_url text, p_canonical_url text,
  p_source_id text, p_title text, p_published_at timestamptz, p_content text,
  p_content_hash text, p_symbols text[], p_topics text[], p_metadata jsonb,
  p_source_metadata jsonb, p_processing_config_hash text, p_now timestamptz default now()
) returns table (id uuid, version integer, unchanged boolean, in_progress boolean, owner_token uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_document public.knowledge_documents%rowtype;
  v_canonical public.knowledge_documents%rowtype;
  v_stable public.knowledge_documents%rowtype;
  v_version integer;
  v_token uuid;
  v_family_key text;
begin
  -- Canonical and stable identities can point at two rows in opposite order.
  -- Serialize the short reconciliation transaction to prevent crossed row-lock
  -- deadlocks and to keep alias-family version allocation strictly monotonic.
  perform pg_advisory_xact_lock(hashtextextended('knowledge-document-identity-reconciliation', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_canonical_url || ':' || p_content_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_source_site || ':' || p_source_id, 0));
  select min(family_alias.source_site || ':' || family_alias.source_id) into v_family_key
  from public.knowledge_document_aliases as anchor_alias
  join public.knowledge_document_aliases as family_alias on family_alias.document_id = anchor_alias.document_id
  where anchor_alias.source_site = p_source_site and anchor_alias.source_id = p_source_id;
  if v_family_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('knowledge-family:' || v_family_key, 0));
  end if;
  select * into v_canonical from public.knowledge_documents
  where canonical_url = p_canonical_url and content_hash = p_content_hash
  order by version desc limit 1 for update;
  select document.* into v_stable from public.knowledge_documents as document
  where document.content_hash = p_content_hash and (
    (document.source_site = p_source_site and document.source_id = p_source_id)
    or exists (
      select 1 from public.knowledge_document_aliases as alias
      where alias.source_site = p_source_site and alias.source_id = p_source_id
        and alias.content_hash = p_content_hash and alias.document_id = document.id
    )
  )
  order by case when document.source_site = p_source_site and document.source_id = p_source_id then 0 else 1 end,
    document.version desc
  limit 1 for update;

  if v_canonical.id is not null and v_stable.id is not null and v_canonical.id <> v_stable.id then
    delete from public.knowledge_document_aliases as canonical_alias
    using public.knowledge_document_aliases as stable_alias
    where canonical_alias.document_id = v_canonical.id and stable_alias.document_id = v_stable.id
      and canonical_alias.source_site = stable_alias.source_site
      and canonical_alias.source_id = stable_alias.source_id
      and canonical_alias.content_hash = stable_alias.content_hash;
    update public.knowledge_document_aliases set document_id = v_stable.id
    where document_id = v_canonical.id;
    if not exists (select 1 from public.knowledge_chunks where document_id = v_stable.id) then
      update public.knowledge_chunks set document_id = v_stable.id where document_id = v_canonical.id;
    end if;
    update public.knowledge_documents set
      metadata = metadata || v_canonical.metadata,
      source_metadata = source_metadata || v_canonical.source_metadata,
      symbols = array(select distinct unnest(symbols || v_canonical.symbols)),
      topics = array(select distinct unnest(topics || v_canonical.topics)),
      embedding = coalesce(embedding, v_canonical.embedding),
      embedding_model = coalesce(embedding_model, v_canonical.embedding_model),
      processing_status = case
        when processing_status = 'ready' or v_canonical.processing_status = 'ready' then 'ready'
        else processing_status end,
      processing_config_hash = case
        when processing_status = 'ready' then processing_config_hash
        when v_canonical.processing_status = 'ready' then v_canonical.processing_config_hash
        else coalesce(processing_config_hash, v_canonical.processing_config_hash) end
    where knowledge_documents.id = v_stable.id returning * into v_stable;
    delete from public.knowledge_documents where knowledge_documents.id = v_canonical.id;
    v_document := v_stable;
  elsif v_canonical.id is not null then
    v_document := v_canonical;
  elsif v_stable.id is not null then
    v_document := v_stable;
  end if;

  if v_document.id is not null then
    update public.knowledge_documents
    set title = p_title, published_at = coalesce(p_published_at, published_at),
        symbols = case when cardinality(p_symbols) > 0 then p_symbols else symbols end,
        topics = case when cardinality(p_topics) > 0 then p_topics else topics end,
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
        canonical_url = p_canonical_url, source_url = p_source_url,
        source_metadata = source_metadata || coalesce(p_source_metadata, '{}'::jsonb), updated_at = p_now
    where knowledge_documents.id = v_document.id returning * into v_document;
    insert into public.knowledge_document_aliases (source_site, source_id, content_hash, document_id)
    values (p_source_site, p_source_id, p_content_hash, v_document.id)
    on conflict (source_site, source_id, content_hash) do update set document_id = excluded.document_id;
    if v_document.processing_status = 'ready' and v_document.processing_config_hash = p_processing_config_hash then
      return query select v_document.id, v_document.version, true, false, null::uuid; return;
    end if;
    if v_document.processing_token is not null and v_document.processing_started_at > p_now - interval '5 minutes' then
      return query select v_document.id, v_document.version, false, true, null::uuid; return;
    end if;
    v_token := gen_random_uuid();
    update public.knowledge_documents set
      processing_status = case when processing_status = 'ready' then 'ready' else 'extracted' end,
      processing_token = v_token, processing_started_at = p_now,
      pending_processing_config_hash = p_processing_config_hash,
      source_metadata = source_metadata - 'processingError', updated_at = p_now
    where knowledge_documents.id = v_document.id;
    return query select v_document.id, v_document.version, false, false, v_token; return;
  end if;

  select coalesce(max(document.version), 0) + 1 into v_version from public.knowledge_documents as document
  where (document.source_site = p_source_site and document.source_id = p_source_id)
    or exists (
      select 1 from public.knowledge_document_aliases as alias
      where alias.source_site = p_source_site and alias.source_id = p_source_id
        and alias.document_id = document.id
    );
  v_token := gen_random_uuid();
  insert into public.knowledge_documents (
    source_site, source_kind, source_url, canonical_url, source_id, title, published_at, content, content_hash,
    version, processing_status, processing_token, processing_started_at, pending_processing_config_hash,
    symbols, topics, metadata, source_metadata
  ) values (
    p_source_site, p_source_kind, p_source_url, p_canonical_url, p_source_id, p_title, p_published_at, p_content,
    p_content_hash, v_version, 'extracted', v_token, p_now, p_processing_config_hash,
    coalesce(p_symbols, '{}'), coalesce(p_topics, '{}'), coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_source_metadata, '{}'::jsonb)
  ) returning knowledge_documents.id into v_document.id;
  insert into public.knowledge_document_aliases (source_site, source_id, content_hash, document_id)
  values (p_source_site, p_source_id, p_content_hash, v_document.id)
  on conflict (source_site, source_id, content_hash) do update set document_id = excluded.document_id;
  insert into public.knowledge_document_aliases (source_site, source_id, content_hash, document_id)
  select distinct family_alias.source_site, family_alias.source_id, p_content_hash, v_document.id
  from public.knowledge_document_aliases as anchor_alias
  join public.knowledge_document_aliases as family_alias on family_alias.document_id = anchor_alias.document_id
  where anchor_alias.source_site = p_source_site and anchor_alias.source_id = p_source_id
    and anchor_alias.document_id <> v_document.id
  on conflict (source_site, source_id, content_hash) do nothing;
  return query select v_document.id, v_version, false, false, v_token;
end; $$;

create or replace function public.commit_knowledge_chunks(
  p_document_id uuid, p_owner_token uuid, p_chunks jsonb, p_now timestamptz default now()
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0 then
    raise exception 'p_chunks must be a non-empty JSON array';
  end if;
  perform 1 from public.knowledge_documents where id = p_document_id and processing_token = p_owner_token for update;
  if not found then return false; end if;
  delete from public.knowledge_chunks where document_id = p_document_id;
  insert into public.knowledge_chunks (document_id, chunk_index, content, content_hash, token_count, embedding, embedding_model)
  select p_document_id, (item->>'index')::integer, item->>'content', item->>'contentHash',
    (item->>'tokenCount')::integer, (item->'embedding')::text::extensions.vector, item->>'embeddingModel'
  from jsonb_array_elements(p_chunks) as item;
  update public.knowledge_documents set processing_status = 'ready', processing_token = null,
    processing_started_at = null, processing_config_hash = pending_processing_config_hash,
    pending_processing_config_hash = null, source_metadata = source_metadata - 'processingError', updated_at = p_now
  where id = p_document_id;
  return true;
end; $$;

create or replace function public.fail_knowledge_processing(
  p_document_id uuid, p_owner_token uuid, p_error text, p_now timestamptz default now()
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.knowledge_documents set
    processing_status = case
      when embedding is not null
        or exists (select 1 from public.knowledge_chunks where document_id = p_document_id) then 'ready'
      else 'failed' end,
    processing_token = null, processing_started_at = null, pending_processing_config_hash = null,
    source_metadata = source_metadata || jsonb_build_object('processingError', left(p_error, 500)), updated_at = p_now
  where id = p_document_id and processing_token = p_owner_token;
  return found;
end; $$;

alter table public.knowledge_ingestion_runs
  add column if not exists run_type text not null default 'daily' check (run_type in ('daily', 'backfill')),
  add column if not exists news_candidate_count integer not null default 0 check (news_candidate_count >= 0),
  add column if not exists news_saved_count integer not null default 0 check (news_saved_count between 0 and 50),
  add column if not exists filing_saved_count integer not null default 0 check (filing_saved_count between 0 and 50),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Both daily and initial backfill runs are deliberately bounded to 50 news
-- documents and 50 filings. Backfill widens the time window, not the batch size.

create or replace function public.match_knowledge_documents(
  query_embedding extensions.vector(1536),
  filter_symbols text[] default null,
  match_count integer default 12,
  min_similarity double precision default 0.2
) returns table (
  id uuid,
  source_site text,
  source_kind text,
  source_url text,
  title text,
  published_at timestamptz,
  accessed_at timestamptz,
  content text,
  symbols text[],
  topics text[],
  metadata jsonb,
  similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    document.id,
    document.source_site,
    document.source_kind,
    document.source_url,
    document.title,
    document.published_at,
    document.accessed_at,
    document.content,
    document.symbols,
    document.topics,
    document.metadata || document.source_metadata,
    1 - (document.embedding OPERATOR(extensions.<=>) query_embedding)
  from public.knowledge_documents as document
  where document.processing_status = 'ready'
    and document.embedding is not null
    and not exists (
      select 1 from public.knowledge_documents as newer
      where newer.processing_status = 'ready'
        and newer.embedding is not null
        and newer.version > document.version
        and (
          (newer.source_site = document.source_site and newer.source_id = document.source_id)
          or exists (
            select 1
            from public.knowledge_document_aliases as document_alias
            join public.knowledge_document_aliases as newer_alias
              on newer_alias.source_site = document_alias.source_site
              and newer_alias.source_id = document_alias.source_id
            where document_alias.document_id = document.id and newer_alias.document_id = newer.id
          )
        )
    )
    and (filter_symbols is null or cardinality(filter_symbols) = 0 or document.symbols && filter_symbols)
    and 1 - (document.embedding OPERATOR(extensions.<=>) query_embedding) >= min_similarity
  order by document.embedding OPERATOR(extensions.<=>) query_embedding
  limit greatest(1, least(match_count, 50));
$$;

create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  filter_symbols text[] default null,
  match_count integer default 12,
  min_similarity double precision default 0.2
) returns table (
  chunk_id uuid,
  document_id uuid,
  source_site text,
  source_kind text,
  source_url text,
  canonical_url text,
  title text,
  published_at timestamptz,
  accessed_at timestamptz,
  content text,
  chunk_index integer,
  symbols text[],
  topics text[],
  metadata jsonb,
  similarity double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    chunk.id,
    document.id,
    document.source_site,
    document.source_kind,
    document.source_url,
    document.canonical_url,
    document.title,
    document.published_at,
    document.accessed_at,
    chunk.content,
    chunk.chunk_index,
    document.symbols,
    document.topics,
    document.metadata || document.source_metadata || chunk.metadata,
    1 - (chunk.embedding OPERATOR(extensions.<=>) query_embedding)
  from public.knowledge_chunks as chunk
  join public.knowledge_documents as document on document.id = chunk.document_id
  where document.processing_status = 'ready'
    and not exists (
      select 1 from public.knowledge_documents as newer
      where newer.processing_status = 'ready'
        and exists (select 1 from public.knowledge_chunks as newer_chunk where newer_chunk.document_id = newer.id)
        and newer.version > document.version
        and (
          (newer.source_site = document.source_site and newer.source_id = document.source_id)
          or exists (
            select 1
            from public.knowledge_document_aliases as document_alias
            join public.knowledge_document_aliases as newer_alias
              on newer_alias.source_site = document_alias.source_site
              and newer_alias.source_id = document_alias.source_id
            where document_alias.document_id = document.id and newer_alias.document_id = newer.id
          )
        )
    )
    and (filter_symbols is null or cardinality(filter_symbols) = 0 or document.symbols && filter_symbols)
    and 1 - (chunk.embedding OPERATOR(extensions.<=>) query_embedding) >= min_similarity
  order by chunk.embedding OPERATOR(extensions.<=>) query_embedding
  limit greatest(1, least(match_count, 50));
$$;

alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_document_aliases enable row level security;
revoke all on table public.knowledge_chunks from anon, authenticated;
revoke all on table public.knowledge_document_aliases from anon, authenticated;
grant all on table public.knowledge_chunks to service_role;
grant all on table public.knowledge_document_aliases to service_role;
revoke all on function public.match_knowledge_chunks(extensions.vector, text[], integer, double precision)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(extensions.vector, text[], integer, double precision)
  to service_role;
revoke all on function public.prepare_knowledge_document(text, text, text, text, text, text, timestamptz, text, text, text[], text[], jsonb, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.prepare_knowledge_document(text, text, text, text, text, text, timestamptz, text, text, text[], text[], jsonb, jsonb, text, timestamptz) to service_role;
revoke all on function public.commit_knowledge_chunks(uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.commit_knowledge_chunks(uuid, uuid, jsonb, timestamptz) to service_role;
revoke all on function public.fail_knowledge_processing(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.fail_knowledge_processing(uuid, uuid, text, timestamptz) to service_role;
