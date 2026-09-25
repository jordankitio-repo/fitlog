-- A report needs a SUBJECT.
--
-- Rows in the client's report archive led with a date and then the opening of
-- the body, so twenty-five of them read as twenty-five near-identical
-- paragraphs ("Solid week…", "A harder one…", "Good consistency…"). Every
-- archive that works leads with a subject line — mail, newsletters, forums —
-- because a title is what makes a long list scannable and a body preview is not.
--
-- Nullable on purpose: reports written before this exist and are not going to
-- gain a subject retroactively. The UI falls back to the body's lead paragraph,
-- so an old report degrades to exactly what it looked like before.
alter table public.reports add column if not exists subject text;

comment on column public.reports.subject is
  'Short human subject line for the report, shown as the row title in the client''s archive. Null for reports written before subjects existed; the UI falls back to the body lead.';
