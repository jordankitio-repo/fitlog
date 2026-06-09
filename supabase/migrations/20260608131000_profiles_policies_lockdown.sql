-- The previous migration replaced the SELECT-command policies, but a permissive
-- FOR ALL (cmd='ALL') policy still grants read to every authenticated user, so
-- profile rows were still enumerable. Rebuild the full profiles policy set to a
-- known-good minimal state: scoped SELECT + own-row INSERT/UPDATE. Deletes go
-- through the service-role delete-account function, so no client DELETE policy.
--
-- The is_profile_related() helper was created in 20260608130000.

-- Surface whatever exists now (visible in `db push` output), then drop all of it.
do $$
declare pol record;
begin
  for pol in
    select policyname, cmd, roles::text as roles, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    raise notice 'existing profiles policy: name=% cmd=% roles=% qual=% check=%',
      pol.policyname, pol.cmd, pol.roles, coalesce(pol.qual, '-'), coalesce(pol.with_check, '-');
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;
end $$;

-- Read: own profile or an active coach<->client counterpart only.
create policy "profiles_select_self_or_related"
  on public.profiles
  for select
  to authenticated
  using ( public.is_profile_related(id) );

-- Insert: only your own row (signup / role pick).
create policy "profiles_insert_self"
  on public.profiles
  for insert
  to authenticated
  with check ( id = auth.uid() );

-- Update: only your own row (profile edits).
create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using ( id = auth.uid() )
  with check ( id = auth.uid() );
