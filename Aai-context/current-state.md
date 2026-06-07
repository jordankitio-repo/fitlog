# FitLog — Current State

> **Purpose:** The live, fast-changing snapshot. Update this at the end of every session. Everything durable lives elsewhere:
> - **How it's built** → `architecture.md`
> - **Why it was built that way** → `decisions.md`
> - **What could be built next** → `features.md`
>
> Keep this file short. If something here stops changing session-to-session, promote it to `architecture.md` or `decisions.md`.

---

## Current Commit
`1692441 Handle coach offboarding subscription pauses`

## Production
- **Live URL:** https://www.tryfitlog.com
- **Build:** Passing (`npm run build`)
- **Lint:** Failing on pre-existing issues only (4 errors / 9 warnings) — no new errors
- **Deploy:** Auto on push to `main` via Vercel
- **Billing:** Live mode active (`BILLING_ENABLED = true`)
- **Supabase:** Upgraded to Pro (no longer free tier — auto-pause risk eliminated)

---

## Recently Shipped (most recent first)

**Part 6 — Checkout ledger gate + trial warning** — `create-checkout-session` now checks `trial_ledger` before attaching a trial period; marks trial used at checkout start. New `check-trial-eligibility` edge function (service-role ledger read, hashed email). `CoachPaywall` calls it on mount: shows "Subscribe to FitLog / will charge $19 immediately" + confirm modal when `coach_trial_used: true`. "Delete account" link added to paywall for users who want a clean exit without subscribing. Coach subscriptions row FK fix: same `subscriptions.coach_id → profiles.id` NO ACTION bug as solo — added explicit DELETE before auth delete. `GRANT SELECT, INSERT, UPDATE ON trial_ledger TO service_role` required (same pattern as subscriptions).

**Part 5 — Solo self-delete with subscription** — Fixed latent FK violation: `subscriptions.solo_id → profiles.id` (NO ACTION) caused Postgres to reject the auth delete cascade. Fix: explicitly cancel Stripe sub + delete subscriptions row (with response checking) before auth delete. Also required `GRANT DELETE ON public.subscriptions TO service_role` — the table had SELECT granted but not DELETE, causing a silent 42501 that only surfaced once response checking was added.

**Coach offboarding overhaul (Parts 1–4)** — Full coach account deletion flow with client protection:
- **Part 1:** Migration — `profiles.offboarded_at`, `profiles.offboard_reason`, `subscriptions.paused_trial_days_remaining`, `trial_ledger` table (pre-built, not yet wired)
- **Part 2:** Trial pause/resume upgrade — trialing solo subs now cancel on Stripe (saving days remaining) and recreate on offboard; write-before-delete ordering so webhook guard is set before Stripe DELETE fires; `stripe-webhook` guards `customer.subscription.deleted` when `paused_for_coaching=true`
- **Part 3:** Offboard marker on `profiles` (survives coach row deletion); Dashboard repointed to read `profiles.offboarded_at + offboard_reason`; dismiss is now server-side null (cross-device); copy differs by reason (`coach_offboarded` vs `coach_deleted`); self-leave no longer triggers banner
- **Part 4:** `delete-account` coach branch — offboards all clients before destructive ops, resumes paused subs, flips roles to solo, writes offboard marker, sends email notification; Stripe sub cancelled after `coach_clients` rows deleted (prevents webhook double-offboard); `resumeSoloSubscription` copied verbatim (deferred: extract to `_shared/`)

**`config.toml` JWT bypass persistence** — `verify_jwt = false` added for `stripe-webhook`, `pause-solo-subscription`, `cancel-subscription`, `milestone-reached`; persists through every future redeploy

**Self-serve cancel + resume** — `cancel-subscription` edge fn, `SubscriptionManager.jsx`, cancel-at-period-end, confirmation email.

**Solo Premium tier** — $7.99/mo, 14-day trial, pause/resume during coaching, `solo_id` on subscriptions, `SoloUpgrade.jsx`, AI nutrition advice gated.

**Tier 1 analytics (all 6)** — compliance heatmap, rolling 7-day weight average, weekday/weekend split, best-week analysis, client ranking dashboard, milestone streak celebrations + coach notification.

**Billing layer complete** — Stripe live mode, coach paywall, webhook (offboard on cancel), legal docs (Terms 21§ / Privacy 14§), feedback button, weekly coach digest (pg_cron Monday 8am UTC).

