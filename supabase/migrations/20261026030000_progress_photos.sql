-- Progress photos: front / side / back, a set per date, compared side by side.
-- Every coaching app a coach would leave us for has them (Trainerize, TrueCoach,
-- Everfit, Kahunas's Progress Overlay); we had none.
--
-- These are photos of a person's body on a health app, the most sensitive
-- thing we store. So, from the first line:
--   * a PRIVATE bucket, read only through short-lived signed URLs;
--   * readable by the owner and their ACTIVE coach, nobody else: not the
--     client of a coach (is_profile_related would allow that direction, so it
--     is not used here), and not a former coach once the relationship ends;
--   * written only by the owner (a coach cannot add, swap or delete them);
--   * re-encoded in the browser before upload, which drops EXIF (GPS);
--   * purged on account deletion (delete-account).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];

create table if not exists public.progress_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  taken_on    date not null,
  pose        text not null check (pose in ('front', 'side', 'back')),
  -- <user_id>/<random>.jpg. Random, not <date>-<pose>, so a replaced photo is
  -- a new object and no cached signed URL can show the old one.
  path        text not null unique,
  created_at  timestamptz not null default now(),
  unique (user_id, taken_on, pose)
);
create index if not exists progress_photos_user_date on public.progress_photos (user_id, taken_on desc);

alter table public.progress_photos enable row level security;

drop policy if exists progress_photos_owner on public.progress_photos;
create policy progress_photos_owner on public.progress_photos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (storage.foldername(path))[1] = auth.uid()::text);

drop policy if exists progress_photos_coach_read on public.progress_photos;
create policy progress_photos_coach_read on public.progress_photos
  for select to authenticated
  using (exists (
    select 1 from public.coach_clients cc
    where cc.coach_id = auth.uid() and cc.client_id = progress_photos.user_id and cc.status = 'active'));

grant select, insert, update, delete on public.progress_photos to authenticated;
-- delete-account clears it explicitly, as it does every personal-data table.
grant select, insert, update, delete on public.progress_photos to service_role;

-- Storage: the first path segment is the owner's id.
drop policy if exists "progress photos owner write" on storage.objects;
create policy "progress photos owner write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "progress photos owner delete" on storage.objects;
create policy "progress photos owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "progress photos read" on storage.objects;
create policy "progress photos read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.coach_clients cc
        where cc.coach_id = auth.uid()
          and cc.client_id::text = (storage.foldername(name))[1]
          and cc.status = 'active')
    )
  );
