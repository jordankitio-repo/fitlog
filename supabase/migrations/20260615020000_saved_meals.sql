-- Saved meals: a named bundle of foods a user can log in one tap (Cronometer
-- "Custom Meals"). Private to the owner — these are a personal logging
-- convenience, not coaching data. The rows they expand into (nutrition_log)
-- still carry to the coach via the existing relationship policies.

create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists saved_meals_user_idx on public.saved_meals (user_id);

alter table public.saved_meals enable row level security;
drop policy if exists "saved_meals_owner" on public.saved_meals;
create policy "saved_meals_owner" on public.saved_meals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Component foods. user_id is denormalized onto items so the RLS policy is a
-- simple owner check (no join back to the parent).
create table if not exists public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  saved_meal_id uuid not null references public.saved_meals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food text not null,
  calories integer not null,
  protein integer default 0,
  carbs integer default 0,
  fat integer default 0,
  serving_size numeric default 100,
  serving_unit text default 'g'
);
create index if not exists saved_meal_items_meal_idx on public.saved_meal_items (saved_meal_id);

alter table public.saved_meal_items enable row level security;
drop policy if exists "saved_meal_items_owner" on public.saved_meal_items;
create policy "saved_meal_items_owner" on public.saved_meal_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Table privileges (RLS still enforces owner-only). Explicit because the
-- platform default-privilege grants don't always cover tables created outside
-- the dashboard flow — same reason 20260614130000_notifications_grants exists.
grant select, insert, update, delete on public.saved_meals to anon, authenticated;
grant select, insert, update, delete on public.saved_meal_items to anon, authenticated;
