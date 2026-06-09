# Gardnr — Current State

> **Purpose:** The live, fast-changing snapshot. Update this at the end of every session. Everything durable lives elsewhere:
> - **How it's built** → `architecture.md`
> - **Why it was built that way** → `decisions.md`
> - **What could be built next** → `features.md`
>
> Keep this file short. If something here stops changing session-to-session, promote it to `architecture.md` or `decisions.md`.

---

## Current Commit
`0926a0f fix(profile): drop redundant coach "active clients" count`

## Production
- **Live URL:** https://www.gardnr.fit (primary) — tryfitlog.com 308-redirects here until expiry
- **Build:** Passing (`npm run build`), 48/48 tests passing
- **Lint:** 6 errors / 8 warnings — all 6 errors are the `react-hooks/set-state-in-effect` rule in load-bearing billing/log effects (App.jsx, Log.jsx); deferred as a manually-tested refactor. All genuinely-safe errors fixed Jun 8.
- **Deploy:** Auto on push to `main` via Vercel
- **Billing:** Live mode active (`BILLING_ENABLED = true`)
- **Supabase:** Upgraded to Pro (no longer free tier — auto-pause risk eliminated)

---

## Recently Shipped (most recent first)

**Editable display name + coach client count on Profile (Jun 9, session 3)** — Closed the most basic Profile gap: users couldn't edit their own `full_name` even though it's collected at signup and shown to coaches/clients. Added an editable Name field (account card, all roles) saved to `profiles` — the `profiles_update_self` RLS policy already permits own-row update, so no schema/policy/edge-fn change. Threaded `onProfileUpdate` (App → AppRoutes → Profile) so a save refreshes the global profile immediately. Clients see a "name your coach sees" hint. (A coach "Active clients" count was added then **removed** in `0926a0f` — redundant with the prominent 2rem count already on CoachDashboard; the account card stays identity-only.) Save button is muted/disabled until the name is edited, then solid green. Name sync uses the adjust-state-during-render pattern to avoid adding `set-state-in-effect` lint debt. **Decision:** deferred body stats (height/sex/DOB/activity — needs schema, belongs with the roadmapped onboarding-assessment so it pre-populates targets) and notification prefs (touches mail edge fns). Verified all 3 roles via throwaway-account screenshots. Shipped to `main` (`5fa44e6`).

