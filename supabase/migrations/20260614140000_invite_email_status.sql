-- The invite box (coach) and the Join page both need to know whether an email
-- already has a Gardnr account, but profiles RLS (self-or-active-related) hides
-- other users' rows — so a coach checking an arbitrary email, and an anon invite
-- visitor, both read null and the "existing account" states never fired.

-- 1) Coach side: a SECURITY DEFINER lookup that exposes ONLY {id, role} for a
--    given email, to authenticated callers. No other profile data is revealed.
create or replace function public.invite_email_status(p_email text)
returns table (id uuid, role text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.role
  from public.profiles p
  where p.email = lower(p_email)
  limit 1;
$$;

revoke all on function public.invite_email_status(text) from public, anon;
grant execute on function public.invite_email_status(text) to authenticated;

-- 2) Join side (anon): snapshot at invite-creation time whether the invited
--    email already has an account, so the unauthenticated Join page can show
--    "sign in to accept" vs "create account" without reading profiles. Stale
--    cases (account created/deleted between invite and accept) are caught by the
--    sign-up/sign-in fallback in the Join flow.
alter table public.invitations
  add column if not exists account_exists boolean not null default false;
