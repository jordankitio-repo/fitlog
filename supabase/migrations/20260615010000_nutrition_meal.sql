-- Meal grouping for the nutrition diary (Breakfast/Lunch/Dinner/Snack). Nullable
-- so every existing row stays valid (renders under "Other"); constrained to the
-- known set. Additive and safe to run on a populated table.

alter table public.nutrition_log
  add column if not exists meal text;

alter table public.nutrition_log
  drop constraint if exists nutrition_log_meal_check;
alter table public.nutrition_log
  add constraint nutrition_log_meal_check
  check (meal is null or meal in ('breakfast', 'lunch', 'dinner', 'snack'));
