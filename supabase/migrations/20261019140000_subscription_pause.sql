-- Let a coach take a break without losing their practice.
--
-- Until now the only way to stop paying was to cancel, and cancelling
-- offboards every client: their roles flip to solo, the relationships end, and
-- they are all emailed about it. So a coach on parental leave, injured, or
-- going through a quiet season had to choose between paying for months they
-- would not work and dismantling the thing they would come back to. Most pick
-- the second and never come back, which makes this a retention feature wearing
-- a billing feature's clothes.
--
-- WHAT A PAUSE IS HERE
--
--   * Billing stops. Stripe's `pause_collection` with `behavior=void`, so
--     invoices during the pause are voided rather than accrued — the coach
--     comes back to no bill, not a backlog.
--   * NOTHING ELSE CHANGES. Clients keep logging, keep their history, keep
--     their coach. This is a deliberate departure from how most subscriptions
--     treat non-payment, and the reason is that in this product the person who
--     would lose access is not the person who stopped paying. A client did not
--     agree to anything; cutting off their logging streak because their coach
--     took leave punishes the wrong person.
--   * `pause_collection` does not change the Stripe subscription STATUS, which
--     stays `active`. That is what makes the paragraph above true with no code
--     changes to any access gate, and it is worth knowing before someone tries
--     to "fix" the status.
--
-- THE TWO LIMITS, which are what stop the above being a free account:
--
--   * Three months maximum, and Stripe resumes it automatically on the date
--     (`pause_collection[resumes_at]`). A pause that needs a human to end it
--     ends when someone remembers.
--   * Once per twelve months. Without it, pause-resume-pause is an indefinite
--     free subscription assembled out of legal moves, and nothing in the
--     system would ever flag it.

alter table public.subscriptions
  -- When Stripe will resume collection. NULL means not paused: there is no
  -- separate boolean, because two fields that must agree eventually will not.
  add column if not exists paused_until timestamptz,
  -- When the most recent pause STARTED. Kept after the pause ends, because it
  -- is what the once-a-year rule is measured from. Clearing it on resume would
  -- make the rule trivially defeatable by resuming.
  add column if not exists last_paused_at timestamptz;

comment on column public.subscriptions.paused_until is
  'Stripe pause_collection.resumes_at. NULL = not paused.';
comment on column public.subscriptions.last_paused_at is
  'Start of the most recent pause. Survives the pause; drives the once-per-12-months limit.';

notify pgrst, 'reload schema';
