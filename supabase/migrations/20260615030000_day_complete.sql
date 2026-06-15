-- "Complete Day": a one-tap mark that the client finished logging for a date.
-- A present row = that day is marked complete. This is the trust signal that
-- lets a coach read a low-calorie day as real adherence vs. under-reporting.
--
-- RLS mirrors the per-client data tables: the owner manages their own rows, and
-- a coach can read an ACTIVE client's marks. Grants are explicit (the platform
-- default-privilege grants don't cover pooler-created tables — see
-- 20260615020000_saved_meals / 20260614130000_notifications_grants).

create table if not exists public.day_complete (
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_date date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, logged_date)
);

alter table public.day_complete enable row level security;

drop policy if exists "day_complete_owner" on public.day_complete;
create policy "day_complete_owner" on public.day_complete
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "day_complete_coach_read_active" on public.day_complete;
create policy "day_complete_coach_read_active" on public.day_complete
  for select to authenticated
  using (auth.uid() in (
    select coach_id from public.coach_clients
    where client_id = day_complete.user_id and status = 'active'));

grant select, insert, update, delete on public.day_complete to anon, authenticated;