---

## Verified This Session (June 7, 2026)

**Parts 5 + 6 verified:**
- Solo account with active premium trial → delete account → auth user gone, subscriptions row deleted, Stripe subscription cancelled, redirected to sign-in. ✓
- Coach account with trial → complete checkout → `trial_ledger` row written with `coach_trial_used: true` ✓
- Delete coach account → re-signup with same email → paywall shows billing warning + confirm modal before Stripe ✓
- Coach account with no subscription → paywall shows "Delete account" link → deletes cleanly ✓

**Part 5 issues:**
1. FK violation (`subscriptions_solo_id_fkey`) — subscriptions row not cleared before auth delete → explicit delete with response checking
2. Silent failure in generic deletions loop → moved to explicit block with throw
3. `42501` — `GRANT DELETE ON public.subscriptions TO service_role` missing

**Part 6 issues:**
1. Coach subscriptions row FK (`subscriptions.coach_id → profiles.id` NO ACTION) — same bug as solo, different column → same fix: explicit DELETE before auth delete
2. `trial_ledger` INSERT/SELECT silently failing — `GRANT SELECT, INSERT, UPDATE ON trial_ledger TO service_role` missing
3. `check-trial-eligibility` request never appeared in Network — old frontend (no useEffect) still live on production; push + Vercel build required
4. `price_1TechtAWijxnniIjAWpCOW1X` (founding price) deleted from Stripe in clean-slate reset — updated `.env` with active price ID

**Lesson:** Always check responses on destructive DB ops in a deletion sequence. Silent failures produce confusing downstream FK errors.

Parts 2–4 coach offboarding — tested end-to-end after full function redeploy:
- Coach account created + trial started → Stripe checkout completed → `status: trialing` written correctly
- Solo account created + premium trial started → paused when joined coach (`paused_for_coaching=true`, Stripe trial cancelled, days remaining stored)
- Coach deleted account → client processed: role flipped to solo, offboard marker written to profiles, paused trial resumed (new Stripe sub recreated with remaining days), email sent, coach's Stripe sub cancelled
- Client Dashboard → "account was closed" banner shown on next load, dismiss clears server-side
- `stripe-webhook` correctly skips `customer.subscription.deleted` when `paused_for_coaching=true`

