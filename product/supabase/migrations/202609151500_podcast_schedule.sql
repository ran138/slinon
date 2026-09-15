alter table public.settings
  add column if not exists podcast_plan text not null default 'daily',
  add column if not exists schedule_time time not null default '07:00',
  add column if not exists schedule_day smallint,
  add column if not exists schedule_timezone text not null default 'Asia/Jerusalem',
  add column if not exists next_run_at timestamptz,
  add column if not exists last_scheduled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'settings_podcast_plan_check'
  ) then
    alter table public.settings
      add constraint settings_podcast_plan_check check (podcast_plan in ('daily', 'weekly'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'settings_schedule_day_check'
  ) then
    alter table public.settings
      add constraint settings_schedule_day_check check (schedule_day is null or schedule_day between 0 and 6);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'settings_schedule_timezone_check'
  ) then
    alter table public.settings
      add constraint settings_schedule_timezone_check check (schedule_timezone = 'Asia/Jerusalem');
  end if;
end $$;

update public.settings
set target_minutes = case when podcast_plan = 'daily' then 5 else 10 end
where id = 1;
