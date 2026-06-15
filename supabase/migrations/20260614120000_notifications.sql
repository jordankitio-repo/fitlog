-- Server-pushed notifications that CANNOT be derived from activity tables under
-- RLS. The motivating case: when a client leaves coaching, the coach loses RLS
-- read access to that client's profile (profiles_select requires an ACTIVE
-- relationship), so the bell can no longer look up the departed client's name.
-- We snapshot the message text here at leave time, written by edge functions via
-- the service role. (The bell still derives message/check-in/report events and
-- live alerts directly from their tables — this is only for events that leave no
-- coach-readable trace otherwise.)

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Recipients read and mark-read their own rows. Inserts come exclusively from
-- edge functions via the service role (which bypasses RLS), so there is
-- intentionally NO insert policy for authenticated users.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
