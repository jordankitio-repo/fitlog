alter table public.profiles
add column if not exists offboarded_at timestamptz,
add column if not exists offboard_reason text;
