-- Tell the client when their coach changes how often they must check in.
--
-- The cadence defines what the client OWES. Changing it silently changes their
-- obligations with no signal: moved to a longer interval their prompt simply
-- disappears, moved to a shorter one they suddenly owe something nobody told
-- them about. It is worse than it looks, because check-in periods are fixed
-- calendar blocks anchored to an epoch Sunday (see checkinPeriodStart in
-- src/utils/dateHelpers.js) — so a cadence change can move which period "now"
-- falls into, and a client who already checked in this week can start showing
-- as owing one.
--
-- WHY A TRIGGER, not a second write from the page that changes the cadence:
--   * `notifications` has no INSERT policy at all — SELECT and UPDATE own only.
--     A coach cannot insert one as themselves, by design. Server-side is the
--     only door.
--   * The notice is a CONSEQUENCE of the row changing, so it belongs in the
--     same transaction. A follow-up call from the client could fail on its own
--     and leave the cadence changed with the client never told.
--   * NotificationCenter already describes this table as being for "events that
--     leave no other readable trace", which is exactly what this is.
create or replace function public.notify_cadence_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  -- 1. A real change only. Tapping the cadence control on the value it already
  --    has must not write a notice.
  if new.checkin_interval_weeks is not distinct from old.checkin_interval_weeks then
    return new;
  end if;

  -- 2. Only when the COACH did it. RLS lets a client update their own
  --    coach_clients row (coach_clients_update_by_client), and service_role
  --    seeds/migrations run with no auth.uid() at all — in both cases a notice
  --    reading "your coach" would be a lie, so neither fires one.
  if auth.uid() is distinct from new.coach_id then
    return new;
  end if;

  -- 3. Only on a live relationship.
  if new.status <> 'active' then
    return new;
  end if;

  -- These four strings mirror CADENCE_OPTIONS in src/utils/cadence.js EXACTLY,
  -- so the notice names the cadence with the same words the control does.
  -- Change one, change the other; cadence.test.js pins the JS side.
  v_label := case new.checkin_interval_weeks
    when 1 then 'Weekly'
    when 2 then 'Biweekly'
    else 'Every ' || new.checkin_interval_weeks || ' weeks'
  end;

  -- Collapse rapid changes. A coach who changes their mind twice should not
  -- leave the client holding two contradictory notices, so an UNREAD cadence
  -- notice from the last 15 minutes is rewritten rather than joined.
  update public.notifications
     set title = 'Check-in schedule updated',
         body = 'Now ' || v_label || '.',
         created_at = now()
   where user_id = new.client_id
     and type = 'cadence'
     and read_at is null
     and created_at > now() - interval '15 minutes';

  if not found then
    insert into public.notifications (user_id, type, title, body, href)
    values (
      new.client_id,
      'cadence',
      'Check-in schedule updated',
      'Now ' || v_label || '.',
      -- The client's check-in card. Deliberately NOT a computed due date in the
      -- body: that would mean reimplementing the epoch-bucket period maths in
      -- SQL beside the JS copy, and the two would drift. Link to the surface
      -- that already computes it and let it answer.
      '/?focus=checkin'
    );
  end if;

  return new;
end $$;

-- AFTER UPDATE only. On INSERT a new client is simply starting at the default
-- weekly, which is not a change and must not announce itself.
drop trigger if exists notify_cadence_change on public.coach_clients;
create trigger notify_cadence_change
  after update on public.coach_clients
  for each row execute function public.notify_cadence_change();