**90-day compliance summary beside the heatmap (Jun 9, session 3)** — Filled the empty space next to the 90-day `ComplianceHeatmap` with a new `ComplianceSummary` (quantified totals), present in both the solo Dashboard "Logging consistency" card and the coach `ClientView` "Calorie Compliance" section. Reflowed each so the heatmap sits left and the stat tiles fill the right on desktop (stacks on mobile).
- **Two differentiated lenses** (keeps the coach/solo wall): coach gets the *assessment* breakdown — days logged + on-target / partial / under buckets + avg of target; solo gets the *mirror* — days logged + on-track days, no prescriptive copy (passes the descriptive-only test in `decisions.md`).
- **All from in-scope `heatmapData`** — no new queries/schema. `summarizeCompliance()` (new util) reuses the heatmap's exact ≥90/60-89/<60 thresholds. **Denominator ramps from first log, caps at 90**, so a new account reads e.g. 12/12 not 12/90, then rolls once history > window. Covered by 5 new unit tests (53 total passing).
- **Verified** with a new seeded harness `scripts/shoot-consistency.mjs` (the existing harnesses don't seed nutrition data) — Premium solo + coach-viewing-client, both widths, screenshots reviewed. Throwaway accounts deleted. Shipped straight to `main` (`f5c1900`).

**Solo self-analytics on the Dashboard + solo milestones (Jun 9, session 2)** — Closed the gap where the Tier-1 self-analytics existed only coach-side (in `ClientView`) and never on the solo's own Dashboard.
- **"Logging consistency" card** (`Dashboard.jsx`, Premium-gated): one card consolidating weekday/weekend split (last 30d), best week (last 90d), and the 90-day `ComplianceHeatmap` — behind a single `SoloUpgrade` CTA (free users see one upgrade prompt, not three). Folded three would-be queries into one 90-day `nutrition_log` pull (`fetchNutritionAnalytics`). Scoped to `role !== 'client'`, mirroring the rolling-weight-average gate.
- **Milestone celebrations extended to solo:** relaxed the `role === 'client'` guard in `fireMilestone`. Safe because `milestone-reached` already records the streak and only emails a coach when an active relationship exists — coachless solo users get the in-app banner with no email.
- **Product guardrail:** all additions are descriptive-only (they report the user's own past consistency, never prescribe or adjust a plan) so they don't cannibalize the coaching layer — see `decisions.md`.
- **Verified with the harness:** free-tier gate (single CTA) screenshotted; Premium path seeded with 90 days of data (temporarily flipping `SOLO_BILLING_ENABLED` locally, reverted) → weekday/weekend 86% vs 50%, best week 6/7, full heatmap; solo 7-day milestone banner confirmed firing. Throwaway accounts deleted.
- Shipped straight to `main` (`3e418ff`, preceded by `ce03afa` Best week). Also reconciled `features.md` — most of Tier 1 was already shipped and the board still listed it as roadmap.

**Nav redesign + UI polish + visual-QA harness (Jun 9)** — A round of UX fixes, all verified with real screenshots (see harness below).
- **Responsive NavBar rewrite** (`NavBar.jsx`): desktop = solid bar with the logo-icon mark + green-dim "pill" active tabs; mobile (≤600px via a `useMediaQuery` hook) = brand + hamburger that opens an animated dropdown (per-item icons, active item uses the green left-accent motif, dimmed/blurred tap-away backdrop). Replaced an earlier wrapping bar that looked unintentional.
- **Sticky-nav bug fix (root cause):** `overflow-x: hidden` on `html, body, #root` made them scroll containers, which **broke `position: sticky`** — the nav scrolled away on mobile (this was the real cause of the "header overlaps the status bar" report, not the translucency). Switched to `overflow-x: clip`.
- **Nav is solid, not frosted:** a `backdrop-filter` bar bled scrolled content through and trapped the mobile menu's `position: fixed` backdrop against the 56px nav (menu never dimmed). Solid bar + soft shadow fixed both.
- **Password show/hide** (`PasswordInput.jsx`): eye-toggle on all 8 password fields (Login, Join ×2, ResetPassword ×2, Profile ×3).
- **Restored manual barcode entry:** the Log redesign had orphaned it (no control set `showBarcodeInput`); added Scan + "Enter barcode #" inside the Add Food form (numeric keypad, Enter-to-lookup).
- **ClientView header cleanup:** Back/name/Nudge were floating awkwardly; restructured to a top-aligned row (Back left · name/email · Nudge right).
- **Other polish (Jun 8):** `*` 404 route, ResetPassword uses the shared password validator, stripe-webhook 300s replay window + constant-time HMAC, lint 13→6 errors.

**Visual-QA harness (Jun 9)** — `scripts/shoot.mjs` + `scripts/shoot-all.mjs` (Playwright, installed as devDeps). Sign up throwaway accounts, screenshot real pages at phone + desktop widths (scrolled, menu open; coach/client screens via an injected trialing `subscriptions` row + client-token `coach_clients` link), then delete the accounts. Output `/tmp/shots`. **Run after any UI change** instead of shipping blind: `node scripts/shoot.mjs [baseUrl]`. Reviewed all key screens Jun 9 — auth, solo profile, coach paywall/dashboard, client view — all clean.

**Pre-launch security hardening (Jun 8, session 3)** — Full feature/security pass before public launch, verified against the live DB with throwaway-account probes.
- **`profiles` RLS was DISABLED** (root cause): policies existed but `relrowsecurity=false`, so any authenticated user could read/enumerate all profiles (email, name, role). Enabled RLS + single scoped SELECT policy (`is_profile_related`: own row or active coach↔client) + own-row INSERT/UPDATE. Migrations `20260608130000`–`134000`. Verified: cross-account read now blocked; self / coach→client / client→coach reads + own-writes intact.
- **4 open edge functions secured:** `call-prep`, `weekly-report`, `notify-report`, `notify-checkin` had `verify_jwt=false` and no caller check (open Anthropic proxies / email relays). Now verify the caller + active coach↔client relationship; recipients derived server-side. Client call sites pass `clientId` (ClientView.jsx, Dashboard.jsx).
- **`weekly-digest` cron secured:** was triggered by pg_cron with the public anon key. Now `verify_jwt=true` + requires `role=service_role`; cron rewritten to send the service role key.
- **`trial_ledger` email_hash unique index** (`20260608120000`) finally applied to prod — it had never been pushed; the webhook trial-dedup upsert depends on it.
- **stripe-webhook** signature: 300s replay window + constant-time HMAC compare.
- **Polish:** `*` 404 route (App.jsx), ResetPassword uses the shared password validator (was weaker 6-char), lint 13→6 errors.
- Confirmed: email-confirmation is OFF (signup flow assumption holds); all non-`profiles` tables already had RLS enabled.

**Log screen redesign (Jun 8, session 2)** — `Log.jsx` rebuilt to match the mockup: "Daily Log" header with pill date-nav (tap date to open picker), per-section colored left-border accents (weight/nutrition/cardio/steps metric tokens), nutrition macro-totals row, inline food entries, prominent saved-value displays for weight/steps. All prior functionality preserved (barcode, copy-from-day, edit/delete/re-log, AI feedback, hide-calories).

**Login error UX (Jun 8, session 2)** — `Login.jsx` auth calls wrapped in try/catch with a `friendlyError()` mapper; users see "Unable to connect to our servers…" instead of raw `Failed to fetch` (surfaced during a regional Supabase outage).

**Progress charts 14 → 30 days (Jun 8, session 2)** — calorie/cardio/steps history windows extended from 13 to 29 days back (+ labels) in both `Dashboard.jsx` and `ClientView.jsx`. Applies to coach, solo, and client views.

**Trial-marking moved to webhook (Jun 8, session 2)** — `create-checkout-session` no longer marks the trial used at session creation (that burned the trial when a user opened then abandoned the Stripe page). `stripe-webhook` now records trial usage on `checkout.session.completed` **only when the subscription actually enters `trialing`**, keyed by email hash via `on_conflict=email_hash`. Required a unique index on `trial_ledger.email_hash` (migration `20260608120000`, dedupe-safe) — without it the merge-duplicates upsert inserted duplicate rows and the `limit=1` eligibility read was nondeterministic (root cause of both early-burned and repeat trials).

**Orphaned Stripe customer recovery (Jun 8, session 2)** — `create-checkout-session` now verifies a stored `stripe_customer_id` via `customerIsUsable()` and recreates the customer if it was deleted in Stripe, instead of failing checkout with "No such customer".

**Coach-leave + deletion email completeness (Jun 8, session 2)** — `offboard-self` now emails the coach when a client voluntarily leaves. `delete-account` confirmation email now fires for **all roles incl. coach** (was solo/client only) and the coach-deletion client email gained a "Log in" button. All sends switched from fire-and-forget to `await` + a `sendEmail()` helper that checks the Resend response and logs failures (fire-and-forget was dropping sends as the Edge isolate tore down).

**SoloUpgrade eligibility-aware label + in-app delete modal (Jun 8, session 2)** — `SoloUpgrade.jsx` calls `check-trial-eligibility` on mount; ineligible users see "Subscribe to Solo Premium" + immediate-charge warning instead of a misleading "free trial" label. `CoachPaywall.jsx` delete-account confirm replaced the native `window.confirm()` with an in-app modal matching the existing pattern.

**Account deletion email notifications (Jun 8)** — `delete-account` now sends two new emails (best-effort, non-blocking): (1) client confirmation — fires for `solo` and `client` roles on successful deletion; (2) coach notification — fires only for `client` role when an active coach is found. Coach info (`email`, `full_name`) fetched from `coach_clients` + `profiles` before the bulk deletion loop, since those rows are destroyed mid-flow. Profile `email` and `full_name` fetched at function entry before auth delete. `escapeHtml` helper added.

**Auth error handling** — `App.jsx` now calls `supabase.auth.signOut()` automatically when an auth error is detected, recovering users from broken session states instead of leaving them stuck.

**Metric color scheme fix** — Protein token corrected to amber `#f59e0b`, carbs to blue `#60a5fa` in both `index.css` and `CoachDashboard`. Prior values were swapped.

**Date navigation fix** — Dashboard and Log date navigation refactored to use `parseLocalDateString` utility. `new Date('YYYY-MM-DD')` parses as UTC midnight, shifting dates one day back in negative-offset timezones (all US timezones). Fix constructs dates from year/month/day components directly.

**UI polish** — NavBar legal link styles removed, layout adjusted for feedback button. Footer links added (Terms, Privacy, Feedback). Privacy and Terms pages updated with new URLs. Solo training signup link added to landing footer. Favicon updated to Gardnr design. Document title updated to "Gardnr".

**Solo entry point on landing page (Jun 7)** — "Training solo? Start free →" link added to footer in green (`#34d399`, weight 600) routing to `/login?mode=signup&role=solo`. Quiet enough not to dilute the coach pitch, visible enough to capture solo interest.

**Gardnr rebrand + domain migration (Jun 7)** — Full FitLog → Gardnr rebrand across all source files, Supabase edge functions, and email copy. New responsive landing page (`Landing.jsx` rewritten with `lp-` namespace CSS, DM Sans font, three breakpoints). Orphaned `.landing-*` CSS removed from `index.css`. Domain: `gardnr.fit` purchased, connected to Vercel (Namecheap A + CNAME), verified in Resend (DKIM + SPF). Sender switched to `noreply@gardnr.fit`. All 10 edge functions redeployed. Supabase Auth Site URL updated to `www.gardnr.fit`, redirect allowlist extended. Stripe product renamed to "Gardnr Coach". `tryfitlog.com` 308-redirects to `www.gardnr.fit`.

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

## Verified This Session (June 8, 2026)

**Resend DNS confirmed via dig + dashboard:**
- DKIM `resend._domainkey.gardnr.fit` — Verified ✓
- SPF MX + TXT on `send.gardnr.fit` — Verified ✓
- Root domain has no SPF record by design (Resend's standard subdomain layout)

---

## Verified (June 7, 2026)

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
| `npm run lint` 6 errors / 8 warnings | All 6 are `react-hooks/set-state-in-effect` in App.jsx + Log.jsx billing/log effects; deferred as a manually-tested refactor (functional, not a bug) |
| Large Vite JS chunk warning | Deferred |

**Resolved:** ~~`subscriptions.status` writes `active` instead of `trialing`~~ — fixed (webhook fetches real Stripe sub object); verified `trialing` live June 6.
**Resolved:** ~~Offboard in-app notice shows twice~~ — fixed (Part 3: reads from `profiles.offboard_reason`, only coach-initiated paths write it, self-leave writes no marker).

---

## Current Priorities (in order)

1. **Beta coach outreach** — 3–5 founding coaches at $19/mo locked.
2. **Google OAuth production verification** — currently testing mode only.
3. **Legal doc updates** — self-serve cancellation, Solo Premium $7.99 terms, pause/resume behavior, trial-aging disclosure, client-reconnection clause, coach-cancel-timing clause.
4. **Redirect URL cleanup** — once confident no old tryfitlog.com email links are still in circulation, remove tryfitlog.com entries from Supabase Auth allowlist.

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

## Session Log (brief — newest first)

- **Jun 9 (session 3, cont.)** — Profile gaps: added editable display name (all roles, saved to `profiles`, own-row UPDATE RLS already in place) + threaded `onProfileUpdate` from App for instant refresh; fleshed out the bare coach Profile with a read-only "Active clients" count. Save button muted-until-dirty. Deliberately deferred body stats (schema; pair with onboarding-assessment) and notification prefs (mail edge fns). Verified 3 roles via screenshots. `5fa44e6`.
- **Jun 9 (session 3)** — Filled the empty space beside the 90-day heatmap with a new `ComplianceSummary` (quantified totals), in both the solo Dashboard and coach `ClientView`. Reflowed to heatmap-left / tiles-right on desktop, stacking on mobile. Two lenses: coach = compliance breakdown (on-target/partial/under/avg), solo = mirror (days logged + on-track), preserving the descriptive-only wall. All derived from in-scope `heatmapData`; denominator ramps from first log and caps at 90 (new accounts read e.g. 12/12, not 12/90). New `summarizeCompliance()` util + 5 tests (53 total). Built a seeded visual-QA harness (`scripts/shoot-consistency.mjs`) — the existing ones don't seed nutrition data — and screenshot-verified both views at both widths. Shipped to `main` (`f5c1900`).
- **Jun 9 (session 2)** — Shipped the Tier-1 self-analytics onto the solo Dashboard (they previously existed coach-side only): one Premium-gated "Logging consistency" card (weekday/weekend split + best week + 90-day heatmap, consolidated behind a single SoloUpgrade CTA, one nutrition query). Extended milestone celebrations to solo (relaxed the client-only guard; edge fn no-ops the email when there's no coach). All descriptive-only by design to protect the coaching layer (see `decisions.md`). Verified both gated and Premium-populated paths + the solo milestone banner via the Playwright harness (seeded 90 days of data with `SOLO_BILLING_ENABLED` flipped locally, then reverted). Pushed to `main` (`3e418ff`). Reconciled `features.md` — most of Tier 1 was already built and still listed as roadmap.
- **Jun 9** — Nav redesign (responsive hamburger + pill tabs + logo mark), sticky-nav root-cause fix (`overflow-x: clip`, not `hidden`), solid bar (was frosted), password show/hide on all fields, restored manual barcode entry, ClientView header cleanup. Built a Playwright visual-QA harness (`scripts/shoot.mjs` / `shoot-all.mjs`) after repeatedly shipping UI blind — now screenshot-verify every change incl. coach/client screens via throwaway accounts. All key screens reviewed and clean. Harness finding (not a bug): `service_role` lacks INSERT grant on `coach_clients` — fine, the app inserts that row as the authenticated client (Join flow); use the client token in tooling. **OAuth is on hold — do not work on Google OAuth verification until the user explicitly asks.**
- **Jun 8 (session 3)** — Pre-launch security/feature audit + hardening, all deployed & pushed to `main` (`5253639`). Found `profiles` RLS disabled (any authed user could read all profiles) → enabled + scoped policy. Secured 4 open edge functions (call-prep/weekly-report/notify-report/notify-checkin) + weekly-digest cron (anon→service_role). Applied the never-pushed `trial_ledger` email_hash unique index. Webhook replay window + constant-time compare. Polish: 404 route, reset-password validator, lint 13→6. Verified via live throwaway-account RLS probes (own-row isolation + coach↔client reads). Gotchas this session: RLS-disabled-but-policies-defined is invisible in the policy list (check `relrowsecurity`); local `.vercel` link was stale → pointed at `fitlog` project, prod is `gardnr`; `supabase secrets set` errors on an access-token format quirk (used a role-claim gate instead of CRON_SECRET); `supabase db push --linked` works without Docker (db dump needs Docker).
- **Jun 8 (session 2)** — Log screen redesign (mockup match, all functionality preserved). Login friendly-error UX (during regional Supabase outage; resolved via VPN region-switch on user side). Progress charts 14→30 days (Dashboard + ClientView). 6-bug email/billing sweep: deletion email for all roles incl coach, coach-notify on client leave, login button in coach-deletion email, trial-marking moved checkout→webhook, orphaned Stripe customer recovery, `trial_ledger.email_hash` unique index. SoloUpgrade eligibility-aware label + CoachPaywall in-app delete modal. `sendEmail()` helper with Resend response checking. Non-bugs ruled out: coach email was landing in spam; "trial still available" was a two-email mix-up. Deploy gotcha: Vercel project is `gardnr`, use `--project gardnr`.
- **Jun 8** — Account deletion email notifications (client confirmation + coach notification). Auth error auto-signout. Metric color scheme fix (protein amber, carbs blue). Date navigation parseLocalDateString fix. UI polish (NavBar, footer links, favicon, document title). Resend DKIM/SPF confirmed via dig + dashboard — SPF on send subdomain, correct by design.
- **Jun 7 (session 2)** — Full rebrand FitLog → Gardnr. Responsive landing page rewrite (DM Sans, lp- namespace, 3 breakpoints). gardnr.fit purchased + DNS (Namecheap). Resend domain swap (tryfitlog.com deleted, gardnr.fit verified). All 10 edge functions redeployed with new sender. Supabase Auth updated. tryfitlog.com 308-redirect set. Nav simplified (removed "vs. status quo" link). Solo entry point added to landing footer.
- **Jun 7 (session 1)** — Parts 1–6 complete: coach offboarding overhaul, trial pause/resume, offboard marker on profiles, delete-account coach + solo branches, checkout ledger gate, trial warning on CoachPaywall, delete-account link on paywall. Coach + solo FK bugs fixed. GRANT issues resolved. Supabase upgraded to Pro. `config.toml` JWT bypass permanent.
- **Jun 6** — Live workflow verification (all flows passing). Trigger confirmed. AI-context refactor: split into `architecture.md` + `decisions.md` + slim `current-state.md`.
- **Jun 5/6 (prior session)** — Rebrand decision (Gardnr), new landing page built (not merged), DB + Stripe cleared for clean slate.
- **Jun 5** — Tier 1 feature sweep (6 features), 6 bug fixes, steps unique-constraint fix.
- **Jun 4** — Solo Premium + self-serve cancel/resume; legal docs; Stripe live mode; weekly digest.
- **Jun 3–4** — Stripe billing full implementation; design sprint (Inter, color system, surfaces); nudge mechanic; hide-calories; domain + Resend verified.
