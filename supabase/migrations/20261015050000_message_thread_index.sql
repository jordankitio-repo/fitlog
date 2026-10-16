-- Supports the windowed thread reads (src/utils/messageThread.js). Every thread
-- surface now asks for "the newest N messages of one thread", i.e. filter on
-- client_id and ORDER BY created_at DESC with a LIMIT. The table had only its
-- primary key, so that plan was a filter plus a full sort of the thread on
-- every open — which the windowing made cheap to fix and pointless to skip.
--
-- client_id leads because it is the selective column and is present in all
-- three queries; the coach's view additionally filters coach_id, which is a
-- cheap recheck once a single client's rows are isolated.
create index if not exists messages_client_created_idx
  on public.messages (client_id, created_at desc);

-- Retention scans the whole table by age, with no thread filter, so it needs
-- its own ordering.
create index if not exists messages_created_at_idx
  on public.messages (created_at);
