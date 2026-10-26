-- The coach's roster tools, and two holes found while building them.
--
--   1. Pausing a client (holiday, injury) without ending coaching.
--   2. Groups: labels a coach puts on clients, to filter and to message.
--   3. Automatic nudges: "nudge anyone quiet for N days", run daily.
--   4. A client could update their own coach_clients row (lift their own
--      progress lock, un-hide calories, end their own pause).
--   5. A coach could insert a message addressed to any user, not only to
--      their own clients.

-- ── 1. Pause ───────────────────────────────────────────────────────────────
-- A pause is a date range on the live relationship, not a status: the coach
-- keeps read access (RLS keys on status = 'active') and the client keeps
-- logging if they want. It ends on its own when paused_until passes, so
-- nothing has to wake up to resume it.
alter table public.coach_clients
  add column if not exists paused_until date,
  add column if not exists pause_reason text check (pause_reason is null or char_length(pause_reason) <= 120),
  add column if not exists paused_at timestamptz;

-- ── 4. A client cannot rewrite their relationship row ──────────────────────
-- coach_clients_update_by_client let a client update every column of their
-- own row. Nothing in the app does that (offboarding goes through the
-- offboard-self function, as service_role), so the client's write is refused
-- outright rather than column by column. service_role (auth.uid() null) and
-- the coach are untouched.
create or replace function public.coach_clients_guard_client_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and auth.uid() = old.client_id
     and auth.uid() is distinct from old.coach_id then
    raise exception 'coach_clients is managed by the coach' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists coach_clients_guard_client_update on public.coach_clients;
create trigger coach_clients_guard_client_update
  before update on public.coach_clients
  for each row execute function public.coach_clients_guard_client_update();

-- ── 5. Messages go only between a coach and their own clients ─────────────
-- users_access_own_messages checks only that the writer is one of the two
-- parties, so a coach could address a message to anyone. Inserts now need a
-- live relationship between the two, and the sender must be one of them.
create or replace function public.messages_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- service_role
  end if;
  if new.sender_id is distinct from auth.uid()
     or auth.uid() not in (new.coach_id, new.client_id) then
    raise exception 'sender must be one of the two parties' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.coach_clients
    where coach_id = new.coach_id and client_id = new.client_id and status = 'active'
  ) then
    raise exception 'no active coaching relationship' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_insert on public.messages;
create trigger messages_guard_insert
  before insert on public.messages
  for each row execute function public.messages_guard_insert();

-- ── 2. Groups ──────────────────────────────────────────────────────────────
create table if not exists public.coach_groups (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  created_at  timestamptz not null default now()
);
create unique index if not exists coach_groups_name_per_coach
  on public.coach_groups (coach_id, lower(btrim(name)));

create table if not exists public.coach_group_members (
  group_id    uuid not null references public.coach_groups(id) on delete cascade,
  client_id   uuid not null references auth.users(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (group_id, client_id)
);
create index if not exists coach_group_members_client on public.coach_group_members (client_id);

alter table public.coach_groups enable row level security;
alter table public.coach_group_members enable row level security;

-- The coach's own labels; a client never sees which groups they are in.
drop policy if exists coach_groups_own on public.coach_groups;
create policy coach_groups_own on public.coach_groups
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- A member row needs the group to be the coach's AND the client to be the
-- coach's active client, so a coach cannot label someone else's client.
drop policy if exists coach_group_members_own on public.coach_group_members;
create policy coach_group_members_own on public.coach_group_members
  for all to authenticated
  using (exists (select 1 from public.coach_groups g where g.id = group_id and g.coach_id = auth.uid()))
  with check (
    exists (select 1 from public.coach_groups g where g.id = group_id and g.coach_id = auth.uid())
    and exists (
      select 1 from public.coach_clients cc
      where cc.coach_id = auth.uid() and cc.client_id = coach_group_members.client_id and cc.status = 'active'
    )
  );

grant select, insert, update, delete on public.coach_groups, public.coach_group_members to authenticated;

-- ── 3. Automatic nudges ────────────────────────────────────────────────────
-- One rule per coach for now: nudge a client who has not logged food for
-- nudge_after_days days. Off when null. The auto-nudge function applies the
-- same 48-hour cooldown the Nudge button does, skips paused clients, and
-- respects the client's own email preference.
create table if not exists public.coach_automations (
  coach_id          uuid primary key references auth.users(id) on delete cascade,
  nudge_after_days  smallint check (nudge_after_days is null or nudge_after_days between 2 and 14),
  updated_at        timestamptz not null default now()
);
alter table public.coach_automations enable row level security;
drop policy if exists coach_automations_own on public.coach_automations;
create policy coach_automations_own on public.coach_automations
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());
grant select, insert, update, delete on public.coach_automations to authenticated;
