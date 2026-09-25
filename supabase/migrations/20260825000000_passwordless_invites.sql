-- Passwordless client onboarding (docs/passwordless-auth-design.md).
--
-- The invite token is a 122-bit random uuid delivered to the invitee's inbox --
-- that IS proof of email possession, the same proof an emailed OTP establishes.
-- So we stop discarding it and let it buy a session directly: exactly once,
-- before it expires, and ONLY for an email that has no account yet. A forwarded
-- link can therefore CREATE an account (bounded, recoverable); it can never
-- ENTER an existing one (that would be takeover). That asymmetry is the whole
-- security model -- see accept_invitation below and the `redeem-invite` fn.
--
-- We deliberately ship no IP rate limiting on redemption (single-use + expiry
-- is the defense), which makes the single-use claim in accept_invitation
-- LOAD-BEARING: it must be atomic, or two concurrent redeems both win.

-- 1) Invites expire and are single-use ------------------------------------
-- The table only ever had created_at, so tokens were valid forever.
alter table public.invitations
  add column if not exists expires_at  timestamptz,
  add column if not exists redeemed_at timestamptz;

-- Backfill live invites off their own created_at, then make the default apply
-- to new rows. (Two steps so existing pending invites don't all get 14 days
-- from *now* -- an invite sent 3 months ago should already be expired.)
update public.invitations
   set expires_at = coalesce(created_at, now()) + interval '14 days'
 where expires_at is null;

alter table public.invitations
  alter column expires_at set default (now() + interval '14 days'),
  alter column expires_at set not null;

-- NOTE: service_role deliberately gets NO table grant here. It has none today
-- (see the notify-invite header comment) and does not need one: every read and
-- write below goes through a SECURITY DEFINER function, which executes as the
-- table owner rather than as the caller. `redeem-invite` therefore never
-- touches public.invitations directly, and least privilege is preserved.

-- 2) The token-gated lookup stops returning dead invites -------------------
-- Same signature/semantics as 20260615000000; expiry + single-use added.
create or replace function public.get_invitation_by_token(p_token text)
returns setof public.invitations
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.invitations
  where token::text = p_token
    and status = 'pending'
    and redeemed_at is null
    and expires_at > now()
  limit 1;
$$;

revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated;

-- 3) Does this email already have an account? ------------------------------
-- Decides the redeem branch: no account -> the token mints a session; account
-- exists -> the caller must prove possession by OTP first. Returns a bare
-- boolean and is service_role-only, so it can't be used to enumerate users.
create or replace function public.auth_user_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
$$;

revoke all on function public.auth_user_exists(text) from public, anon, authenticated;
grant execute on function public.auth_user_exists(text) to service_role;

-- 4) The atomic accept -----------------------------------------------------
-- Every database mutation of an invite acceptance, in ONE transaction. This
-- replaces three sequential client-side writes (profiles upsert, coach_clients
-- upsert, invitations flip) whose partial failure -- a closed tab mid-sequence
-- -- stranded a client with a profile but no coach.
--
-- Two callers, one function:
--   * service_role (the `redeem-invite` edge fn, brand-new account): passes the
--     user id it just created.
--   * authenticated (the browser, when the invitee already had an account and
--     has just signed in by OTP): p_user_id is IGNORED and auth.uid() is used,
--     so a caller cannot accept an invite on somebody else's behalf.
create or replace function public.accept_invitation(
  p_token     text,
  p_user_id   uuid default null,
  p_full_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_user_id     uuid;
  v_user_email  text;
  v_invite      public.invitations%rowtype;
  v_role        text;
begin
  v_caller_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  );

  -- Only a trusted server caller may name the user; everyone else is themselves.
  if v_caller_role = 'service_role' then
    v_user_id := p_user_id;
  else
    v_user_id := auth.uid();
  end if;

  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select email into v_user_email from auth.users where id = v_user_id;
  if v_user_email is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- FOR UPDATE is what makes single-use atomic: a concurrent redeem of the same
  -- token blocks here, and once this transaction commits it sees redeemed_at
  -- set and raises invite_already_used. Exactly one caller wins.
  select * into v_invite
    from public.invitations
   where token::text = p_token
     for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if v_invite.status <> 'pending' or v_invite.redeemed_at is not null then
    raise exception 'invite_already_used' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;

  -- The invite names an email; only that mailbox's owner may redeem it. In the
  -- service_role path this holds by construction (we just created the user with
  -- this address) -- checked anyway so the guarantee lives in one place.
  if lower(v_user_email) <> lower(v_invite.client_email) then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  -- A coach account can never become somebody's client.
  select role into v_role from public.profiles where id = v_user_id;
  if v_role = 'coach' then
    raise exception 'coach_cannot_accept' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.coach_clients
     where client_id = v_user_id and status = 'active'
  ) then
    raise exception 'already_coached' using errcode = '42501';
  end if;

  -- profiles first: coach_clients.client_id references it.
  -- A returning solo user becomes a client here; their own full_name wins over
  -- whatever was typed on the join form.
  insert into public.profiles (id, email, role, full_name)
  values (v_user_id, v_user_email, 'client', nullif(p_full_name, ''))
  on conflict (id) do update set
    role      = 'client',
    email     = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

  insert into public.coach_clients (coach_id, client_id, status, offboarded_at, lock_cleared_at)
  values (v_invite.coach_id, v_user_id, 'active', null, null)
  on conflict (coach_id, client_id) do update set
    status         = 'active',
    offboarded_at  = null,
    lock_cleared_at = null;

  update public.invitations
     set status = 'accepted', redeemed_at = now()
   where id = v_invite.id;

  return v_invite.coach_id;
end;
$$;

revoke all on function public.accept_invitation(text, uuid, text) from public, anon;
grant execute on function public.accept_invitation(text, uuid, text) to authenticated, service_role;
