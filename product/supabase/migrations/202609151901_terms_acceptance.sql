-- Surfaces terms/privacy acceptance as a real, queryable column instead of
-- leaving it buried in auth.users.raw_user_meta_data — a legal record of
-- consent should be easy to actually query.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, display_name, avatar_url, terms_accepted_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
  )
  on conflict (user_id) do update set
    terms_accepted_at = coalesce(public.profiles.terms_accepted_at, excluded.terms_accepted_at);
  return new;
end;
$$;
