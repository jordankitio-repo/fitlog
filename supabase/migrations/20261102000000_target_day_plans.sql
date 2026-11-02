-- Per-weekday targets: day types (e.g. "Training") laid over the base targets
-- on the weekdays they cover.
--
-- WHAT WAS WRONG. One set of targets per client. A client eating to a 2,400
-- training-day plan on Monday was graded as 120% "over" a 2,000 target, so for
-- every client on a split plan the compliance numbers were wrong.
--
-- THE SHAPE. targets.day_plans is an array of 0-2 day types:
--   [{ "name": "Training", "days": [1,3,5], "calories": 2400, "carbs": 280, ... }]
-- days: 0 = Sunday (JS getDay()). A null or missing field means "same as the
-- base targets", not "not tracked". Each weekday is in at most one day type.
-- The app applies a day type to a date (utils/targetHistory resolveDay); the
-- database only guarantees the shape. Numeric bounds stay app-side
-- (utils/targetChecks), as they are for the base columns.
--
-- A change to day_plans is a plan change, so it is versioned exactly like the
-- base targets (20261101000000_target_versions): the trigger below is that
-- trigger with day_plans added to the comparison and the copy. Design:
-- docs/day-targets-design.md.

create or replace function public.valid_day_plans(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- CASE, not AND/OR: SQL does not promise to evaluate those left to right, and
  -- jsonb_array_length raises on a non-array instead of answering false.
  select case
    when jsonb_typeof(p) is distinct from 'array' then false
    when jsonb_array_length(p) > 2 then false
    when exists (
      select 1 from jsonb_array_elements(p) e
      where case
        when jsonb_typeof(e) <> 'object' then true
        when jsonb_typeof(e -> 'name') is distinct from 'string' then true
        when length(btrim(e ->> 'name')) not between 1 and 24 then true
        when jsonb_typeof(e -> 'days') is distinct from 'array' then true
        when jsonb_array_length(e -> 'days') = 0 then true
        else exists (
          select 1 from jsonb_array_elements(e -> 'days') d
          where jsonb_typeof(d) <> 'number' or d::text !~ '^[0-6]$'
        )
      end
    ) then false
    -- No weekday twice, within one day type or across both. Every element is
    -- a well-formed object by this branch.
    else (
      select count(*) = count(distinct d::text)
      from jsonb_array_elements(p) e, jsonb_array_elements(e -> 'days') d
    )
  end
$$;

alter table public.targets
  add column if not exists day_plans jsonb not null default '[]'::jsonb;
alter table public.target_versions
  add column if not exists day_plans jsonb not null default '[]'::jsonb;

alter table public.targets drop constraint if exists targets_day_plans_valid;
alter table public.targets
  add constraint targets_day_plans_valid check (public.valid_day_plans(day_plans));
alter table public.target_versions drop constraint if exists target_versions_day_plans_valid;
alter table public.target_versions
  add constraint target_versions_day_plans_valid check (public.valid_day_plans(day_plans));

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
    and new.day_plans is not distinct from old.day_plans
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
    (user_id, effective_date, calories, protein, carbs, fat, cardio_minutes, steps, day_plans, set_by)
  values
    (new.user_id, d, new.calories, new.protein, new.carbs, new.fat, new.cardio_minutes, new.steps,
     new.day_plans, coalesce(auth.uid(), new.updated_by))
  on conflict (user_id, effective_date) do update set
    calories = excluded.calories,
    protein = excluded.protein,
    carbs = excluded.carbs,
    fat = excluded.fat,
    cardio_minutes = excluded.cardio_minutes,
    steps = excluded.steps,
    day_plans = excluded.day_plans,
    set_by = excluded.set_by,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.targets_record_version() from public;

notify pgrst, 'reload schema';
