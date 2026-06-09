-- Remove the temporary cron inspection + updater helpers now that the
-- weekly-coach-digest cron sends the service role key and the function gates on it.
drop function if exists public.debug_cron();
drop function if exists public._set_digest_cron_auth(text);
