-- Per-item acknowledgement for the bell's "Recent" half.
--
-- WHAT WAS WRONG. The bell tracked one number in localStorage — the last time
-- you opened it — and hid every event older than that. So the list cleared when
-- you LOOKED at it, not when you dealt with anything. Measured on a seeded
-- roster: open the bell on twenty items, close it without touching one, reopen
-- it, and five are left (the five survivors are live alerts, which are derived
-- and so immune). Fifteen pieces of work vanished because somebody glanced.
--
-- WHY A RECEIPT AND NOT A TO-DO. The fix considered first was to derive each
-- event from the completion fact that already exists next to it —
-- check_ins.reviewed_at, messages.read_at, reports.read_at — so a reviewed
-- check-in would drop off on its own. That is wrong, and the reason is worth
-- writing down: the bell's other half already answers "what needs doing", and
-- so does the roster banner, and so does /check-ins. A third copy of that
-- question is C6's rejected pattern, and the three would disagree the first
-- time one of them cached.
--
-- "Dan checked in" is not a job. It is a notice that something happened, and
-- the thing it is a notice OF is tracked elsewhere. So it behaves like a phone
-- notification: it stays until the recipient acknowledges it by opening it, and
-- handling the underlying work by another route leaves it standing. Tapping it
-- lands on the section, which renders live state and therefore shows the work
-- already done — which is the whole of what the reader needed to see.
--
-- The live-condition half ("Needs attention": client gone quiet, no check-in,
-- account locked) stays derived and is deliberately NOT stored here. Those are
-- states, not events: "Iris never logged" must disappear when Iris logs, not
-- wait to be tapped.
create table if not exists public.notification_dismissals (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  -- The bell's own synthetic id for a derived event ('ci'||check_in_id,
  -- 'm'||message_id, …), not a foreign key. It cannot be one: these events are
  -- assembled from four different tables plus a live triage, so there is no
  -- single column to point at. Text also means a row survives its source being
  -- deleted, which is the safe direction — a dismissal for an event that no
  -- longer exists simply never matches anything.
  key          text        not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Not aged out, on purpose. The bell takes the latest 15 check-ins and messages
-- with no date floor, so a year-old check-in is still listed for a client who
-- went quiet — and purging its dismissal by age would make an acknowledged
-- notice reappear. Volume is a handful of rows per client per week and the
-- rows cascade with the account.
alter table public.notification_dismissals enable row level security;

-- Own rows only, and deliberately NO update policy: a dismissal has no field
-- worth changing, so the table is write-once and nobody — not even its owner —
-- can rewrite a dismissed_at. The bell therefore acknowledges with ON CONFLICT
-- DO NOTHING (supabase-js `ignoreDuplicates`) rather than a DO UPDATE upsert,
-- which would need the policy this comment is explaining the absence of. The
-- RLS harness asserts the duplicate case, because the two spellings differ
-- only in a client flag and the wrong one fails as a 403 on a second click.
--
-- Delete exists so a future "mark unread" has a way back, and because erasure
-- runs it.
drop policy if exists "notification_dismissals_select_own" on public.notification_dismissals;
create policy "notification_dismissals_select_own"
  on public.notification_dismissals for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_dismissals_insert_own" on public.notification_dismissals;
create policy "notification_dismissals_insert_own"
  on public.notification_dismissals for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_dismissals_delete_own" on public.notification_dismissals;
create policy "notification_dismissals_delete_own"
  on public.notification_dismissals for delete to authenticated
  using (user_id = auth.uid());

-- Erasure deletes by user_id as service_role. The explicit grant is here for
-- the reason it is on notification_preferences: the cascade from auth.users
-- covers the account being removed, but delete-account's own statement fails
-- with 42501 without it, and that failure was silent once already.
grant select, insert, delete on public.notification_dismissals to service_role;

notify pgrst, 'reload schema';
