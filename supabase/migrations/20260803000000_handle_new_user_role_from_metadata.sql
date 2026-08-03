-- Signup hardening: assign the coach/solo role (and full name) atomically in the
-- new-user trigger, from auth signup metadata, instead of depending on a
-- client-side profiles upsert that runs AFTER auth.signUp and can fail (network
-- drop, closed tab) — which left a role-less profile stranded between "not a
-- coach" and "not a solo". The client upsert stays as a redundant safety net.
--
-- Also version-controls the trigger itself. It was created out-of-band (dashboard)
-- and never captured in a migration, so a fresh DB (e.g. local) had the function
-- but NO trigger — profile creation silently depended entirely on the client.
--
-- Role is whitelisted to ('coach','solo') — the only self-serve signup roles;
-- 'client' is invite-only, and anything else (or absent, e.g. OAuth) stays null
-- so the first-login role picker still runs. search_path stays pinned
-- (advisor_hardening 20260624150000).
--
-- The INSERT is idempotent (on conflict do update … coalesce): safe if prod
-- already has a second, differently-named trigger firing this same function (the
-- second fire updates instead of erroring on the duplicate id), and self-healing
-- if a role-less profile already exists (fills the role without clobbering a set one).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    new.email,
    case
      when new.raw_user_meta_data->>'role' in ('coach', 'solo')
        then new.raw_user_meta_data->>'role'
      else null
    end,
    nullif(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update set
    role = coalesce(public.profiles.role, excluded.role),
    full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
