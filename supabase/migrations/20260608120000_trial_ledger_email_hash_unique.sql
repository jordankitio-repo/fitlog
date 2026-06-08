-- Enforce one trial_ledger row per email_hash.
--
-- Without a unique index on email_hash, the PostgREST upsert
-- (Prefer: resolution=merge-duplicates, on_conflict=email_hash) cannot match an
-- existing row, so every checkout inserted a NEW row. The eligibility read
-- (email_hash=eq.X & limit=1) then returned a nondeterministic row — which
-- caused both the early-burned trial and the repeat free trial on re-signup.
--
-- This migration is idempotent and safe to run whether or not duplicates exist.

-- 1. Collapse the boolean flags across duplicate rows so no "used" flag is lost.
update trial_ledger t
set coach_trial_used = m.coach_trial_used,
    solo_trial_used = m.solo_trial_used
from (
  select email_hash,
         bool_or(coalesce(coach_trial_used, false)) as coach_trial_used,
         bool_or(coalesce(solo_trial_used, false))  as solo_trial_used
  from trial_ledger
  group by email_hash
) m
where t.email_hash = m.email_hash;

-- 2. Delete all but one row per email_hash (flags already merged in step 1).
delete from trial_ledger a
using trial_ledger b
where a.email_hash = b.email_hash
  and a.ctid > b.ctid;

-- 3. Enforce uniqueness so future upserts target email_hash correctly.
create unique index if not exists trial_ledger_email_hash_key
  on trial_ledger (email_hash);
