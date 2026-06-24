-- Per-user rate limiting for the cost-bearing AI edge functions (nutrition-coach,
-- weekly-report, call-prep). These are auth-gated, but a single authenticated user
-- could still loop them and run up Anthropic spend / scrape generated text. A fixed
-- window counter per (user, bucket) caps that without blocking normal use.

create table if not exists public.rate_limits (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  bucket       text        not null,
  window_start timestamptz not null default now(),
  count        integer     not null default 0,
  primary key (user_id, bucket)
);

-- Counters are internal: no anon/authenticated access. Only the SECURITY DEFINER
-- function below (and service_role, for maintenance) ever touch this table.
alter table public.rate_limits enable row level security;
grant select, insert, update, delete on public.rate_limits to service_role;

-- Atomic check-and-increment. Returns true if the call is within the limit for the
-- current window, false if it should be rejected. The edge function passes the uid
-- it already verified from the caller's JWT (the caller can't spoof another user's
-- uid — the function is service_role-only and the edge function controls p_user_id).
create or replace function public.check_rate_limit(
  p_user_id        uuid,
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
) returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
begin
  if p_user_id is null then
    return false;
  end if;

  insert into public.rate_limits as rl (user_id, bucket, window_start, count)
    values (p_user_id, p_bucket, v_now, 1)
  on conflict (user_id, bucket) do update
    set
      count = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds) then 1
        else rl.count + 1
      end,
      window_start = case
        when rl.window_start < v_now - make_interval(secs => p_window_seconds) then v_now
        else rl.window_start
      end
  returning rl.count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;

notify pgrst, 'reload schema';
