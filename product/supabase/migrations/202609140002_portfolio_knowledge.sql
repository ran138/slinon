create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source_site text not null check (source_site in ('calcalist', 'ynet', 'sec_edgar')),
  source_kind text not null check (source_kind in ('news', 'financial_report')),
  source_url text not null unique,
  title text not null,
  published_at timestamptz,
  accessed_at timestamptz not null default now(),
  content text not null,
  symbols text[] not null default '{}',
  topics text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1536) not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored
);

create index if not exists idx_knowledge_documents_source_site
  on public.knowledge_documents(source_site, accessed_at desc);
create index if not exists idx_knowledge_documents_symbols
  on public.knowledge_documents using gin(symbols);
create index if not exists idx_knowledge_documents_search
  on public.knowledge_documents using gin(search_document);
create index if not exists idx_knowledge_documents_embedding
  on public.knowledge_documents using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists public.knowledge_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('running', 'completed', 'failed')),
  portfolio_symbols text[] not null,
  source_counts jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

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
    document.metadata,
    1 - (document.embedding OPERATOR(extensions.<=>) query_embedding) as similarity
  from public.knowledge_documents as document
  where (filter_symbols is null or cardinality(filter_symbols) = 0 or document.symbols && filter_symbols)
    and 1 - (document.embedding OPERATOR(extensions.<=>) query_embedding) >= min_similarity
  order by document.embedding OPERATOR(extensions.<=>) query_embedding
  limit greatest(1, least(match_count, 50));
$$;

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_ingestion_runs enable row level security;

revoke all on table public.knowledge_documents, public.knowledge_ingestion_runs from anon, authenticated;
grant all on table public.knowledge_documents, public.knowledge_ingestion_runs to service_role;
revoke all on function public.match_knowledge_documents(extensions.vector, text[], integer, double precision)
  from public, anon, authenticated;
grant execute on function public.match_knowledge_documents(extensions.vector, text[], integer, double precision)
  to service_role;
