-- Check-in review queue. Coaches mark a submitted check-in reviewed (with an
-- optional comment the client sees). reviewed_at drives the coach's "to review"
-- count — the coverage half of "run 100 clients with the attention of 20".

alter table public.check_ins add column if not exists reviewed_at timestamptz;
alter table public.check_ins add column if not exists coach_comment text;

-- Only the ACTIVE coach may set the review fields, via this SECURITY DEFINER
-- RPC — keeps coaches out of the client's answers and centralizes the action.
create or replace function public.review_checkin(p_id uuid, p_comment text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.check_ins ci
     set reviewed_at = now(), coach_comment = p_comment
   where ci.id = p_id
     and exists (
       select 1 from public.coach_clients cc
       where cc.client_id = ci.client_id and cc.coach_id = auth.uid() and cc.status = 'active');
$$;
revoke all on function public.review_checkin(uuid, text) from public;
grant execute on function public.review_checkin(uuid, text) to authenticated;

-- Guard: block anyone who isn't the active coach from changing the review
-- fields directly (e.g. a client PATCHing their own check_ins row). The RPC
-- above runs with auth.uid() = the coach, so it passes; clients editing their
-- own non-review fields are unaffected.
create or replace function public.guard_checkin_review() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role (edge functions / admin) bypasses; the RPC runs as the coach
  -- (auth.uid() = coach) so it passes the active-coach check below.
  if (new.reviewed_at is distinct from old.reviewed_at
      or new.coach_comment is distinct from old.coach_comment)
     and coalesce(auth.role(), '') <> 'service_role'
     and not exists (
       select 1 from public.coach_clients cc
       where cc.client_id = new.client_id and cc.coach_id = auth.uid() and cc.status = 'active')
  then
    raise exception 'Only the active coach can set check-in review fields';
  end if;
  return new;
end $$;

drop trigger if exists guard_checkin_review on public.check_ins;
create trigger guard_checkin_review
  before update on public.check_ins
  for each row execute function public.guard_checkin_review();
