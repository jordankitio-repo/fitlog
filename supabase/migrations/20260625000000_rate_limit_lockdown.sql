-- Belt-and-suspenders: ensure check_rate_limit is service_role-only in every
-- environment. The original migration (20260624140000) revoked EXECUTE from
-- PUBLIC and granted it to service_role; this additionally revokes any EXECUTE
-- that anon/authenticated may hold via platform default privileges, so a
-- signed-in user can't call the limiter directly (e.g. to inflate another
-- user's counter and deny them AI features). Idempotent.
revoke all on function public.check_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(uuid, text, integer, integer) to service_role;
