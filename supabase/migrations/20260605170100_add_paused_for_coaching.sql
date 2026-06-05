alter table public.subscriptions
add column if not exists paused_for_coaching boolean not null default false;
