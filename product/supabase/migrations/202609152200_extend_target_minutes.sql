-- targetMinutesForPlan only ever produces 5 (daily) or 10 (weekly) today, but
-- 15 is reserved for a future premium/weekly tier and the generation
-- pipeline already supports it — widen the constraint so that value isn't
-- blocked at the DB layer once a plan actually sets it. 7 is dropped: no
-- code path has produced it since podcast_plan-based scheduling replaced the
-- old free-form target_minutes setting.
alter table public.settings drop constraint if exists settings_target_minutes_check;
alter table public.settings add constraint settings_target_minutes_check check (target_minutes in (5, 10, 15));
alter table public.settings alter column target_minutes set default 5;

-- briefs.target_minutes is a historical snapshot (what a given episode was
-- generated at, at the time) — deliberately left unconstrained rather than
-- retroactively validated, since old rows may genuinely carry the
-- since-retired value of 7 from before the daily/weekly split.
