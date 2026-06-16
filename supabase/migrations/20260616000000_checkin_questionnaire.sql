-- Coach-defined check-in questionnaire. A coach builds a set of questions and
-- their clients' check-in form renders them instead of the fixed adherence /
-- energy fields. Per-coach (applies to all the coach's clients).
--
-- Backward compatible: a coach with no questions → clients see the legacy
-- 4-field form, stored in the existing check_ins columns. Answers to a custom
-- questionnaire are snapshotted into check_ins.answers (prompt + type + config
-- captured at submit time) so history survives later edits/archival.

create table if not exists public.checkin_questions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null,
  prompt text not null,
  type text not null check (type in ('rating', 'text', 'number', 'boolean', 'select')),
  config jsonb not null default '{}',
  required boolean not null default false,
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists checkin_questions_coach_idx
  on public.checkin_questions (coach_id, position) where not archived;

alter table public.checkin_questions enable row level security;

-- Coach owns their questions (full CRUD on their own rows only).
drop policy if exists "coach manages own checkin questions" on public.checkin_questions;
create policy "coach manages own checkin questions" on public.checkin_questions
  for all
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- A client may read ONLY their active coach's questions, to render the form.
drop policy if exists "client reads active coach questions" on public.checkin_questions;
create policy "client reads active coach questions" on public.checkin_questions
  for select
  using (
    exists (
      select 1 from public.coach_clients cc
      where cc.coach_id = checkin_questions.coach_id
        and cc.client_id = auth.uid()
        and cc.status = 'active'
    )
  );

-- Pooler-created tables don't inherit role grants — set them explicitly.
grant select, insert, update, delete on public.checkin_questions to authenticated;

-- Snapshotted answers to a custom questionnaire; null for legacy/default
-- check-ins. Inherits check_ins' RLS (client writes own, coach reads active).
alter table public.check_ins add column if not exists answers jsonb;
