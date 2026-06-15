-- "Logged meal" = a meal logged as a container: a group of nutrition_log rows
-- that render in the diary as one collapsible item (the meal) while each row
-- stays an individually-editable food entry. logged_meal_id groups the rows of
-- one logged instance; logged_meal_name labels the container. A meal is just a
-- food item that contains other food items.
--
-- Additive, nullable — loose foods (logged_meal_id null) are unaffected. New
-- columns on an existing table inherit its grants.

alter table public.nutrition_log add column if not exists logged_meal_id uuid;
alter table public.nutrition_log add column if not exists logged_meal_name text;

create index if not exists nutrition_log_logged_meal_idx
  on public.nutrition_log (logged_meal_id) where logged_meal_id is not null;
