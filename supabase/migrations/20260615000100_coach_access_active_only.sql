-- Coach read access to client data only checked that a coach_clients row
-- EXISTS (any status), whereas profiles already required status = 'active'.
-- Result: after a client is offboarded the coach lost their name but could
-- still read their nutrition/weight/cardio/steps/targets/check-ins. Align the
-- data tables with profiles by adding the active filter.

drop policy if exists "Coaches can read clients nutrition logs" on public.nutrition_log;
create policy "Coaches can read clients nutrition logs" on public.nutrition_log
  for select using (auth.uid() in (
    select coach_id from public.coach_clients
    where client_id = nutrition_log.user_id and status = 'active'));

drop policy if exists "Coaches can read clients weight logs" on public.weight_log;
create policy "Coaches can read clients weight logs" on public.weight_log
  for select using (auth.uid() in (
    select coach_id from public.coach_clients
    where client_id = weight_log.user_id and status = 'active'));

drop policy if exists "Coaches can read client cardio" on public.cardio_log;
create policy "Coaches can read client cardio" on public.cardio_log
  for select using (auth.uid() in (
    select coach_id from public.coach_clients
    where client_id = cardio_log.user_id and status = 'active'));

drop policy if exists "Coaches can read client steps" on public.steps_log;
create policy "Coaches can read client steps" on public.steps_log
  for select using (auth.uid() in (
    select coach_id from public.coach_clients
    where client_id = steps_log.user_id and status = 'active'));

drop policy if exists "Coaches can read client check-ins" on public.check_ins;
create policy "Coaches can read client check-ins" on public.check_ins
  for select using (auth.uid() in (
    select coach_id from public.coach_clients
    where client_id = check_ins.client_id and status = 'active'));

-- targets is a FOR ALL policy (coaches set + read). Keep USING-only (which also
-- governs inserts) and add the active filter.
drop policy if exists "Coaches can set targets for their clients" on public.targets;
create policy "Coaches can set targets for their clients" on public.targets
  using (auth.uid() in (
    select coach_id from public.coach_clients
    where client_id = targets.user_id and status = 'active'));
