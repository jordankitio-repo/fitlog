-- Workouts, not just cardio.
--
-- Apple Health records every kind of workout -- strength, yoga, martial arts,
-- pickleball -- and the phone used to throw away everything that was not
-- cardio, because cardio_log feeds the coach's daily cardio-minutes target and
-- an hour of yoga is not an hour of cardio. That kept the target honest by
-- hiding half of what the client actually did.
--
-- Now every workout imports under its real name, and `counts_as_cardio` keeps
-- the target honest instead: the Log lists everything, and only rows marked
-- true add up against cardio_minutes. The table keeps its name; renaming it
-- would touch every reader for no change in meaning.
--
-- DEFAULT TRUE, deliberately: every row already in the table was either typed
-- into a cardio form or imported through the old cardio-only filter, so all of
-- them are cardio, and nothing any client or coach sees today moves.
--
-- `recorded_by` is the device or app that recorded the session ("Apple
-- Watch", "Strava"), display only. `distance` is miles, like steps_log.

alter table public.cardio_log add column if not exists counts_as_cardio boolean not null default true;
alter table public.cardio_log add column if not exists max_heart_rate integer;
alter table public.cardio_log add column if not exists distance numeric;
alter table public.cardio_log add column if not exists recorded_by text;

-- apply_device_metrics, re-created with the new cardio_log columns. Steps and
-- weight are unchanged from 20261015020000.
create or replace function public.apply_device_metrics(
  p_connection_id uuid,
  p_steps         jsonb default '[]'::jsonb,
  p_weights       jsonb default '[]'::jsonb,
  p_workouts      jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid;
  v_provider  text;
  v_status    text;
  v_steps     integer := 0;
  v_weights   integer := 0;
  v_workouts  integer := 0;
begin
  select user_id, provider, status
    into v_uid, v_provider, v_status
    from public.device_connections
   where id = p_connection_id;

  if v_uid is null then
    return jsonb_build_object('error', 'unknown_connection');
  end if;
  if v_status = 'disconnected' then
    return jsonb_build_object('error', 'connection_disconnected');
  end if;

  -- Steps: one row per day, so only the owning connection may write.
  if public.device_metric_writer(v_uid, 'steps', p_connection_id) = p_connection_id then
    insert into public.steps_log
      (user_id, logged_date, steps, distance, source, source_connection_id, external_id)
    select v_uid,
           (e ->> 'logged_date')::date,
           (e ->> 'steps')::integer,
           nullif(e ->> 'distance', '')::numeric,
           v_provider,
           p_connection_id,
           e ->> 'logged_date'
      from jsonb_array_elements(p_steps) e
     where e ->> 'logged_date' is not null
       and (e ->> 'steps') ~ '^[0-9]+$'
       and not exists (
         select 1 from public.device_dismissals d
          where d.connection_id = p_connection_id
            and d.metric = 'steps'
            and d.dedupe_key = e ->> 'logged_date')
    on conflict (user_id, logged_date) do update
       set steps                = excluded.steps,
           distance             = coalesce(excluded.distance, steps_log.distance),
           source               = excluded.source,
           source_connection_id = excluded.source_connection_id,
           external_id          = excluded.external_id
     where steps_log.source <> 'manual';   -- THE PIN
    get diagnostics v_steps = row_count;
  end if;

  -- Weight: many rows per day are valid, so dedupe is by the provider's own
  -- record id. A record without one is skipped rather than guessed at -- an
  -- un-dedupable weigh-in would re-insert on every sync forever.
  if public.device_metric_writer(v_uid, 'weight', p_connection_id) = p_connection_id then
    insert into public.weight_log
      (user_id, logged_date, weighed_at, weight, unit, source, source_connection_id, external_id)
    select v_uid,
           (e ->> 'logged_date')::date,
           nullif(e ->> 'weighed_at', '')::time,
           (e ->> 'weight')::numeric,
           coalesce(nullif(e ->> 'unit', ''), 'lbs'),
           v_provider,
           p_connection_id,
           e ->> 'external_id'
      from jsonb_array_elements(p_weights) e
     where e ->> 'external_id' is not null
       and e ->> 'logged_date' is not null
       and (e ->> 'weight')::numeric > 0
       and not exists (
         select 1 from public.device_dismissals d
          where d.connection_id = p_connection_id
            and d.metric = 'weight'
            and d.dedupe_key = e ->> 'external_id')
    on conflict (source_connection_id, external_id) where external_id is not null
    do update
       set weight      = excluded.weight,
           unit        = excluded.unit,
           logged_date = excluded.logged_date,
           weighed_at  = excluded.weighed_at
     where weight_log.source <> 'manual';   -- THE PIN
    get diagnostics v_weights = row_count;
  end if;

  -- Cardio: additive, no ownership check. Two sources reporting two different
  -- sessions is correct; the same session twice is caught by external_id.
  insert into public.cardio_log
    (user_id, logged_date, exercise_type, duration, calories_burned, avg_heart_rate,
     max_heart_rate, distance, counts_as_cardio, recorded_by,
     source, source_connection_id, external_id)
  select v_uid,
         (e ->> 'logged_date')::date,
         coalesce(nullif(e ->> 'exercise_type', ''), 'Other'),
         (e ->> 'duration')::integer,
         nullif(e ->> 'calories_burned', '')::integer,
         nullif(e ->> 'avg_heart_rate', '')::integer,
         nullif(e ->> 'max_heart_rate', '')::integer,
         nullif(e ->> 'distance', '')::numeric,
         -- Absent means true: a payload from before this column existed was
         -- all cardio, because the phone filtered everything else out.
         coalesce((e ->> 'counts_as_cardio')::boolean, true),
         nullif(e ->> 'recorded_by', ''),
         v_provider,
         p_connection_id,
         e ->> 'external_id'
    from jsonb_array_elements(p_workouts) e
   where e ->> 'external_id' is not null
     and e ->> 'logged_date' is not null
     and (e ->> 'duration') ~ '^[0-9]+$'
     and (e ->> 'duration')::integer > 0
     and not exists (
       select 1 from public.device_dismissals d
        where d.connection_id = p_connection_id
          and d.metric = 'cardio'
          and d.dedupe_key = e ->> 'external_id')
  on conflict (source_connection_id, external_id) where external_id is not null
  do update
     set duration        = excluded.duration,
         exercise_type   = excluded.exercise_type,
         calories_burned = excluded.calories_burned,
         avg_heart_rate  = excluded.avg_heart_rate,
         max_heart_rate  = excluded.max_heart_rate,
         distance        = excluded.distance,
         counts_as_cardio = excluded.counts_as_cardio,
         recorded_by     = excluded.recorded_by,
         logged_date     = excluded.logged_date
   where cardio_log.source <> 'manual';   -- THE PIN
  get diagnostics v_workouts = row_count;

  return jsonb_build_object('steps', v_steps, 'weights', v_weights, 'workouts', v_workouts);
end;
$$;


revoke all on function public.apply_device_metrics(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_device_metrics(uuid, jsonb, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