**Production issues encountered and resolved this session:**
1. Supabase free tier auto-paused → browser stuck on "Loading..." (JWT refresh can't reach server) → fixed: resumed project, cleared localStorage; **permanent fix: upgraded to Pro**
2. Edge Functions not redeployed after git push → old code running in production → fixed: `supabase functions deploy` for all 5 changed functions; **lesson: git push ≠ function deploy**
3. `stripe-webhook` JWT bypass reset on redeploy → Stripe events rejected with `UNAUTHORIZED_NO_AUTH_HEADER` → fixed: `supabase functions deploy stripe-webhook --no-verify-jwt`; **permanent fix: `verify_jwt = false` in `config.toml`**
4. Missing `profiles.offboarded_at` + `offboard_reason` migration → columns written by edge functions but didn't exist in DB → fixed: `20260606130000_add_profiles_offboard_fields.sql` + `supabase db push`

**Prior verified (June 6, 2026):**
- `on_auth_user_created` trigger confirmed present in live DB
- Coach signup → role picker → billing card → Stripe checkout → dashboard
- Subscription row writes `status: trialing` correctly
- Coach invite → client accept → connection
- Coach offboard → client → solo + in-app notification
- Solo Premium trial checkout
- Re-invite existing (now Solo Premium) user → correct messaging → accept → client
- Client leave coaching → back to solo trialing
- Coach cancel subscription → confirm → cancel → resume

**Conclusion:** App is functionally solid for first real users.

---

## Open Bugs

| Issue | Status |
|---|---|
| Chart.js Filler plugin warning | Cosmetic, deferred (Filler now registered — verify gone) |
| `npm run lint` 4 errors / 9 warnings | Pre-existing, deferred |
| Large Vite JS chunk warning | Deferred |

**Resolved:** ~~`subscriptions.status` writes `active` instead of `trialing`~~ — fixed (webhook fetches real Stripe sub object); verified `trialing` live June 6.
**Resolved:** ~~Offboard in-app notice shows twice~~ — fixed (Part 3: reads from `profiles.offboard_reason`, only coach-initiated paths write it, self-leave writes no marker).

---

## Current Priorities (in order)

1. **Buy `gardnr.fit` domain** — $2.98/yr, 2 min, unblocks rebrand. (See rebrand plan below.)
2. **Apply Phase 1 rebrand to `main`** — text-only FitLog → Gardnr (file-by-file changes documented in rebrand plan).
3. **Swap landing page** — replace `Landing.jsx` with the Gardnr version from the June 6 session.
4. **Phase 2 domain migration** — connect gardnr.fit to Vercel + verify in Resend + swap `tryfitlog.com` → `gardnr.fit`.
5. **Beta coach outreach** — 3–5 founding coaches at $19/mo locked.
6. **Google OAuth production verification** — currently testing mode only.

---

## Next Planned Features (Tier 2)

Source of truth is `features.md`. Top of the Tier 2 queue:
1. Structured client onboarding assessment (form → pre-populated targets)
2. Body measurements tracking (new table: waist/hips/arms)
3. Rate-of-weight-change alerts (weekly pace, safe-range edge fn)
4. Auto-generated shareable PDF report card

Strong candidate package (from metrics roadmap): **Client Readiness + Risk Score** — logging consistency, target deviation, weight-trend reliability, check-in status → Ready / Needs review / At risk.

---

## Pending Verifications / Reminders

- Legal doc updates owed (see Legal Doc Tracker in `features.md`): self-serve cancellation now exists, Solo Premium $7.99 terms, pause/resume behavior, trial-aging disclosure, client-reconnection clause, coach-cancel-timing clause.
- Google OAuth still in testing mode — only manually added test users can sign in via Google.

---

## Rebrand Plan: FitLog → Gardnr (ready, not applied to main)

**New name:** Gardnr — **Tagline:** "Coaches don't build physiques. They create conditions for growth."
**Domain:** `gardnr.fit` ($2.98/yr first year, ~$33.98 renew) — recommended, not yet purchased.

**Phase 1 (text-only, safe to apply now):**
- All UI text in `src/` and `supabase/`: FitLog → Gardnr
- Email display names: `'FitLog <noreply@tryfitlog.com>'` → `'Gardnr <noreply@tryfitlog.com>'`
- Email body brand text, legal docs (Terms/Privacy), `index.html` title, export filename (`fitlog-export-*` → `gardnr-export-*`)
- **Do NOT change in Phase 1:** `noreply@tryfitlog.com` sender, `tryfitlog.com` URLs, `.supabase.co` refs, `Digigarden LLC`, `digigardenllc@gmail.com`, `package.json` name (`fitlog` internal id)

**Phase 2 (after gardnr.fit purchased + DNS):**
1. Connect gardnr.fit to Vercel (A + CNAME)
2. Verify gardnr.fit in Resend (DKIM + SPF + DMARC)
3. Switch sender to `noreply@gardnr.fit`
4. One pass: swap all `tryfitlog.com` → `gardnr.fit`

*Note: Phase 1 work was previously stashed/dropped from a deleted branch — must be re-applied cleanly.*

---

## Session Log (brief — newest first)

- **Jun 7** — Parts 1–6 complete: coach offboarding overhaul, trial pause/resume, offboard marker on profiles, delete-account coach + solo branches, checkout ledger gate, trial warning on CoachPaywall, delete-account link on paywall. Coach + solo FK bugs fixed. GRANT issues resolved. Supabase upgraded to Pro. `config.toml` JWT bypass permanent.
- **Jun 6** — Live workflow verification (all flows passing). Trigger confirmed. AI-context refactor: split into `architecture.md` + `decisions.md` + slim `current-state.md`.
- **Jun 5/6 (prior session)** — Rebrand decision (Gardnr), new landing page built (not merged), DB + Stripe cleared for clean slate.
- **Jun 5** — Tier 1 feature sweep (6 features), 6 bug fixes, steps unique-constraint fix.
- **Jun 4** — Solo Premium + self-serve cancel/resume; legal docs; Stripe live mode; weekly digest.
- **Jun 3–4** — Stripe billing full implementation; design sprint (Inter, color system, surfaces); nudge mechanic; hide-calories; domain + Resend verified.
