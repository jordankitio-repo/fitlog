-- Message retention: 24 months, per Privacy Policy §7 and the Consumer Health
-- Data Policy §7.
--
-- Messages are the one category that ages out. Logs, check-ins and reports are
-- kept for the life of the account because the history IS the product; a
-- conversation is the opposite — it is the most sensitive thing stored here
-- (clients disclose injuries, medication, disordered eating to their coach) and
-- the least useful at age. The published text promises this is automatic and
-- permanent, so this is a hard delete, not a soft flag.
--
-- DEPLOY ORDER MATTERS. The policy text must be live BEFORE this job first
-- runs: the previous §7 promised retention for the life of the account, and
-- removing data sooner than the published policy allows is the exact problem
-- this whole change exists to avoid. Ship the frontend (policy) first, then
-- this migration.
create or replace function public.purge_expired_messages()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_deleted integer;
begin
  delete from public.messages
  where created_at < now() - interval '24 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- Not callable by a user. It removes rows across every account, so it is
-- reachable only by the scheduler, matching how the weekly-digest job is
-- locked down.
revoke execute on function public.purge_expired_messages() from public, anon, authenticated;
grant execute on function public.purge_expired_messages() to service_role;

-- Daily, off-peak. Guarded on the extension so this migration still applies on
-- a local Supabase (which has no pg_cron) — there the function is created and
-- simply never scheduled, which is the correct local behaviour anyway.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'purge-expired-messages') then
      perform cron.unschedule('purge-expired-messages');
    end if;
    perform cron.schedule(
      'purge-expired-messages',
      '30 3 * * *',
      'select public.purge_expired_messages();'
    );
  end if;
end $$;
