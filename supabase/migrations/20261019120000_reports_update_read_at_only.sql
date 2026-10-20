-- A client could rewrite the report their coach wrote about them.
--
-- The policy is called "Clients can update their report read status" and it
-- restricts the ROW, not the COLUMN:
--
--   FOR UPDATE USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id)
--
-- Every column on that row is therefore writable by the client, `content`
-- included. Demonstrated against the local stack before this migration was
-- written: a client UPDATE replaced a coach's report body with their own text,
-- no error, and the coach's own sent-reports list then showed the altered
-- version back to them, because both sides read the same row. A coaching
-- assessment the client can edit is not an assessment.
--
-- The policy name is the whole bug. It describes an intent that RLS cannot
-- express — **RLS filters rows; it has no opinion about columns** — and it has
-- read as correct in every review since it was written.
--
-- Column privileges are the mechanism that does express it. Verified against
-- every writer in the codebase first, because a column grant is role-wide and
-- would break anything that needs more:
--
--   coach  -> INSERT only (ClientView, when they send a report). Never UPDATE.
--   client -> UPDATE read_at only (Reports.jsx, on open).
--
-- So nothing legitimate loses a capability here. If a coach ever needs to edit
-- a sent report, that is an explicit column grant at that time, which is the
-- point: the next person has to say which column they mean.
revoke update on public.reports from authenticated;
grant update (read_at) on public.reports to authenticated;

-- service_role keeps whole-table UPDATE: erasure and any future backfill run
-- through it, and it bypasses RLS by design.
grant update on public.reports to service_role;

notify pgrst, 'reload schema';
