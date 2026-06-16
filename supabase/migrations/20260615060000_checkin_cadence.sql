-- Configurable check-in cadence, per coach↔client relationship.
--
-- Check-ins are keyed by check_ins.week_of (the period-start Sunday). Until now
-- every client was implicitly weekly. This adds a per-relationship interval (in
-- weeks) the coach controls; the app computes each client's current check-in
-- period from it (interval 1 == the current calendar week — unchanged behavior).
--
-- Additive, NOT NULL DEFAULT 1 so every existing relationship stays weekly. New
-- column on an existing table inherits its grants; the coach already has the
-- UPDATE policy (used by hide_calories) and the client the SELECT policy.

alter table public.coach_clients
  add column if not exists checkin_interval_weeks integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coach_clients_checkin_interval_weeks_check'
  ) then
    alter table public.coach_clients
      add constraint coach_clients_checkin_interval_weeks_check
      check (checkin_interval_weeks between 1 and 8);
  end if;
end $$;
