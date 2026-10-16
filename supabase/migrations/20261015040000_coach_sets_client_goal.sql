-- A client's primary goal becomes coach-owned (the client sees it read-only,
-- exactly as Daily targets already works). That needs a write path, and there
-- was none: `targets` carries an explicit "Coaches can set targets for their
-- clients" policy, but `profiles` carries only `profiles_update_self`
-- (id = auth.uid()), so a coach cannot write a client's profile row at all.
--
-- The obvious fix is the wrong one. An UPDATE policy on `profiles` for coaches
-- is ROW-level, so it would hand a coach every column on that row — full_name,
-- email, role. Granting write access to a person's role column to change their
-- training goal is not a trade worth making.
--
-- So: a SECURITY DEFINER function with exactly one column in its UPDATE. It is
-- definer (unlike client_last_log_dates, which is invoker) because the whole
-- point is to perform a write the caller's own policies forbid — which is also
-- why it has to do its own authorisation. Two checks, both load-bearing:
--   1. the caller is an ACTIVE coach of this client (same test the targets
--      policy applies, so revoked coaches lose this the moment they lose that);
--   2. the goal is one of the four keys the UI offers, so a definer function
--      cannot be used to write arbitrary text into a profile.
create or replace function public.set_client_primary_goal(p_client_id uuid, p_goal text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.coach_clients
    where coach_id = auth.uid()
      and client_id = p_client_id
      and status = 'active'
  ) then
    raise exception 'not an active coach for this client';
  end if;

  -- These four keys are the UI's GOALS list (src/utils/goals.js), which cannot
  -- be imported here. Changing either one means changing both; goals.test.js
  -- asserts the key set so the pair cannot drift silently.
  if p_goal is not null and p_goal not in ('lose', 'gain', 'maintain', 'recomp') then
    raise exception 'invalid goal: %', p_goal;
  end if;

  update public.profiles set primary_goal = p_goal where id = p_client_id;
end;
$$;

revoke all on function public.set_client_primary_goal(uuid, text) from public;
grant execute on function public.set_client_primary_goal(uuid, text) to authenticated;
