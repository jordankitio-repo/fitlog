-- Finishes a removal that was decided thirteen months ago and left half-done.
--
-- `reports.archived` shipped in May 2026 with a working client-side archive:
-- `archiveReport` / `unarchiveReport` on the Dashboard wrote it, and every
-- report query read it. In September the coach-surface rework deleted the
-- feature on purpose — "Archive is gone from the client: a filing chore for a
-- handful of letters" (a070598) — but only the WRITERS went. The four
-- `.eq('archived', false)` filters were carried into the new code, and an
-- "Archived" badge survived in the coach's sent-reports list.
--
-- So the column has been read on every report load and written by nothing for
-- thirteen months, and the escape hatch it represents is unreachable from any
-- screen. Keeping it was the worst of the three options: it looks like a
-- feature to anyone reading the schema, it silently hides rows, and the next
-- person to touch reports has to work out which.
--
-- ONE CONSEQUENCE, stated because it is visible to real users: any report a
-- client archived BEFORE September is currently hidden from them and shows a
-- badge to their coach. Dropping the column makes those reports appear in the
-- client's list again, in date order with everything else. That is the
-- behaviour the September decision chose — old ones fall down the list — but it
-- is a change those clients can see, so check the count before deploying:
--
--   select count(*) from public.reports where archived;
--
-- If that is zero, as it is expected to be for anything after the control was
-- removed, this is invisible to everyone.
alter table public.reports drop column if exists archived;

notify pgrst, 'reload schema';
