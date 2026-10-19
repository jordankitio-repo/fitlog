-- Device sync, part 2: provenance on the three metric tables, the indexes that
-- make an idempotent re-sync possible, and the RPCs that own every device write.
--
-- THE CENTRAL RULE, in one place: a value the client typed is never overwritten
-- by a later sync. A synced value fills the field; the client may edit it at any
-- time; their edit is then pinned forever. `source = 'manual'` IS the pin.
--
-- Why that rule lives in SQL and not in the sync code: PostgREST's upsert
-- (Prefer: resolution=merge-duplicates) emits ON CONFLICT DO UPDATE with no
-- WHERE clause, so it is structurally incapable of expressing "unless the user
-- edited it". Doing it in the edge function would mean a read, a decision in JS
-- and a write -- racy, an extra round trip, and a convention rather than a
-- guarantee. Here it is one WHERE clause, enforced for every caller, atomically.
--
-- `source` defaults to 'manual' and is NOT NULL, so every row already in the
-- database is correctly marked as hand-entered with no backfill, and every
-- existing client write path keeps working untouched.

alter table public.steps_log  add column if not exists source text not null default 'manual';
alter table public.weight_log add column if not exists source text not null default 'manual';
alter table public.cardio_log add column if not exists source text not null default 'manual';

-- ON DELETE SET NULL, not CASCADE: removing a connection must never delete the
-- client's health history as a side effect. Disconnecting is not erasing, and
-- those are separate choices the user makes explicitly.
alter table public.steps_log  add column if not exists source_connection_id uuid
  references public.device_connections(id) on delete set null;
alter table public.weight_log add column if not exists source_connection_id uuid
  references public.device_connections(id) on delete set null;
alter table public.cardio_log add column if not exists source_connection_id uuid
  references public.device_connections(id) on delete set null;

-- Retained even after a manual edit flips `source` to 'manual'. It is the dedupe
-- key: clearing it would make the next sync find no matching row and INSERT a
-- duplicate of the very row the client just corrected.
alter table public.steps_log  add column if not exists external_id text;
alter table public.weight_log add column if not exists external_id text;
alter table public.cardio_log add column if not exists external_id text;

