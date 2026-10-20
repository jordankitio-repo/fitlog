-- Stripe delivers the same event more than once, on purpose.
--
-- It retries any delivery it does not get a 2xx for, and it can send a
-- duplicate even when it did — "at least once" is the contract, and building
-- against "exactly once" is building against something nobody promised.
--
-- Most of the webhook copes with that already by accident: setting a status to
-- `active` twice is the same as setting it once. Two handlers do real work and
-- do not:
--
--   * `customer.subscription.deleted` offboards every one of that coach's
--     clients, flips their roles to solo, and emails all of them. A duplicate
--     delivery emails a whole roster a second time.
--   * `checkout.session.completed` burns the free trial in `trial_ledger`.
--
-- So the webhook needs to recognise an event it has already handled.
--
-- WHY A CLAIM RATHER THAN A PLAIN "HAVE I SEEN THIS" CHECK. The obvious
-- version — insert the id, skip if it conflicts — turns a crash halfway
-- through into permanent silence: the id is recorded, Stripe retries, we skip,
-- and the work never happens. Recording it only AFTER success has the opposite
-- failure, where a retry that arrives while the first is still running does
-- everything twice.
--
-- This claims the event instead. The claim is marked `processed_at` when the
-- work finishes, and an unfinished claim becomes reclaimable after a few
-- minutes — long enough that a still-running attempt is not interrupted, short
-- enough that Stripe's retry schedule can pick it up.

create table if not exists public.stripe_events (
  id           text        primary key,   -- Stripe's own event id, evt_...
  type         text        not null,
  claimed_at   timestamptz not null default now(),
  processed_at timestamptz
);

-- Internal bookkeeping. No user ever reads this, so no policy grants access to
-- anyone but the service role the webhook runs as.
alter table public.stripe_events enable row level security;
grant select, insert, update, delete on public.stripe_events to service_role;

-- Housekeeping: this table only has to remember long enough to outlive Stripe's
-- retry window (~3 days). The index makes a periodic prune cheap.
create index if not exists stripe_events_claimed_idx
  on public.stripe_events (claimed_at);

-- How long an unfinished claim is treated as in-flight. Stripe's first retry is
-- an hour out, so five minutes never races a live attempt.
--
-- Returns TRUE if the caller should process this event, FALSE if it is already
-- done or currently being handled by someone else.
create or replace function public.claim_stripe_event(
  p_event_id text,
  p_type     text
) returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into public.stripe_events as e (id, type)
    values (p_event_id, p_type)
  on conflict (id) do update
    -- Re-claim only an attempt that never finished AND has gone quiet. The
    -- WHERE is what makes this atomic: two concurrent deliveries both run this
    -- statement, and exactly one of them can match.
    set claimed_at = now()
    where e.processed_at is null
      and e.claimed_at < now() - interval '5 minutes'
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

-- Marks the work done, so the claim is never handed out again.
create or replace function public.complete_stripe_event(p_event_id text)
  returns void
  language sql
  security definer
  set search_path = public
as $$
  update public.stripe_events set processed_at = now() where id = p_event_id;
$$;

-- `from public` alone would leave the EXECUTE that platform default privileges
-- grant to anon and authenticated — the trap documented in
-- 20260625000000_rate_limit_lockdown and hit again in
-- 20261019100000_notification_preferences. Both of these are SECURITY DEFINER,
-- and a signed-in user who could call claim_stripe_event could mark a real
-- Stripe event as handled and make the webhook drop it.
revoke all on function public.claim_stripe_event(text, text) from public, anon, authenticated;
revoke all on function public.complete_stripe_event(text) from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text, text) to service_role;
grant execute on function public.complete_stripe_event(text) to service_role;

notify pgrst, 'reload schema';
