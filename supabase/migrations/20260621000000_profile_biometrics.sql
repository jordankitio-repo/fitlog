-- Onboarding biometrics for tracked users (solo + client). These are the
-- write-once-ish attributes the target math (utils/targetEstimate) needs but
-- that previously lived nowhere — the TargetCalculator collected them ad hoc and
-- threw them away. Stored on the profile so they (a) survive a solo→client role
-- change (same row, so they "transfer naturally"), and (b) are readable by an
-- active coach via the existing profiles SELECT policy, to inform target-setting.
-- Coaches do NOT edit these (clients own them); coaches control the `targets`
-- table only — see ClientView.
alter table public.profiles
  add column if not exists sex text check (sex in ('male', 'female')),
  add column if not exists birth_date date,
  add column if not exists height_cm numeric,
  add column if not exists activity_level text,
  add column if not exists primary_goal text,
  add column if not exists unit_preference text check (unit_preference in ('imperial', 'metric')),
  add column if not exists onboarded_at timestamptz;

-- Only brand-new users should hit the onboarding gate. Mark every existing
-- profile as already onboarded so the current user base is never nagged; new
-- signups get a null onboarded_at and see onboarding once.
update public.profiles
  set onboarded_at = coalesce(created_at, now())
  where onboarded_at is null;
