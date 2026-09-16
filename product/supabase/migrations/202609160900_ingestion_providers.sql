create table public.ingestion_provider_config (
  provider text primary key check (provider in ('decodo', 'firecrawl', 'scraperapi')),
  priority smallint not null unique check (priority > 0),
  enabled boolean not null default true,
  monthly_limit integer not null check (monthly_limit >= 0),
  paid_usage_enabled boolean not null default false check (paid_usage_enabled = false),
  updated_at timestamptz not null default now()
);

insert into public.ingestion_provider_config (provider, priority, monthly_limit)
values
  ('decodo', 1, 2000),
  ('firecrawl', 2, 1000),
  ('scraperapi', 3, 1000)
on conflict (provider) do nothing;

create table public.ingestion_provider_usage (
  provider text not null references public.ingestion_provider_config(provider) on delete cascade,
  period_start date not null,
  used_credits integer not null default 0 check (used_credits >= 0),
  updated_at timestamptz not null default now(),
  primary key (provider, period_start)
);

create table public.ingestion_provider_state (
  provider text primary key references public.ingestion_provider_config(provider) on delete cascade,
  state text not null default 'active'
    check (state in ('active', 'cooldown', 'monthly_quota_exhausted', 'misconfigured', 'disabled')),
  unavailable_until timestamptz,
  last_failure_code text,
  last_failure_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.ingestion_provider_state (provider)
select provider from public.ingestion_provider_config
on conflict (provider) do nothing;

create table public.ingestion_extraction_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.knowledge_ingestion_runs(id) on delete set null,
  source_url text not null,
  provider text not null references public.ingestion_provider_config(provider),
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('started', 'succeeded', 'failed', 'skipped')),
  failure_code text,
  credits_reserved integer not null default 0 check (credits_reserved >= 0),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index idx_ingestion_extraction_attempts_run
  on public.ingestion_extraction_attempts(run_id, started_at);

create table public.ingestion_failed_items (
  source_site text not null,
  source_id text not null,
  run_id uuid references public.knowledge_ingestion_runs(id) on delete set null,
  source_url text not null,
  title text not null,
  failure_code text not null,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  primary key (source_site, source_id)
);

create or replace function public.reserve_ingestion_provider_credits(
  p_provider text,
  p_credits integer default 1,
  p_now timestamptz default now()
) returns table (
  reserved boolean,
  used_credits integer,
  monthly_limit integer,
  unavailable_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := date_trunc('month', p_now at time zone 'UTC')::date;
  v_next_period timestamptz := (date_trunc('month', p_now at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_limit integer;
  v_enabled boolean;
  v_state text;
  v_unavailable_until timestamptz;
  v_used integer;
begin
  if p_credits <= 0 then
    raise exception 'p_credits must be positive';
  end if;

  select config.monthly_limit, config.enabled
    into v_limit, v_enabled
  from public.ingestion_provider_config as config
  where config.provider = p_provider
  for update;

  if not found then
    return query select false, 0, 0, null::timestamptz;
    return;
  end if;

  select provider_state.state, provider_state.unavailable_until
    into v_state, v_unavailable_until
  from public.ingestion_provider_state as provider_state
  where provider_state.provider = p_provider
  for update;

  if not v_enabled or v_state in ('misconfigured', 'disabled')
    or (v_unavailable_until is not null and v_unavailable_until > p_now) then
    select coalesce(usage.used_credits, 0) into v_used
    from public.ingestion_provider_usage as usage
    where usage.provider = p_provider and usage.period_start = v_period_start;
    return query select false, coalesce(v_used, 0), v_limit, v_unavailable_until;
    return;
  end if;

  if v_state in ('cooldown', 'monthly_quota_exhausted')
    and (v_unavailable_until is null or v_unavailable_until <= p_now) then
    update public.ingestion_provider_state
      set state = 'active', unavailable_until = null, last_failure_code = null, updated_at = p_now
    where provider = p_provider;
  end if;

  insert into public.ingestion_provider_usage (provider, period_start)
  values (p_provider, v_period_start)
  on conflict (provider, period_start) do nothing;

  update public.ingestion_provider_usage as usage
    set used_credits = usage.used_credits + p_credits,
        updated_at = p_now
  where usage.provider = p_provider
    and usage.period_start = v_period_start
    and usage.used_credits + p_credits <= v_limit
  returning usage.used_credits into v_used;

  if found then
    if v_used >= v_limit then
      update public.ingestion_provider_state
        set state = 'monthly_quota_exhausted',
            unavailable_until = v_next_period,
            last_failure_code = 'quota_exhausted',
            last_failure_at = p_now,
            updated_at = p_now
      where provider = p_provider;
    end if;
    return query select true, v_used, v_limit,
      case when v_used >= v_limit then v_next_period else null::timestamptz end;
    return;
  end if;

  select usage.used_credits into v_used
  from public.ingestion_provider_usage as usage
  where usage.provider = p_provider and usage.period_start = v_period_start;

  update public.ingestion_provider_state
    set state = 'monthly_quota_exhausted',
        unavailable_until = v_next_period,
        last_failure_code = 'quota_exhausted',
        last_failure_at = p_now,
        updated_at = p_now
  where provider = p_provider;

  return query select false, coalesce(v_used, 0), v_limit, v_next_period;
end;
$$;

create or replace function public.record_ingestion_provider_failure(
  p_provider text,
  p_failure_code text,
  p_unavailable_until timestamptz default null,
  p_now timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_until timestamptz;
begin
  if p_failure_code in ('quota_exhausted', 'payment_required') then
    v_state := 'monthly_quota_exhausted';
    v_until := coalesce(
      p_unavailable_until,
      (date_trunc('month', p_now at time zone 'UTC') + interval '1 month') at time zone 'UTC'
    );
  elsif p_failure_code = 'authentication_error' then
    v_state := 'misconfigured';
    v_until := null;
  elsif p_failure_code = 'rate_limited' and p_unavailable_until is not null then
    v_state := 'cooldown';
    v_until := p_unavailable_until;
  else
    update public.ingestion_provider_state
      set last_failure_code = p_failure_code, last_failure_at = p_now, updated_at = p_now
    where provider = p_provider;
    return;
  end if;

  update public.ingestion_provider_state
    set state = v_state,
        unavailable_until = v_until,
        last_failure_code = p_failure_code,
        last_failure_at = p_now,
        updated_at = p_now
  where provider = p_provider;
end;
$$;

alter table public.ingestion_provider_config enable row level security;
alter table public.ingestion_provider_usage enable row level security;
alter table public.ingestion_provider_state enable row level security;
alter table public.ingestion_extraction_attempts enable row level security;
alter table public.ingestion_failed_items enable row level security;

revoke all on table public.ingestion_provider_config, public.ingestion_provider_usage,
  public.ingestion_provider_state, public.ingestion_extraction_attempts from anon, authenticated;
revoke all on table public.ingestion_failed_items from anon, authenticated;
grant all on table public.ingestion_provider_config, public.ingestion_provider_usage,
  public.ingestion_provider_state, public.ingestion_extraction_attempts to service_role;
grant all on table public.ingestion_failed_items to service_role;
revoke all on function public.reserve_ingestion_provider_credits(text, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_ingestion_provider_credits(text, integer, timestamptz)
  to service_role;
revoke all on function public.record_ingestion_provider_failure(text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_ingestion_provider_failure(text, text, timestamptz, timestamptz)
  to service_role;
