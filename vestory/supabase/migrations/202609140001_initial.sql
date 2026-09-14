create extension if not exists pgcrypto;

create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  language text not null default 'he',
  target_minutes integer not null default 7 check (target_minutes in (5, 7, 10)),
  onboarding_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_draft (
  id smallint primary key check (id = 1),
  portfolio_text text not null default '',
  assets_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key,
  kind text not null check (kind in ('holding', 'watchlist')),
  name text not null,
  symbol text not null,
  asset_class text,
  exchange text,
  quantity text,
  average_cost text,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_assets_kind on public.assets(kind);

create table if not exists public.interests (
  id uuid primary key,
  label text not null unique,
  custom boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.briefs (
  id uuid primary key,
  status text not null check (status in ('queued', 'researching', 'scripting', 'synthesizing', 'completed', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  stage_label text not null,
  title text,
  profile_snapshot jsonb not null,
  research_dossier text,
  target_minutes integer not null,
  duration_ms integer,
  error_code text,
  error_message text,
  retry_of uuid references public.briefs(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_briefs_status_created on public.briefs(status, created_at desc);

create table if not exists public.chapters (
  id uuid primary key,
  brief_id uuid not null references public.briefs(id) on delete cascade,
  position integer not null,
  title text not null,
  script text not null,
  reason_kind text not null,
  reason_label text not null,
  audio_file text,
  duration_ms integer,
  start_ms integer not null default 0,
  unique (brief_id, position)
);
create index if not exists idx_chapters_brief_position on public.chapters(brief_id, position);

create table if not exists public.sources (
  id uuid primary key,
  brief_id uuid not null references public.briefs(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  title text not null,
  publisher text,
  url text not null,
  published_at timestamptz,
  accessed_at timestamptz not null default now()
);
create index if not exists idx_sources_brief on public.sources(brief_id);

insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.settings enable row level security;
alter table public.onboarding_draft enable row level security;
alter table public.assets enable row level security;
alter table public.interests enable row level security;
alter table public.briefs enable row level security;
alter table public.chapters enable row level security;
alter table public.sources enable row level security;

revoke all on table public.settings, public.onboarding_draft, public.assets, public.interests,
  public.briefs, public.chapters, public.sources from anon, authenticated;
grant all on table public.settings, public.onboarding_draft, public.assets, public.interests,
  public.briefs, public.chapters, public.sources to service_role;

create or replace function public.replace_profile(
  p_assets jsonb,
  p_interests jsonb,
  p_target_minutes integer,
  p_onboarding_complete boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  current_time timestamptz := now();
begin
  delete from public.assets;
  delete from public.interests;

  for item in select value from jsonb_array_elements(coalesce(p_assets, '[]'::jsonb)) loop
    insert into public.assets (
      id, kind, name, symbol, asset_class, exchange, quantity, average_cost, currency, created_at, updated_at
    ) values (
      (item->>'id')::uuid, item->>'kind', item->>'name', item->>'symbol', item->>'asset_class',
      item->>'exchange', item->>'quantity', item->>'average_cost', item->>'currency', current_time, current_time
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_interests, '[]'::jsonb)) loop
    insert into public.interests (id, label, custom, created_at)
    values ((item->>'id')::uuid, item->>'label', coalesce((item->>'custom')::boolean, false), current_time);
  end loop;

  insert into public.settings (id, target_minutes, onboarding_complete, updated_at)
  values (1, p_target_minutes, p_onboarding_complete, current_time)
  on conflict (id) do update set
    target_minutes = excluded.target_minutes,
    onboarding_complete = excluded.onboarding_complete,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.reset_brief_generation(p_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sources where brief_id = p_id;
  delete from public.chapters where brief_id = p_id;
  update public.briefs set
    title = null,
    research_dossier = null,
    duration_ms = null,
    error_code = null,
    error_message = null,
    completed_at = null
  where id = p_id;
end;
$$;

revoke all on function public.replace_profile(jsonb, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.reset_brief_generation(uuid) from public, anon, authenticated;
grant execute on function public.replace_profile(jsonb, jsonb, integer, boolean) to service_role;
grant execute on function public.reset_brief_generation(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vestory-audio', 'vestory-audio', false, 52428800, array['audio/mpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
