-- Dedup cache for lib/podcast/cache.ts: maps a content hash (topics + window +
-- fetched item ids) to the brief it already produced, so re-requesting the
-- same window doesn't regenerate (and re-bill OpenAI for) an identical episode.
-- Kept as its own table rather than reusing `briefs` so a cache miss/hit never
-- depends on any product-facing table's shape.

create table if not exists public.podcast_cache (
  hash text primary key,
  brief_id uuid not null references public.briefs(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.podcast_cache enable row level security;
revoke all on table public.podcast_cache from anon, authenticated;
grant all on table public.podcast_cache to service_role;
