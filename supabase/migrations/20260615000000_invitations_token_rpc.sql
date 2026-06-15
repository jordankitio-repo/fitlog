-- Invitations were world-readable: the "Anyone can read invitation by token"
-- policy is FOR SELECT USING (true). RLS cannot scope a SELECT to the query's
-- token=eq.X filter, so the ENTIRE table was enumerable by any user (including
-- anon) — every invitee email (PII), every coach_id, and every join token
-- (a secret credential that lets the holder join a coach).
--
-- Fix: drop the blanket read policy and serve the unauthenticated Join page via
-- a token-gated SECURITY DEFINER lookup. You can only fetch an invite if you
-- already hold its (secret) token — no enumeration. Coaches keep full access to
-- their own rows via the existing "Coaches can manage their invitations" policy.

drop policy if exists "Anyone can read invitation by token" on public.invitations;

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
  limit 1;
$$;

revoke all on function public.get_invitation_by_token(text) from public;
grant execute on function public.get_invitation_by_token(text) to anon, authenticated;
