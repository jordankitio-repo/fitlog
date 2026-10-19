-- Per-user control over the emails Gardnr sends.
--
-- Before this, the app sent nine different emails and the recipient had no say
-- in any of them: there was no preference table, column or screen anywhere in
-- the codebase. A client could not say "send me reports but not nudges".
--
-- SCOPE, decided deliberately:
--
--   * EMAIL only. The in-app bell stays on. Email is the channel that intrudes
--     and the one CAN-SPAM governs; the bell is pull-not-push and derives most
--     of its entries live from messages/check_ins/reports, so silencing it
--     would mean filtering those reads for no gain the reader asked for.
--
--   * Six categories, all of them ACTIVITY within a coaching relationship.
--     Everything that announces a change to the relationship itself stays
--     always-on and is deliberately absent from this table: an invite, a
--     coaching connection ending (either side), and a check-in cadence change.
--     So are account, security and billing notices. A preference row cannot
--     switch those off, because the table is an allow-list of what is
--     switchable rather than a deny-list of what is not — a category nobody
--     thought about is NOT silenceable by default.
--
-- Shape: one row per user, one JSONB map. `absent key = send`, so a user who
-- has never opened the screen gets everything, and the row only ever records
-- departures from that. Per-category rows were the alternative and buy nothing
-- here: the whole map is read in one go on every send and written in one go by
-- the one screen that edits it.

create table if not exists public.notification_preferences (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  email      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

-- The owner reads and writes their own row, and nobody else's. A coach has no
-- business reading which emails a client muted, so there is no coach policy
-- here even though coaches can read other parts of a client's profile.
drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Erasure runs as service_role and deletes by user_id (the row also cascades
-- from auth.users; the explicit grant is so delete-account's own DELETE cannot
-- fail with 42501 the way the metric logs silently did).
grant select, insert, update, delete on public.notification_preferences to service_role;

-- The switchable categories. A check constraint rather than a lookup table
-- because this list changes only when a new email is written, and a typo in an
-- edge function is a bug that must not be silently storable.
--
--   report          client: a new coaching report from their coach
--   checkin_review  client: their coach reviewed their check-in
--   nudge           client: their coach asked them to log / check in
--   client_checkin  coach:  a client submitted a check-in
--   milestone       coach:  a client hit a streak milestone
--   weekly_digest   coach:  the weekly roster digest
alter table public.notification_preferences
  drop constraint if exists notification_preferences_known_categories;
--
-- `jsonb - text[]` strips the known keys; whatever is left is a key nobody
-- declared, and the row is rejected. Written this way because the obvious
-- spelling (`email ?| array[...]`, "has any of these keys") passes a map that
-- holds one real key and any amount of junk beside it, and `{}` has to be
-- allowed, which is exactly the shape that makes a wrong constraint look right.
alter table public.notification_preferences
  add constraint notification_preferences_known_categories check (
    (email - array['report','checkin_review','nudge','client_checkin','milestone','weekly_digest']) = '{}'::jsonb
  );

-- The one place the send/don't-send decision is made.
--
-- Every sender calls this rather than reading the JSONB itself, for the reason
-- `check_rate_limit` exists in the same shape: six copies of "read the map,
-- coerce the value, decide what a missing key means" is six chances to disagree
-- about it, and they would disagree silently — in the direction of sending mail
-- someone asked us not to send.
--
-- Returns FALSE only when the user has an explicit `false` for that category.
-- Unknown category, no row, no key, null: TRUE. That default is safe for every
-- category listed above, because each is mail about a service the user is
-- actively enrolled in. It would NOT be safe for marketing mail, which must
-- fail closed and therefore cannot use this function as written.
create or replace function public.wants_email_notification(
  p_user_id  uuid,
  p_category text
) returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(
    (select (email ->> p_category) is distinct from 'false'
       from public.notification_preferences
      where user_id = p_user_id),
    true
  );
$$;

-- `from public` alone is NOT enough, and the gap is invisible until something
-- probes it. Supabase's platform default privileges grant EXECUTE on every new
-- function in `public` to anon and authenticated directly, and revoking from
-- PUBLIC leaves those explicit grants standing. The function is SECURITY
-- DEFINER over a table the caller cannot read, so a signed-in user could
-- otherwise read out anyone else's preferences one category at a time — the
-- row-level privacy above leaking straight back out through a function.
--
-- Same fix, same reason, as 20260625000000_rate_limit_lockdown. Caught here by
-- notificationPrefs.test.js, which asserts the refusal rather than the grant.
revoke all on function public.wants_email_notification(uuid, text) from public, anon, authenticated;
grant execute on function public.wants_email_notification(uuid, text) to service_role;

notify pgrst, 'reload schema';
