-- The exact sentence a client agreed to, on each consent row.
--
-- policy_version says which Consumer Health Data Policy was in force. It does
-- not say what the checkbox SAID, and that wording is the consent itself: it
-- changed on 2026-10-26 ("I agree to Gardnr collecting..." became "Allow
-- Gardnr to read..."), and without this column a row could not say which
-- of the two a client ticked. Storing the text, not a version number, means
-- the record is readable on its own, years later, by someone who has never
-- seen the code.
--
-- Nullable: rows granted before this column existed have no stored text, and
-- inventing one for them would be the misrepresentation this column prevents.
alter table public.health_data_consents add column if not exists consent_text text;

notify pgrst, 'reload schema';
