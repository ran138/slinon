-- Adds real accounts (Supabase Auth) and makes every table genuinely
-- per-user. Confirmed decision: discard all existing single-tenant test
-- data — this is a clean-slate migration, not a backfill.

-- ── Step A: discard existing data (must run before adding NOT NULL user_id
-- columns below — you can't add a NOT NULL column with no default to a
-- table that still has rows). Cascades through chapters/sources via their
-- existing FK on delete cascade to briefs.
truncate table public.briefs, public.assets, public.interests,
  public.settings, public.onboarding_draft cascade;

-- ── Step B: settings — singleton row (id=1) becomes one row per user.
-- The podcast_plan/schedule_time/schedule_day/schedule_timezone/
-- next_run_at/last_scheduled_at columns already exist from the earlier
-- scheduling migrations and are untouched here — only ownership changes.
alter table public.settings drop constraint settings_pkey;
alter table public.settings drop column id;
alter table public.settings
  add column user_id uuid not null references auth.users(id) on delete cascade,
  add primary key (user_id);

-- ── Step C: onboarding_draft — same singleton-to-per-user change.
alter table public.onboarding_draft drop constraint onboarding_draft_pkey;
alter table public.onboarding_draft drop column id;
alter table public.onboarding_draft
  add column user_id uuid not null references auth.users(id) on delete cascade,
  add primary key (user_id);

-- ── Step D: assets / interests / briefs get user_id.
alter table public.assets
  add column user_id uuid not null references auth.users(id) on delete cascade;
drop index if exists idx_assets_kind;
create index idx_assets_user_kind on public.assets(user_id, kind);

alter table public.interests
  add column user_id uuid not null references auth.users(id) on delete cascade;
-- Was a global unique(label) — a real bug, it would block two different
-- users both having e.g. "AI" as an interest. Scope it per user instead.
alter table public.interests drop constraint interests_label_key;
alter table public.interests add constraint interests_user_label_key unique (user_id, label);

alter table public.briefs
  add column user_id uuid not null references auth.users(id) on delete cascade;
drop index if exists idx_briefs_status_created;
create index idx_briefs_user_status_created on public.briefs(user_id, status, created_at desc);

-- chapters/sources intentionally get NO user_id column — ownership stays
-- inherited via brief_id -> briefs.user_id, avoiding denormalization.

-- ── Step E: public.profiles, synced from auth.users on signup.
-- Gives the app a joinable identity table (display name/avatar/email)
-- without ever needing to grant direct reads on auth.users.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Step F: replace_profile RPC scoped to one user instead of wiping
-- every user's assets/interests. Signature gains p_user_id; the
-- podcast_plan/schedule_* fields stay outside this RPC exactly as they
-- already were (written directly by the API route via .update()).
create or replace function public.replace_profile(
  p_user_id uuid,
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
  v_now timestamptz := now();
begin
  delete from public.assets where user_id = p_user_id;
  delete from public.interests where user_id = p_user_id;

  for item in select value from jsonb_array_elements(coalesce(p_assets, '[]'::jsonb)) loop
    insert into public.assets (
      id, user_id, kind, name, symbol, asset_class, exchange, quantity, average_cost, currency, created_at, updated_at
    ) values (
      (item->>'id')::uuid, p_user_id, item->>'kind', item->>'name', item->>'symbol', item->>'asset_class',
      item->>'exchange', item->>'quantity', item->>'average_cost', item->>'currency', v_now, v_now
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_interests, '[]'::jsonb)) loop
    insert into public.interests (id, user_id, label, custom, created_at)
    values ((item->>'id')::uuid, p_user_id, item->>'label', coalesce((item->>'custom')::boolean, false), v_now);
  end loop;

  insert into public.settings (user_id, target_minutes, onboarding_complete, updated_at)
  values (p_user_id, p_target_minutes, p_onboarding_complete, v_now)
  on conflict (user_id) do update set
    target_minutes = excluded.target_minutes,
    onboarding_complete = excluded.onboarding_complete,
    updated_at = excluded.updated_at;
end;
$$;

-- ── Step G: reset_brief_generation gains an ownership check.
create or replace function public.reset_brief_generation(p_id uuid, p_user_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sources where brief_id = p_id
    and exists (select 1 from public.briefs b where b.id = p_id and b.user_id = p_user_id);
  delete from public.chapters where brief_id = p_id
    and exists (select 1 from public.briefs b where b.id = p_id and b.user_id = p_user_id);
  update public.briefs set
    title = null,
    research_dossier = null,
    duration_ms = null,
    error_code = null,
    error_message = null,
    completed_at = null
  where id = p_id and user_id = p_user_id;
end;
$$;

revoke all on function public.replace_profile(uuid, jsonb, jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.reset_brief_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.replace_profile(uuid, jsonb, jsonb, integer, boolean) to service_role;
grant execute on function public.reset_brief_generation(uuid, uuid) to service_role;

-- ── Step H: RLS as defense-in-depth. Real reads/writes keep going through
-- the service-role client with explicit user_id filters (unchanged
-- architecture) — this is a safety net only, in case a client-side direct-
-- Supabase path is ever added later, or a key leaks. SELECT-only: writes
-- stay exclusively server-validated.
grant select on public.settings to authenticated;
create policy "select own settings" on public.settings for select using (auth.uid() = user_id);

grant select on public.onboarding_draft to authenticated;
create policy "select own onboarding_draft" on public.onboarding_draft for select using (auth.uid() = user_id);

grant select on public.assets to authenticated;
create policy "select own assets" on public.assets for select using (auth.uid() = user_id);

grant select on public.interests to authenticated;
create policy "select own interests" on public.interests for select using (auth.uid() = user_id);

grant select on public.briefs to authenticated;
create policy "select own briefs" on public.briefs for select using (auth.uid() = user_id);

grant select on public.chapters to authenticated;
create policy "select own chapters" on public.chapters for select using (
  exists (select 1 from public.briefs b where b.id = chapters.brief_id and b.user_id = auth.uid())
);

grant select on public.sources to authenticated;
create policy "select own sources" on public.sources for select using (
  exists (select 1 from public.briefs b where b.id = sources.brief_id and b.user_id = auth.uid())
);

grant select on public.profiles to authenticated;
create policy "select own profile" on public.profiles for select using (auth.uid() = user_id);

-- knowledge_documents / knowledge_ingestion_runs / match_knowledge_documents
-- (shared RAG corpus) and collected_items / podcast_cache (dead code) are
-- intentionally untouched here.
