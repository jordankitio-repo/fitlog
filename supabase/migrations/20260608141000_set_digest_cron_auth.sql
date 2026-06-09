-- One-shot helper to rewrite the weekly-coach-digest cron command so it sends
-- the service role key (the function now requires it). Locked to service_role
-- so it isn't publicly callable; dropped immediately after use.
create or replace function public._set_digest_cron_auth(p_key text)
returns text language plpgsql security definer set search_path = public, cron, pg_catalog as $$
declare v_jobid bigint; v_cmd text;
begin
  select jobid into v_jobid from cron.job where jobname = 'weekly-coach-digest';
  if v_jobid is null then return 'no job'; end if;
  v_cmd := format(
    $f$select net.http_post(url := 'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/weekly-digest', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'), body := '{}'::jsonb);$f$,
    p_key);
  perform cron.alter_job(v_jobid, command => v_cmd);
  return 'updated job ' || v_jobid;
end $$;
revoke execute on function public._set_digest_cron_auth(text) from public, anon, authenticated;
grant execute on function public._set_digest_cron_auth(text) to service_role;
