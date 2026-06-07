alter table public.subscriptions
add column if not exists paused_trial_days_remaining integer;
