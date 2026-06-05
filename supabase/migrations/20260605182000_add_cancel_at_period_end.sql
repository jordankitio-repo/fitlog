alter table public.subscriptions
add column if not exists cancel_at_period_end boolean not null default false;