do $$ begin
  alter table public.steps_log add constraint steps_log_source_check check (source in (
    'manual', 'apple_health', 'health_connect', 'withings', 'whoop', 'google_health'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.weight_log add constraint weight_log_source_check check (source in (
    'manual', 'apple_health', 'health_connect', 'withings', 'whoop', 'google_health'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.cardio_log add constraint cardio_log_source_check check (source in (
    'manual', 'apple_health', 'health_connect', 'withings', 'whoop', 'google_health'));
exception when duplicate_object then null; end $$;

-- PARTIAL unique indexes give the two many-rows-per-day tables an idempotency
-- key, while leaving MANUAL rows (external_id is null) entirely unconstrained --
-- so weight_log's deliberate absence of a unique constraint, and
-- src/utils/energyBalanceRead.js's averaging of several weigh-ins per date, both
-- survive exactly as they are. Manual rows are not merely exempt from the
-- constraint, they are outside the index.
--
-- steps_log needs none: its existing steps_log_user_date_key (user_id,
-- logged_date) already is the idempotency key, and must stay that way.
create unique index if not exists weight_log_device_key
  on public.weight_log (source_connection_id, external_id) where external_id is not null;
create unique index if not exists cardio_log_device_key
  on public.cardio_log (source_connection_id, external_id) where external_id is not null;

-- Overdue regardless of this feature: every query in the app filters these two
-- tables on exactly (user_id, logged_date) and neither had an index. Sync volume
-- is what makes it start to matter.
create index if not exists weight_log_user_date_idx on public.weight_log (user_id, logged_date);
create index if not exists cardio_log_user_date_idx on public.cardio_log (user_id, logged_date);


-- Claim-on-first-use ownership of a single-value-per-day metric. The first
-- connection to write a metric owns it until the user chooses otherwise; the
-- insert is ON CONFLICT DO NOTHING so two concurrent syncs cannot both claim it.
create or replace function public.device_metric_writer(
  p_user_id       uuid,
  p_metric        text,
  p_connection_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_writer uuid;
begin
  insert into public.device_metric_preferences (user_id, metric, connection_id)
  values (p_user_id, p_metric, p_connection_id)
  on conflict (user_id, metric) do nothing;

  select connection_id into v_writer
    from public.device_metric_preferences
   where user_id = p_user_id and metric = p_metric;

  -- A preference pointing at a connection the user has since disconnected would
  -- otherwise deadlock the metric: nothing could ever write it again.
  if v_writer is not null and not exists (
    select 1 from public.device_connections
     where id = v_writer and status <> 'disconnected'
  ) then
    update public.device_metric_preferences
       set connection_id = p_connection_id, updated_at = now()
     where user_id = p_user_id and metric = p_metric;
    v_writer := p_connection_id;
  end if;

  return v_writer;
end;
$$;


-- The ONLY path by which device data enters the three metric tables.
--
-- Resolves user_id from the connection server-side, so a malformed payload or a
-- compromised caller cannot write into another user's rows. Also sidesteps the
-- service_role grant gap on these tables entirely, since this runs as the
-- function owner.
--
-- Payload shapes (all dates are LOCAL ISO 'YYYY-MM-DD', per the app-wide
-- convention in src/utils/dateHelpers.js toLocalDateString):
--   p_steps    [{logged_date, steps, distance}]
--   p_weights  [{logged_date, weighed_at, weight, unit, external_id}]
--   p_workouts [{logged_date, exercise_type, duration, calories_burned,
--                avg_heart_rate, external_id}]
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
     source, source_connection_id, external_id)
  select v_uid,
         (e ->> 'logged_date')::date,
         coalesce(nullif(e ->> 'exercise_type', ''), 'Other'),
         (e ->> 'duration')::integer,
         nullif(e ->> 'calories_burned', '')::integer,
         nullif(e ->> 'avg_heart_rate', '')::integer,
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
         logged_date     = excluded.logged_date
   where cardio_log.source <> 'manual';   -- THE PIN
  get diagnostics v_workouts = row_count;

  return jsonb_build_object('steps', v_steps, 'weights', v_weights, 'workouts', v_workouts);
end;
$$;


-- Record the outcome of a sync attempt. Separate from apply_device_metrics so a
-- FAILED sync can be recorded without any metric write.
--
-- Status is withheld until three consecutive failures so a provider blip does
-- not nag the client, but 'reauth_required' is set at once because it needs a
-- human to act.
create or replace function public.mark_device_sync(
  p_connection_id  uuid,
  p_synced_through date default null,
  p_ok             boolean default true,
  p_error_code     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ok then
    update public.device_connections
       set last_synced_at       = now(),
           synced_through       = coalesce(p_synced_through, synced_through),
           backfill_pending     = false,
           consecutive_failures = 0,
           status               = 'active',
           last_error_code      = null,
           last_error_at        = null
     where id = p_connection_id;
  else
    update public.device_connections
       set consecutive_failures = consecutive_failures + 1,
           last_error_code      = p_error_code,
           last_error_at        = now(),
           status = case
             when p_error_code = 'reauth' then 'reauth_required'
             when consecutive_failures + 1 >= 3 then 'error'
             else status
           end
     where id = p_connection_id;
  end if;
end;
$$;


-- Tombstone a row the user deleted, so the next sync does not resurrect it.
-- Ownership is re-checked against the connection rather than trusted.
create or replace function public.dismiss_device_row(
  p_user_id       uuid,
  p_connection_id uuid,
  p_metric        text,
  p_dedupe_key    text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.device_connections
     where id = p_connection_id and user_id = p_user_id
  ) then
    return false;
  end if;

  insert into public.device_dismissals (connection_id, metric, dedupe_key)
  values (p_connection_id, p_metric, p_dedupe_key)
  on conflict (connection_id, metric, dedupe_key) do nothing;

  return true;
end;
$$;


-- Lift a tombstone. Backs the "pull from device" action and the undo of a
-- delete, which must clear the tombstone BEFORE restoring the row or the next
-- sync would immediately remove it again.
create or replace function public.undismiss_device_row(
  p_user_id       uuid,
  p_connection_id uuid,
  p_metric        text,
  p_dedupe_key    text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.device_connections
     where id = p_connection_id and user_id = p_user_id
  ) then
    return false;
  end if;

  delete from public.device_dismissals
   where connection_id = p_connection_id
     and metric = p_metric
     and dedupe_key = p_dedupe_key;

  return true;
end;
$$;


-- Delete what one connection imported, for the "disconnect and remove the data
-- this device added" choice (the WA MHMDA withdrawal right, and Whoop/Oura-style
-- deletion obligations).
--
-- Rows the client EDITED are never touched: the moment they corrected a number
-- it became their own entry, not the device's. That is why the predicate tests
-- source <> 'manual' and not just the connection id.
create or replace function public.purge_device_data(
  p_user_id       uuid,
  p_connection_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_steps integer := 0; v_weights integer := 0; v_workouts integer := 0;
begin
  if not exists (
    select 1 from public.device_connections
     where id = p_connection_id and user_id = p_user_id
  ) then
    return jsonb_build_object('error', 'unknown_connection');
  end if;

  delete from public.steps_log
   where user_id = p_user_id and source_connection_id = p_connection_id and source <> 'manual';
  get diagnostics v_steps = row_count;

  delete from public.weight_log
   where user_id = p_user_id and source_connection_id = p_connection_id and source <> 'manual';
  get diagnostics v_weights = row_count;

  delete from public.cardio_log
   where user_id = p_user_id and source_connection_id = p_connection_id and source <> 'manual';
  get diagnostics v_workouts = row_count;

  return jsonb_build_object('steps', v_steps, 'weights', v_weights, 'workouts', v_workouts);
end;
$$;


-- Every one of these is service_role only: they write health data on a user's
-- behalf and resolve ownership themselves, so a browser must never reach them.
revoke all on function public.device_metric_writer(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.apply_device_metrics(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.mark_device_sync(uuid, date, boolean, text) from public, anon, authenticated;
revoke all on function public.dismiss_device_row(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.undismiss_device_row(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.purge_device_data(uuid, uuid) from public, anon, authenticated;

grant execute on function public.device_metric_writer(uuid, text, uuid) to service_role;
grant execute on function public.apply_device_metrics(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.mark_device_sync(uuid, date, boolean, text) to service_role;
grant execute on function public.dismiss_device_row(uuid, uuid, text, text) to service_role;
grant execute on function public.undismiss_device_row(uuid, uuid, text, text) to service_role;
grant execute on function public.purge_device_data(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
