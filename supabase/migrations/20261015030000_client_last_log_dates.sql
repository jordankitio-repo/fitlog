-- The coach roster needs ONE fact per client: the date they last logged food.
-- computeClientStats was getting it by fetching every nutrition_log row for
-- every client on the roster, ordering by logged_date desc, and reading
-- clientLogs[0] — the whole history pulled across the wire to look at one field
-- per client. It grows with clients x days-since-signup and never stops: the
-- local demo seed alone is already 3,565 rows.
--
-- Worse than slow, it is quietly wrong wherever PostgREST's db-max-rows is set.
-- The ordering is global across the roster, so truncation drops the OLDEST rows
-- first and a long-dormant client falls out of the window entirely. Their
-- lastLogDate comes back null, daysSinceLog goes null with it, and the roster
-- stops being able to say how long they have been quiet — the dormant client
-- being exactly the one the dashboard exists to surface.
--
-- PostgREST aggregates would express this directly, but they are disabled on
-- this project (PGRST123 "Use of aggregate functions is not allowed"), so the
-- group-by lives here instead.
--
-- SECURITY INVOKER is deliberate and load-bearing: RLS on nutrition_log still
-- applies to the caller, so "Coaches can read clients nutrition logs" (scoped to
-- ACTIVE relationships by 20260615000100) keeps scoping the result. A coach that
-- passes arbitrary uuids gets back only the clients they could already read.
-- A SECURITY DEFINER here would have turned a read-your-own-roster helper into
-- a last-activity oracle for every user in the database.
create or replace function public.client_last_log_dates(p_client_ids uuid[])
returns table (user_id uuid, last_logged_date date)
language sql
security invoker
set search_path = public
stable
as $$
  select n.user_id, max(n.logged_date) as last_logged_date
  from public.nutrition_log n
  where n.user_id = any(p_client_ids)
  group by n.user_id;
$$;

grant execute on function public.client_last_log_dates(uuid[]) to authenticated;

-- Turns the per-client max() into an index-only backwards scan instead of a
-- heap scan over the client's whole logging history.
create index if not exists nutrition_log_user_logged_date_idx
  on public.nutrition_log (user_id, logged_date desc);
