-- TEMP debug: inspect pg_cron jobs (esp. weekly-digest) so we can wire the gate.
create or replace function public.debug_cron()
returns jsonb language sql security definer set search_path = public, pg_catalog, cron stable as $$
  select jsonb_build_object(
    'pg_cron_installed', exists(select 1 from pg_extension where extname='pg_cron'),
    'pg_net_installed', exists(select 1 from pg_extension where extname='pg_net'),
    'jobs', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'jobid', jobid, 'schedule', schedule, 'jobname', jobname,
        'active', active, 'command', command
      )), '[]'::jsonb)
      from cron.job
    )
  );
$$;
grant execute on function public.debug_cron() to anon, authenticated;
