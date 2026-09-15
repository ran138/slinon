-- Per-user toggle for "email me when my podcast is ready", surfaced in
-- the preferences screen. Defaults to on so existing users start notified.
alter table public.settings
  add column if not exists notify_email boolean not null default true;
