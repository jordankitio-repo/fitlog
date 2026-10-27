-- The day a client's check-in is due.
--
-- Cadence said how often (checkin_interval_weeks) but not when: every period
-- ran Sunday to Saturday, so every client in the app was due on a Saturday.
-- Coaches run check-ins on the day that suits their week (Trainerize advises
-- one fixed day; its coaches ask to set it per client). 0 = Sunday … 6 =
-- Saturday, the day a period ENDS; the default 6 is what everyone had, so
-- existing schedules and check-in keys are unchanged.
--
-- The period maths stays in one place, src/utils/dateHelpers.js
-- (checkinPeriodStart), which now takes this day.

alter table public.coach_clients
  add column if not exists checkin_weekday smallint not null default 6
  check (checkin_weekday between 0 and 6);

-- Tell the client when the DAY moves, as well as the cadence: either one
-- changes what they owe and when. Same rules as before (a real change, made
-- by the coach, on a live relationship; rapid changes collapse into one
-- unread notice), and the notice now names both: "Now weekly, due Mondays."
create or replace function public.notify_cadence_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_day text;
  v_body text;
begin
  if new.checkin_interval_weeks is not distinct from old.checkin_interval_weeks
     and new.checkin_weekday is not distinct from old.checkin_weekday then
    return new;
  end if;
  if auth.uid() is distinct from new.coach_id then
    return new;
  end if;
  if new.status <> 'active' then
    return new;
  end if;

  -- Mirrors CADENCE_OPTIONS (src/utils/cadence.js) and WEEKDAYS
  -- (src/utils/dateHelpers.js) word for word.
  v_label := case new.checkin_interval_weeks
    when 1 then 'weekly'
    when 2 then 'biweekly'
    else 'every ' || new.checkin_interval_weeks || ' weeks'
  end;
  v_day := (array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[new.checkin_weekday + 1];
  v_body := 'Now ' || v_label || ', due ' || v_day || 's.';

  update public.notifications
     set title = 'Check-in schedule updated',
         body = v_body,
         created_at = now()
   where user_id = new.client_id
     and type = 'cadence'
     and read_at is null
     and created_at > now() - interval '15 minutes';

  if not found then
    insert into public.notifications (user_id, type, title, body, href)
    values (new.client_id, 'cadence', 'Check-in schedule updated', v_body, '/?focus=checkin');
  end if;

  return new;
end $$;

-- An off-schedule check-in the coach asked for ("Request check-in"): set by
-- the coach, answered by the client's next check-in sent after it. The
-- schedule is untouched; this is the one-off beside it (Kahunas and Everfit
-- send ad-hoc forms the same way).
alter table public.coach_clients
  add column if not exists checkin_requested_at timestamptz;
