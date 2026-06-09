-- Tighten profiles SELECT so a logged-in user can only read:
--   1. their own profile, and
--   2. profiles they have an ACTIVE coach<->client relationship with.
--
-- Before this, any authenticated user could read every row in profiles
-- (email + full_name + role), i.e. enumerate all users. Anon was already
-- blocked. The only legitimate cross-profile reads in the app are coach->client
-- (ClientView, coach dashboard) and client->coach (showing the client's coach),
-- both covered below. Edge functions use the service role and bypass RLS, so
-- they are unaffected.

-- SECURITY DEFINER helper: checks the relationship while bypassing RLS, which
-- avoids policy recursion between profiles and coach_clients.
create or replace function public.is_profile_related(target uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    target = auth.uid()
    or exists (
      select 1
      from public.coach_clients cc
      where cc.status = 'active'
        and (
          (cc.coach_id = auth.uid() and cc.client_id = target)
          or (cc.client_id = auth.uid() and cc.coach_id = target)
        )
    );
$$;

revoke all on function public.is_profile_related(uuid) from public;
grant execute on function public.is_profile_related(uuid) to authenticated;

-- Drop every existing SELECT-command policy on profiles (name-agnostic), so the
-- old permissive read isn't left in place — Postgres ORs permissive policies
-- together, which would nullify the tightening. We intentionally do NOT touch
-- cmd='ALL' or write policies, so profile inserts/updates (signup, role pick,
-- targets) cannot break. If a permissive FOR ALL policy also exposes reads, the
-- post-push probe will still show a leak and we'll replace it precisely.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.profiles', pol.policyname);
    raise notice 'dropped profiles policy: %', pol.policyname;
  end loop;
end $$;

create policy "profiles_select_self_or_related"
  on public.profiles
  for select
  to authenticated
  using ( public.is_profile_related(id) );
