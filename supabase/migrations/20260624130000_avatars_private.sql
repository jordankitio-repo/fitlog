-- Lock down profile photos. The original avatars bucket was PUBLIC with a
-- blanket read policy ("avatars aren't sensitive"), so any avatar object was
-- world-readable by URL and survived as an orphan after account deletion.
--
-- Profile photos ARE sensitive: they're faces tied to a health/coaching profile,
-- and treating face images of named people on a health app as public is exactly
-- the kind of thing US state consumer-health-data laws and a security review flag.
-- This migration makes the bucket private and restricts reads to viewers the app
-- already trusts with that person's data: the owner, or an ACTIVE coach/client
-- counterpart (same rule as profiles, via is_profile_related). The frontend now
-- mints short-lived SIGNED URLs for display instead of storing a permanent public
-- URL — so access revokes when a coaching relationship ends, and a leaked URL
-- expires.
--
-- DEPLOY COUPLING: ship this together with the frontend change that signs avatar
-- paths. Applying it under the old (getPublicUrl) frontend breaks avatar rendering.

update storage.buckets set public = false where id = 'avatars';

-- Existing avatar_url values are full PUBLIC URLs. Rewrite them to the storage
-- path the new frontend signs on demand. The path is deterministic:
-- <uid>/avatar.jpg (the fixed upsert path uploadAvatar has always used).
update public.profiles
  set avatar_url = id || '/avatar.jpg'
  where avatar_url is not null;

-- Replace the blanket public read with relationship-scoped read. Owner-only
-- insert/update/delete policies from 20260622000000_avatars.sql are unchanged.
drop policy if exists "avatars public read" on storage.objects;
drop policy if exists "avatars related read" on storage.objects;
create policy "avatars related read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_profile_related( ((storage.foldername(name))[1])::uuid )
  );
