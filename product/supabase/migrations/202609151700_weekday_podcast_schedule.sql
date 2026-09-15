update public.settings
set schedule_day = case
  when podcast_plan = 'weekly' and schedule_day between 1 and 5 then schedule_day
  when podcast_plan = 'weekly' then 1
  else null
end;

alter table public.settings
  drop constraint if exists settings_schedule_day_check;

alter table public.settings
  add constraint settings_schedule_day_check
  check (schedule_day is null or schedule_day between 1 and 5);
