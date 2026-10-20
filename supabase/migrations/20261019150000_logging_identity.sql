-- The three facts a person's logging history says about them: how many days
-- they have logged, the longest run they have ever put together, and the run
-- they are on now.
--
-- WHY IN SQL. The page computed the current streak in the browser by pulling
-- 60 days of `logged_date`, de-duplicating them into a Set and walking
-- backwards day by day. That works, and it has two problems the moment you
-- want more than one fact out of it:
--
--   * It is capped at 60 by its own query window, and `MILESTONES` on that
--     page lists 90. **A 90-day streak could not be reported, so that
--     milestone was unreachable** — the celebration existed, the email
--     existed, and nothing could ever trigger either.
--   * "Longest ever" and "days logged" cannot come from a 60-day window at
--     all, and widening the window to answer them means shipping every logged
--     date a user has ever written to the browser to be counted there.
--
-- Doing it here answers all three in one round trip, over the whole history,
-- with one definition of the word "streak". Two definitions of a streak on one
-- screen is worse than no streak at all.
--
-- `p_today` is the caller's LOCAL date, passed in rather than taken from
-- `current_date`. Postgres would answer in the server's timezone, which is UTC
-- — so a user west of Greenwich logging in the evening has a local date one
-- behind the server's, and their streak would read as broken for the last few
-- hours of every day. The app already formats dates locally for exactly this
-- reason; this keeps the boundary in one place instead of introducing a second
-- opinion about what day it is.
create or replace function public.logging_identity(p_today date)
returns table (
  days_logged    integer,
  current_streak integer,
  longest_streak integer,
  logged_today   boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  -- Gaps and islands: subtracting a row number from a date makes every
  -- consecutive run share one constant, so grouping by it counts the runs.
  with days as (
    select distinct logged_date as d
      from public.nutrition_log
     where user_id = auth.uid()
       and logged_date <= p_today
  ),
  islands as (
    select d, (d - (row_number() over (order by d))::integer) as grp
      from days
  ),
  runs as (
    select grp, count(*)::integer as len, max(d) as last_day
      from islands
     group by grp
  )
  select
    (select count(*)::integer from days),
    -- The run ending today OR yesterday. Yesterday counts because a streak is
    -- not broken until a whole day passes without a log — otherwise everyone's
    -- streak would read 0 every morning until they ate. This matches the
    -- behaviour the browser version had, which is the point: the number must
    -- not change meaning because it moved.
    coalesce((
      select len from runs
       where last_day >= p_today - 1
       order by last_day desc
       limit 1
    ), 0),
    coalesce((select max(len) from runs), 0),
    exists (select 1 from days where d = p_today);
$$;

-- Deliberately callable by `authenticated`, unlike the service-role-only
-- functions added earlier today. This one is SECURITY INVOKER and reads the
-- caller's own rows through RLS, so a signed-in user asking it about
-- themselves is the entire point. `auth.uid()` inside it means there is no
-- argument to pass someone else's id in.
grant execute on function public.logging_identity(date) to authenticated;

notify pgrst, 'reload schema';
