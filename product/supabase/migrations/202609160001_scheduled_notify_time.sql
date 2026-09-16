-- Decouples "podcast finished generating" from "email sent" for
-- scheduler-triggered briefs: generation now starts a fixed lead time before
-- the user's chosen delivery time, but the ready email should land close to
-- that chosen time, not immediately whenever generation happens to finish
-- (which is often several minutes earlier). notify_at is the target send
-- time (null for interactive "generate now" briefs, which still notify
-- immediately on completion); notified_at records when it actually sent, so
-- the scheduler's periodic sweep never double-sends.
alter table public.briefs
  add column if not exists notify_at timestamptz,
  add column if not exists notified_at timestamptz;

create index if not exists idx_briefs_due_notification
  on public.briefs (notify_at)
  where status = 'completed' and notified_at is null;
