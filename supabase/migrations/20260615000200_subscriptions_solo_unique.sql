-- subscriptions enforced UNIQUE(coach_id) but had nothing on solo_id, so a race
-- (or a missed pre-check in create-checkout-session) could create duplicate solo
-- subscription rows. Collapse any existing duplicates (keep the most "real" row
-- per solo_id), then add a partial unique index so it cannot recur.
--
-- Idempotent and safe to run whether or not duplicates exist (mirrors the
-- trial_ledger dedup in 20260608120000).

-- 1. Delete duplicate solo rows, keeping the Stripe-linked / most recent one.
delete from public.subscriptions s
using (
  select id,
         row_number() over (
           partition by solo_id
           order by (stripe_subscription_id is not null) desc, created_at desc
         ) as rn
  from public.subscriptions
  where solo_id is not null
) ranked
where s.id = ranked.id and ranked.rn > 1;

-- 2. Prevent recurrence. Partial so coach rows (solo_id null) are unaffected;
--    multiple NULL solo_id values remain allowed.
create unique index if not exists subscriptions_solo_id_unique
  on public.subscriptions (solo_id)
  where solo_id is not null;
