-- Step-up re-authentication for irreversible actions
-- (docs/passwordless-auth-design.md §4.5).
--
-- The gap this closes exists TODAY, with passwords: anyone holding a live
-- session can permanently erase the account, and nothing re-checks that the
-- person at the keyboard is the account owner. Session length was never the
-- control for that -- a shorter session just logs out the legitimate user more
-- often. Re-asking at the dangerous moment is.
--
-- Password changes do NOT use this table: GoTrue has its own reauthentication
-- nonce (auth.reauthenticate -> updateUser({password}, {nonce})), which is
-- enforced inside the auth server and therefore cannot be skipped by a modified
-- client. This table exists for the actions GoTrue knows nothing about, where
-- our own edge functions have to do the checking.
--
-- The plaintext code is NEVER stored: the edge function emails it and keeps only
-- its SHA-256 here, so a leak of this table cannot be replayed.

create table if not exists public.step_up_challenges (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  purpose     text        not null,
  code_hash   text        not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    integer     not null default 0,
  created_at  timestamptz not null default now(),
  primary key (user_id, purpose),
  constraint step_up_purpose_check check (purpose in ('delete_account'))
);

-- Internal, like public.rate_limits: RLS on with no policies, no anon/
-- authenticated grants, and every access through the SECURITY DEFINER functions
-- below. A challenge is a credential; the browser must never be able to read one.
alter table public.step_up_challenges enable row level security;

-- Issue (or replace) the pending challenge for one purpose. Re-requesting a code
-- resets attempts and invalidates the previous code, so the most recent email is
-- always the one that works.
create or replace function public.issue_step_up(
  p_user_id     uuid,
  p_purpose     text,
  p_code_hash   text,
  p_ttl_seconds integer
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.step_up_challenges (user_id, purpose, code_hash, expires_at)
  values (p_user_id, p_purpose, p_code_hash, now() + make_interval(secs => p_ttl_seconds))
  on conflict (user_id, purpose) do update set
    code_hash   = excluded.code_hash,
    expires_at  = excluded.expires_at,
    attempts    = 0,
    consumed_at = null,
    created_at  = now();
$$;

-- Check and consume. Returns true at most ONCE per issued code.
--
-- FOR UPDATE for the same reason accept_invitation takes it: without the row
-- lock two concurrent verifications of the same code can both observe it
-- unconsumed and both succeed, which turns a single-use credential into a
-- reusable one. Attempts are counted on every try (including wrong codes) so a
-- 6-digit space cannot be walked -- 5 tries, then the challenge is dead and a
-- new email is required.
create or replace function public.verify_step_up(
  p_user_id   uuid,
  p_purpose   text,
  p_code_hash text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.step_up_challenges%rowtype;
begin
  select * into v
    from public.step_up_challenges
   where user_id = p_user_id and purpose = p_purpose
     for update;

  if not found then return false; end if;
  if v.consumed_at is not null or v.expires_at <= now() or v.attempts >= 5 then
    return false;
  end if;

  -- Count the attempt before judging it, so a wrong guess still burns a try.
  update public.step_up_challenges
     set attempts = attempts + 1
   where user_id = p_user_id and purpose = p_purpose;

  if v.code_hash <> p_code_hash then
    return false;
  end if;

  update public.step_up_challenges
     set consumed_at = now()
   where user_id = p_user_id and purpose = p_purpose;

  return true;
end;
$$;

revoke all on function public.issue_step_up(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.verify_step_up(uuid, text, text) from public, anon, authenticated;
grant execute on function public.issue_step_up(uuid, text, text, integer) to service_role;
grant execute on function public.verify_step_up(uuid, text, text) to service_role;
