-- Supabase Security Advisor hardening (Jun 24).
--
-- 1) handle_new_user had a role-mutable search_path (lint 0011). A SECURITY
--    DEFINER function with a mutable search_path is a privilege-escalation
--    surface. The body already fully-qualifies public.profiles, so pinning the
--    path is behaviorally a no-op. Matches the convention of the other helpers
--    (is_profile_related, invite_email_status) which already set search_path.
alter function public.handle_new_user() set search_path = public;

-- 2) handle_new_user, guard_checkin_review, and rls_auto_enable are trigger /
--    event-trigger functions (lints 0028/0029: callable by anon/authenticated
--    via /rest/v1/rpc/*). The trigger mechanism does NOT consult EXECUTE grants,
--    so revoking EXECUTE removes them from the public API surface WITHOUT
--    affecting the triggers that fire them (signup → profile insert; check-in
--    review guard; auto-enable-RLS on new tables all keep working).
revoke execute on function public.handle_new_user()      from anon, authenticated, public;
revoke execute on function public.guard_checkin_review() from anon, authenticated, public;
revoke execute on function public.rls_auto_enable()      from anon, authenticated, public;

-- The remaining SECURITY DEFINER functions flagged by the advisor are
-- INTENTIONALLY callable and keep their grants:
--   get_invitation_by_token (anon)  — token IS the credential; Join page reads one invite
--   invite_email_status (authn)     — coach existing-account detection; returns only {id,role}
--   is_profile_related  (authn)     — core RLS helper used inside policies
--   review_checkin      (authn)     — coach check-in review; does its own active-coach authz
-- And rate_limits / trial_ledger run RLS-enabled with NO policies on purpose:
-- that fully locks out anon/authenticated; only service_role / SECURITY DEFINER
-- paths touch them.
