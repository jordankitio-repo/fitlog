-- A coached client's targets and primary goal belong to the coach.
--
-- WHAT WAS WRONG. The screens said so (the client's Daily targets read "Set by
-- your coach"; the coach's form says "Your client sees this but cannot change
-- it") and the database did not. "Users can manage their own targets" was one
-- policy for every verb, and profiles_update_self covers every column, so a
-- client could PATCH their own calories or goal with the anon key and their
-- session, and the coach's plan changed under them without a trace. Measured
-- on a seeded roster on 2026-10-26: both writes returned the new row.
--
-- THE RULE. While a client has an ACTIVE coach and has finished setup, they
-- can read their targets but not change them, and cannot change primary_goal.
-- Before setup is finished they may still write their own starting targets
-- (onboarding does, when the coach has set none), and once the coaching ends
-- (no active row) the targets are theirs again. Solo users are untouched. The
-- coach writes through their own policy and set_client_primary_goal, both of
-- which run as the coach, so neither is affected.
--
-- Also records WHO last wrote the targets (updated_by), so the client's bell
-- can say "Marta updated your targets" without a second table.

alter table public.targets
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create or replace function public.targets_stamp_writer()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A service-role write (no auth.uid()) leaves the stamp as it was.
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists targets_stamp_writer on public.targets;
create trigger targets_stamp_writer
  before insert or update on public.targets
  for each row execute function public.targets_stamp_writer();

-- True while p_uid has an active coach and has finished setup. Security
-- definer so the policies below can read coach_clients and profiles without
-- depending on the caller's own policies on them.
create or replace function public.client_plan_locked(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coach_clients
    where client_id = p_uid and status = 'active'
  ) and exists (
    select 1 from public.profiles
    where id = p_uid and onboarded_at is not null
  )
$$;

revoke all on function public.client_plan_locked(uuid) from public;
grant execute on function public.client_plan_locked(uuid) to authenticated;

drop policy if exists "Users can manage their own targets" on public.targets;

create policy "targets_select_own" on public.targets
  for select using (auth.uid() = user_id);

create policy "targets_insert_own" on public.targets
  for insert with check (auth.uid() = user_id and not public.client_plan_locked(user_id));

create policy "targets_update_own" on public.targets
  for update using (auth.uid() = user_id and not public.client_plan_locked(user_id))
  with check (auth.uid() = user_id and not public.client_plan_locked(user_id));

create policy "targets_delete_own" on public.targets
  for delete using (auth.uid() = user_id and not public.client_plan_locked(user_id));

-- primary_goal: profiles_update_self stays (it covers the client's name,
-- units, details), and this trigger refuses only a change to the goal made by
-- the client themselves while their plan is locked. The coach's RPC runs with
-- auth.uid() = the coach, so it passes.
create or replace function public.profiles_guard_coach_goal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.primary_goal is distinct from old.primary_goal
     and auth.uid() = old.id
     and public.client_plan_locked(old.id) then
    raise exception 'primary_goal is set by your coach' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_coach_goal on public.profiles;
create trigger profiles_guard_coach_goal
  before update on public.profiles
  for each row execute function public.profiles_guard_coach_goal();
