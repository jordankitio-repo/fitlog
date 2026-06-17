-- Body measurements: tape measurements for body-composition tracking (the
-- positioning is "nutrition + body composition layer"). One row per date
-- (upsert on user_id+logged_date, like steps_log), common sites as nullable
-- columns. neck/waist/hips also set up a future Navy body-fat estimate.
--
-- RLS mirrors the per-client data tables (day_complete / saved_meals): the owner
-- manages their own rows, a coach can read an ACTIVE client's. Grants are
-- explicit (pooler-created tables don't inherit the platform default grants).

create table if not exists public.body_measurements (
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null,
  unit text not null default 'in',
  neck numeric,
  chest numeric,
  waist numeric,
  hips numeric,
  arm numeric,
  thigh numeric,
  created_at timestamptz not null default now(),
  primary key (user_id, logged_date)
);

alter table public.body_measurements enable row level security;

drop policy if exists "body_measurements_owner" on public.body_measurements;
create policy "body_measurements_owner" on public.body_measurements
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "body_measurements_coach_read_active" on public.body_measurements;
create policy "body_measurements_coach_read_active" on public.body_measurements
  for select to authenticated
  using (auth.uid() in (
    select coach_id from public.coach_clients
    where client_id = body_measurements.user_id and status = 'active'));

grant select, insert, update, delete on public.body_measurements to anon, authenticated;
