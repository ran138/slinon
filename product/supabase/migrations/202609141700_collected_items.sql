-- Backing table for lib/podcast/dataSource.ts: the pool of verified, sourced
-- news/market items an ingestion job writes here (topic-tagged, timestamped),
-- which the podcast script generator reads from before calling the LLM.
-- Nothing ingests into this table yet — that's a separate, not-yet-built job
-- (see dataSource.ts). This migration only makes the table exist so the
-- generator can query it instead of the local fixture file.

create table if not exists public.collected_items (
  id uuid primary key default gen_random_uuid(),
  topic_kind text not null check (topic_kind in ('holding', 'watchlist', 'interest')),
  topic_label text not null,
  occurred_at timestamptz not null,
  headline text not null,
  summary text not null,
  numeric_facts jsonb not null default '[]'::jsonb,
  source_url text,
  source_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_collected_items_topic on public.collected_items(topic_kind, topic_label);
create index if not exists idx_collected_items_occurred on public.collected_items(occurred_at);

alter table public.collected_items enable row level security;

revoke all on table public.collected_items from anon, authenticated;
grant all on table public.collected_items to service_role;
