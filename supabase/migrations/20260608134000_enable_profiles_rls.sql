-- ROOT CAUSE FIX: Row Level Security was never enabled on public.profiles, so
-- the SELECT/INSERT/UPDATE policies on it were defined but silently ignored —
-- any authenticated user could read (and the table was effectively unprotected).
-- Every other public table already has RLS enabled. Enabling it here activates
-- the scoped policies created in 20260608131000.
alter table public.profiles enable row level security;

-- Remove the temporary debug helpers used to diagnose this.
drop function if exists public.debug_profiles_rls();
drop function if exists public.debug_all_rls();
