-- 20260614120000 created public.notifications with RLS policies but no
-- table-level GRANTs, so it returned "permission denied for table
-- notifications" (42501): RLS decides which ROWS a role sees, but the role
-- still needs a GRANT to touch the table at all. This project grants
-- explicitly per table (see messages), so the new table needs the same.
--
-- authenticated: read + mark-read own rows (RLS scopes to user_id = auth.uid()).
-- service_role: full access for edge-function inserts (offboard-self,
--   delete-account) — service_role bypasses RLS but still needs the GRANT.
grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
