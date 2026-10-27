-- Private notes, one row per note.
--
-- coach_notes held every note a coach wrote about a client in ONE text field,
-- each new note prepended to the whole and the whole row rewritten. So:
--   * two open copies of the record (laptop and phone) each adding a note:
--     the second save wrote back a text that did not contain the first note;
--   * "Edit history" edited every note at once, and select-all-delete wiped
--     years of them with no undo;
--   * every note downloaded and rendered on every open, however many.
-- A row per note makes adding an INSERT (nothing to overwrite), editing and
-- deleting one note at a time, and the list pageable.
--
-- coach_notes is left in place, unread, as the backup of what was migrated.

create table if not exists public.coach_note_entries (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  client_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  -- Carried over from the old text, whose stamps were the coach's LOCAL time
  -- with no zone. The day is kept (at midday UTC, so it reads as the same day
  -- in any US or European zone) and the time is not shown.
  date_only   boolean not null default false,
  -- A standing fact (an injury, an allergy, a medication) the coach wants in
  -- front of them every time: pinned above the list and named in the
  -- client's header. Trainerize's injury flag.
  flagged     boolean not null default false
);
create index if not exists coach_note_entries_thread
  on public.coach_note_entries (coach_id, client_id, created_at desc);
-- Search runs over one coach's notes on one client (a few hundred rows at
-- most), so the thread index above narrows it; no text index needed.

-- ── Backfill ───────────────────────────────────────────────────────────────
-- The old text is "── <Mon D, YYYY, HH:MI AM> ──\n<note>" blocks separated by
-- blank lines, newest first; anything outside a marker (written before the
-- dated format, or typed in by "Edit history") becomes an undated note dated
-- by the row's updated_at. Runs once: skipped for any pair that already has
-- entries.
do $$
declare
  r record;
  line text;
  cur_date timestamptz;
  cur_body text;
  has_cur boolean;
  m text[];
  n int; -- position in the old text, newest first: keeps same-day notes in order
begin
  for r in
    select n.* from public.coach_notes n
    where coalesce(btrim(n.content), '') <> ''
      and n.coach_id is not null and n.client_id is not null
      and not exists (select 1 from public.coach_note_entries e where e.coach_id = n.coach_id and e.client_id = n.client_id)
  loop
    has_cur := false; cur_body := ''; cur_date := null; n := 0;
    foreach line in array string_to_array(r.content, E'\n') loop
      m := regexp_match(line, '^── (.+) ──$');
      if m is not null then
        if has_cur and btrim(cur_body) <> '' then
          insert into public.coach_note_entries (coach_id, client_id, body, created_at, date_only)
          values (r.coach_id, r.client_id, btrim(cur_body, E' \n'), coalesce(cur_date, r.updated_at, now()) - n * interval '1 second', cur_date is not null);
          n := n + 1;
        end if;
        has_cur := true; cur_body := '';
        begin
          cur_date := date_trunc('day', to_timestamp(m[1], 'Mon DD, YYYY, HH12:MI AM')) + interval '12 hours';
        exception when others then
          cur_date := null;
        end;
      else
        if not has_cur then has_cur := true; cur_date := null; end if;
        cur_body := cur_body || line || E'\n';
      end if;
    end loop;
    if has_cur and btrim(cur_body) <> '' then
      insert into public.coach_note_entries (coach_id, client_id, body, created_at, date_only)
      values (r.coach_id, r.client_id, btrim(cur_body, E' \n'), coalesce(cur_date, r.updated_at, now()) - n * interval '1 second', cur_date is not null);
          n := n + 1;
    end if;
  end loop;
end $$;

-- 5,000 characters a note from here on. NOT VALID, so a long note carried
-- over from the old text is kept whole rather than failing the migration.
alter table public.coach_note_entries drop constraint if exists coach_note_entries_body_len;
alter table public.coach_note_entries add constraint coach_note_entries_body_len
  check (char_length(btrim(body)) between 1 and 5000) not valid;

-- ── Access ─────────────────────────────────────────────────────────────────
-- The coach's own notes: read always (a former client's notes stay readable
-- to the coach who wrote them), written only about a client they coach now.
-- The client never sees them.
alter table public.coach_note_entries enable row level security;

drop policy if exists coach_note_entries_read on public.coach_note_entries;
create policy coach_note_entries_read on public.coach_note_entries
  for select to authenticated
  using (coach_id = auth.uid());

drop policy if exists coach_note_entries_write on public.coach_note_entries;
create policy coach_note_entries_write on public.coach_note_entries
  for insert to authenticated
  with check (
    coach_id = auth.uid()
    and exists (select 1 from public.coach_clients cc
                where cc.coach_id = auth.uid() and cc.client_id = coach_note_entries.client_id and cc.status = 'active')
  );

drop policy if exists coach_note_entries_update on public.coach_note_entries;
create policy coach_note_entries_update on public.coach_note_entries
  for update to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

drop policy if exists coach_note_entries_delete on public.coach_note_entries;
create policy coach_note_entries_delete on public.coach_note_entries
  for delete to authenticated
  using (coach_id = auth.uid());

grant select, insert, update, delete on public.coach_note_entries to authenticated;
grant select, insert, update, delete on public.coach_note_entries to service_role;
