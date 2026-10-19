-- Device sync, part 1: the connection record, metric ownership, tombstones, and
-- health-data consent.
--
-- WHY THIS SHAPE: the data source is deliberately abstract. A connection is "a
-- place metric rows can arrive from", whether that is a phone reading Apple
-- Health / Health Connect with the user's permission (the primary path) or a
-- vendor cloud read over OAuth. Everything downstream -- provenance, the
-- manual-edit pin, dedupe, tombstones, erasure -- is identical either way, so it
-- is built once here and no provider is special.
--
-- PROVIDERS DELIBERATELY ABSENT FROM THE CHECK CONSTRAINT, and why, so nobody
-- adds them later without re-reading the terms (see compliance/device-api-terms.md):
--   strava -- 2026 API terms forbid disclosing a user's data to another user (a
--             coach is exactly that) and forbid AI/ML use. Both are load-bearing
--             features here.
--   oura   -- API Agreement 4(a)(vi) forbids disclosing User Data to any third
--             party; 4(d) forbids using the API to "prompt, or otherwise provide
--             input or data to any AI Model". Broader than Strava: it bars even
--             asking a model about the data, which is what the weekly report is.
--             Also mandates deletion within 72h of a user request.
--
-- OAuth credential storage and single-use OAuth state tables are NOT created
-- here. No OAuth provider is being built in this change, and speculative
-- credential tables are a liability rather than an asset -- they are additive
-- and self-contained whenever the first OAuth provider lands.

create table if not exists public.device_connections (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  provider             text not null,
  -- Opaque label for the source, e.g. "Jordan's iPhone". Display only.
  device_label         text,
  status               text not null default 'active',
  connected_at         timestamptz not null default now(),
  last_synced_at       timestamptz,
  -- Watermark: data is believed complete through this LOCAL date. Drives the
  -- incremental window and is what makes a sync resumable without a queue.
  synced_through       date,
  backfill_pending     boolean not null default true,
  consecutive_failures integer not null default 0,
  last_error_code      text,
  last_error_at        timestamptz,
  disconnected_at      timestamptz,
  constraint device_connections_provider_check check (provider in (
    'apple_health', 'health_connect', 'withings', 'whoop', 'google_health'
  )),
  constraint device_connections_status_check check (status in (
    'active', 'reauth_required', 'error', 'disconnected'
  ))
);

-- One LIVE connection per provider per user. A disconnected row is allowed to
-- linger so that already-imported rows keep a readable provenance pointer
-- instead of dangling -- which is also why the log tables' FK is ON DELETE SET
-- NULL rather than CASCADE (see part 2).
create unique index if not exists device_connections_live_key
  on public.device_connections (user_id, provider)
  where status <> 'disconnected';

alter table public.device_connections enable row level security;

-- SELECT only for the browser. Every mutation goes through an edge function or a
-- SECURITY DEFINER RPC, so a modified client cannot fabricate a connection, flip
-- its status, or rewind `synced_through` to force a re-sync over a pinned manual
-- value. Owner-only: a coach has no need for the connection row -- the `source`
-- column on the metric rows already tells them what they need.
drop policy if exists "device_connections_owner" on public.device_connections;
create policy "device_connections_owner" on public.device_connections
  for select to authenticated using (user_id = auth.uid());

grant select on public.device_connections to anon, authenticated;
grant select, insert, update, delete on public.device_connections to service_role;

-- Which connection is allowed to WRITE each single-value-per-day metric.
--
-- Needed because steps_log is UNIQUE (user_id, logged_date) and several readers
-- assume exactly one row per day (src/pages/Dashboard.jsx uses .maybeSingle(),
-- which THROWS on two; src/utils/clientStats.js uses .find(), which silently
-- picks one). So when two sources both report steps, one must win -- and the fix
-- is a precedence rule, never relaxing that unique key.
--
-- Weight needs it for a different reason: many weigh-ins per day are legitimate,
-- so nothing would stop the same scale reading arriving twice through two
-- sources and skewing the per-date average in src/utils/energyBalanceRead.js.
--
-- Cardio is deliberately NOT here: workouts are additive, and two sources
-- reporting different sessions is correct. Duplicate sessions are caught by the
-- external_id dedupe index instead.
create table if not exists public.device_metric_preferences (
  user_id       uuid not null references auth.users(id) on delete cascade,
  metric        text not null,
  connection_id uuid not null references public.device_connections(id) on delete cascade,
  updated_at    timestamptz not null default now(),
  primary key (user_id, metric),
  constraint device_metric_pref_metric_check check (metric in ('steps', 'weight'))
);

alter table public.device_metric_preferences enable row level security;

drop policy if exists "device_metric_prefs_owner" on public.device_metric_preferences;
create policy "device_metric_prefs_owner" on public.device_metric_preferences
  for select to authenticated using (user_id = auth.uid());

grant select on public.device_metric_preferences to anon, authenticated;
grant select, insert, update, delete on public.device_metric_preferences to service_role;

-- Tombstones for rows the user deleted.
--
-- Without this, deleting a synced number makes it reappear on the next sync.
-- "I deleted it and it came back" is the single most corrosive bug this feature
-- could ship with, and for steps it is the COMMON path, not an edge case:
-- deleting the device number in order to type your own is exactly what someone
-- does when the device is wrong.
--
-- dedupe_key is the provider's record id for weight and cardio; for steps, which
-- has no per-record id, it is the local ISO date.
create table if not exists public.device_dismissals (
  connection_id uuid not null references public.device_connections(id) on delete cascade,
  metric        text not null,
  dedupe_key    text not null,
  created_at    timestamptz not null default now(),
  primary key (connection_id, metric, dedupe_key),
  constraint device_dismissals_metric_check check (metric in ('steps', 'weight', 'cardio'))
);

-- Internal: the browser never reads or writes tombstones directly, they are a
-- side effect of a delete. RLS on with no policies, service_role only -- the
-- rate_limits / ai_cache shape.
alter table public.device_dismissals enable row level security;
grant select, insert, update, delete on public.device_dismissals to service_role;

-- Affirmative, SEPARATE consent to collect health data from a device and to
-- share it with a coach.
--
-- WA My Health My Data / NV SB370 / CT require consent to COLLECT and consent to
-- SHARE to be separate affirmations, plus a right to withdraw -- which is why
-- this is two rows and not one boolean. Closes the device half of the
-- "Consent (health data) -- TODO" item in compliance/data-map.md section 4; the
-- base-app collection case is still open.
--
-- Whoop's API terms also independently require "explicit opt-in consent from the
-- user" before exposing their data to a third party such as a coach, so this
-- table is what would make that provider usable at all.
create table if not exists public.health_data_consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null,
  -- Provider id for device consents; null for an app-wide consent.
  scope          text,
  policy_version text not null,
  granted_at     timestamptz not null default now(),
  withdrawn_at   timestamptz,
  constraint health_data_consents_kind_check check (kind in (
    'device_collect', 'device_share_coach'
  ))
);

create index if not exists health_data_consents_lookup_idx
  on public.health_data_consents (user_id, kind, scope)
  where withdrawn_at is null;

alter table public.health_data_consents enable row level security;

drop policy if exists "health_data_consents_owner" on public.health_data_consents;
create policy "health_data_consents_owner" on public.health_data_consents
  for select to authenticated using (user_id = auth.uid());

grant select on public.health_data_consents to anon, authenticated;
grant select, insert, update, delete on public.health_data_consents to service_role;

notify pgrst, 'reload schema';
