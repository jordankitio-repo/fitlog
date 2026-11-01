-- Target history: a past day is graded against the plan that was in force that
-- day, not against today's.
--
-- WHAT WAS WRONG. `targets` is one mutable row per user, and every grader
-- (heatmap, consistency card, breakdown, roster, check-in strip, charts, the
-- weekly digest) applied that row to every past day. A coach moving a client
-- from 2,100 to 1,800 cal regraded the last 90 days against 1,800, and a client
-- who was on target all quarter became "over" retroactively. A record you can
-- change by editing a field is not a record.
--
-- THE SHAPE. `targets` stays the CURRENT plan (fifteen readers only want today
-- and are untouched). `target_versions` holds one row per user per day the
-- graded values changed, written ONLY by the trigger below. A version applies
-- from its effective_date until the next one. Design and review log:
-- docs/target-history-design.md.
--
-- RULES.
--   * Only the six graded fields are versioned. weight_goal is a destination,
--     not a daily grade; an edit that touches only it records nothing.
--   * The effective date is the WRITER's local today (targets.effective_date,
--     sent by the app -- logged_date is client-local and the server has no
--     timezone for anyone). It is clamped to UTC today +/- 1 day, which covers
--     every real timezone and is the anti-backdating guard: without it any
--     writer could pass 2026-01-01 and rewrite history. Clamped, not raised,
--     because a stale stored value must never fail a save.
--   * Several edits on one day collapse into one version (the last wins);
--     today is still in progress.
--   * A user's FIRST version reaches back to 1970-01-01: days before any plan
--     existed are graded against the first plan, as they were before this
--     table. The backfill below is the same rule.

alter table public.targets
  add column if not exists effective_date date;

create table if not exists public.target_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_date date not null,
  calories integer,
  protein integer,
  carbs integer,
  fat integer,
  cardio_minutes integer,
  steps integer,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, effective_date)
);

create index if not exists target_versions_user_date_idx
  on public.target_versions (user_id, effective_date desc);

alter table public.target_versions enable row level security;

-- Readable by the owner and by their ACTIVE coach (the same predicate as the
-- coach's policy on targets, 20260615000100). No write policy for anyone:
-- only the definer trigger and service_role write.
drop policy if exists "target_versions_select_own" on public.target_versions;
create policy "target_versions_select_own" on public.target_versions
  for select using (auth.uid() = user_id);

drop policy if exists "target_versions_select_coach" on public.target_versions;
create policy "target_versions_select_coach" on public.target_versions
  for select using (exists (
    select 1 from public.coach_clients
    where coach_id = auth.uid() and client_id = target_versions.user_id and status = 'active'
  ));

-- Explicit grants: tables created over the session pooler get no default
-- privileges, and the erasure loop silently no-ops without service_role DML.
grant select on public.target_versions to authenticated;
grant all on public.target_versions to service_role;

create or replace function public.targets_record_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  utc_today date := (now() at time zone 'utc')::date;
  d date := new.effective_date;
begin
  if new.user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.calories is not distinct from old.calories
    and new.protein is not distinct from old.protein
    and new.carbs is not distinct from old.carbs
    and new.fat is not distinct from old.fat
    and new.cardio_minutes is not distinct from old.cardio_minutes
    and new.steps is not distinct from old.steps
  then
    return new;
  end if;

  if d is null or d < utc_today - 1 or d > utc_today + 1 then
    d := utc_today;
  end if;

  if not exists (select 1 from public.target_versions where user_id = new.user_id) then
    d := date '1970-01-01';
  end if;

  insert into public.target_versions
    (user_id, effective_date, calories, protein, carbs, fat, cardio_minutes, steps, set_by)
  values
    (new.user_id, d, new.calories, new.protein, new.carbs, new.fat, new.cardio_minutes, new.steps,
     coalesce(auth.uid(), new.updated_by))
  on conflict (user_id, effective_date) do update set
    calories = excluded.calories,
    protein = excluded.protein,
    carbs = excluded.carbs,
    fat = excluded.fat,
    cardio_minutes = excluded.cardio_minutes,
    steps = excluded.steps,
    set_by = excluded.set_by,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.targets_record_version() from public;

-- AFTER, so a write the targets policies refuse (client_plan_locked) never
-- reaches it.
drop trigger if exists targets_record_version on public.targets;
create trigger targets_record_version
  after insert or update on public.targets
  for each row execute function public.targets_record_version();

-- Backfill: every existing plan covers all past days (decision 4), so grades do
-- not move on the day this ships.
insert into public.target_versions
  (user_id, effective_date, calories, protein, carbs, fat, cardio_minutes, steps, set_by)
select user_id, date '1970-01-01', calories, protein, carbs, fat, cardio_minutes, steps, updated_by
from public.targets
where user_id is not null
on conflict (user_id, effective_date) do nothing;

notify pgrst, 'reload schema';
