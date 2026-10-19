-- Grant service_role full DML on weight_log, cardio_log and steps_log.
--
-- These three were MISSED by 20260624120000_service_role_grants_erasure, which
-- fixed exactly this bug for the five tables created after the base schema.
-- The prod dump (supabase/schema/prod_public.sql:773-775, 833-835, 855-857)
-- shows all three granting service_role only REFERENCES,TRIGGER,TRUNCATE,MAINTAIN
-- -- no insert/update/delete -- while authenticated has ALL.
--
-- Why that is a live erasure bug, not a theoretical one: delete-account erases a
-- user's rows with the service-role REST client and does NOT check any DELETE's
-- response (supabase/functions/delete-account/index.ts:427-429). Without the
-- grant those DELETEs return 42501 and SILENTLY no-op, so a deleted account's
-- weight, cardio and step history survives. Worse than the 20260624120000 case:
-- user_id on these three tables has no foreign key to auth.users, so there is no
-- ON DELETE CASCADE to clean up behind the failed DELETE either -- the rows
-- orphan permanently, with the owning auth user gone.
--
-- That breaks right-to-erasure (FTC Health Breach Notification Rule + the state
-- consumer-health-data laws in compliance/data-map.md section 3), and all three
-- tables are classified health data there.
--
-- The local RLS suite does NOT catch this: tests/rls/isolation.test.js's erasure
-- contract already covers these three and passes, because a local `supabase
-- start` creates tables through the normal flow and they inherit the platform
-- default privileges that prod's pooler-created tables never got. The test is
-- right; the environment it runs in is more permissive than prod.
--
-- Idempotent: re-granting an existing privilege is a harmless no-op, so this is
-- safe to apply whether or not prod already has the grants.

grant select, insert, update, delete on public.weight_log to service_role;
grant select, insert, update, delete on public.cardio_log to service_role;
grant select, insert, update, delete on public.steps_log  to service_role;

notify pgrst, 'reload schema';
