-- Coach billing cadence (monthly / 6mo / annual). Nullable: pre-existing rows
-- and solo subs have none. Written by stripe-webhook from the checkout session's
-- subscription metadata (`cadence`), which create-checkout-session sets from the
-- validated cadence key. Purely for display (Profile shows the plan + renewal);
-- the source of truth for what is charged remains the Stripe price.
alter table public.subscriptions
add column if not exists billing_interval text;
