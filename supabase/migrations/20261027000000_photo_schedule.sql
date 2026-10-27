-- Progress photos: the client's consent to before/after images.
--
-- (Photos have no schedule of their own: they are an optional step in every
-- check-in, and the coach asks for a set with Request when they want one.
-- A separate photo schedule beside the check-in's was tried and dropped as
-- two rhythms for one routine.)

-- share_progress_photos: the CLIENT's consent to their coach making a
-- before/after image of their photos (for the coach to send, post or keep).
-- Off by default and only the client can change it: it is on the client's
-- own profile row, which the coach can read but not write.
alter table public.profiles
  add column if not exists share_progress_photos boolean not null default false;
