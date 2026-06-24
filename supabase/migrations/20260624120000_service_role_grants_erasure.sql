-- Grant service_role full DML on the user-data tables that were created after the
-- base schema and only ever granted to anon, authenticated.
--
-- Why this matters: the delete-account edge function erases a user's rows via the
-- service-role REST client and does NOT check each DELETE's response. Without a
-- service_role grant, those DELETEs return 42501 (permission denied) and SILENTLY
-- no-op — so body measurements, saved meals, completed-day markers, and a coach's
-- custom check-in questions would survive account deletion. That breaks right-to-
-- erasure (FTC Health Breach Notification Rule + state consumer-health-data laws).
--
-- Same class of bug as 20260614130000_notifications_grants: platform default-
-- privilege grants don't cover tables created outside the dashboard flow. RLS still
-- scopes rows for anon/authenticated; service_role bypasses RLS for admin erasure.
--
-- Idempotent: re-granting an existing privilege is a harmless no-op.

grant select, insert, update, delete on public.body_measurements to service_role;
grant select, insert, update, delete on public.saved_meals        to service_role;
grant select, insert, update, delete on public.saved_meal_items   to service_role;
grant select, insert, update, delete on public.day_complete       to service_role;
grant select, insert, update, delete on public.checkin_questions  to service_role;

notify pgrst, 'reload schema';
