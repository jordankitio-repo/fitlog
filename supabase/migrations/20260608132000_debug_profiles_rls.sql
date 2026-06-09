-- TEMP debug: expose profiles RLS status + policy set so we can see live state.
-- Removed immediately after inspection by the next migration.
create or replace function public.debug_profiles_rls()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select jsonb_build_object(
    'rls_enabled', (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
    'rls_forced',  (select relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass),
    'policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', policyname, 'cmd', cmd, 'permissive', permissive,
        'roles', roles::text, 'qual', qual, 'check', with_check
      )), '[]'::jsonb)
      from pg_policies where schemaname='public' and tablename='profiles'
    )
  );
$$;
grant execute on function public.debug_profiles_rls() to anon, authenticated;
