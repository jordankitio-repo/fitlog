-- TEMP debug: report RLS enablement for every public table.
create or replace function public.debug_all_rls()
returns jsonb language sql security definer set search_path = public, pg_catalog stable as $$
  select coalesce(jsonb_object_agg(c.relname, jsonb_build_object(
           'rls_enabled', c.relrowsecurity, 'policy_count',
           (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
         )), '{}'::jsonb)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r';
$$;
grant execute on function public.debug_all_rls() to anon, authenticated;
