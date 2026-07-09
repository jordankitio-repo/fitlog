# Gardnr — Pre-Launch QA Test Plan

> The manual pass to run before going public (and before big releases after). Covers every flow × the 3 roles × the nasty cases. Mark each `[ ]` → `[x]` pass or `[!]` fail (note the bug). Don't trust "it worked once" — run the whole thing on a clean state.

## How to use this

**Roles:** **[S]** solo · **[Cl]** client (invited by a coach) · **[Co]** coach. Most data flows need a coach + client pair.

**Test accounts:** make throwaway accounts (`scripts/shoot.mjs` shows the pattern). Use **random, non-breached passwords** — leaked-password protection now blocks common ones like `Test123!`. Delete throwaways when done (tests the deletion flow too).

**Environments:**
- **Local** (`npm run dev`) — fast iteration; points at prod Supabase via `.env` (careful — real data) or a local stack.
- **Preview** (`npm run build && npm run preview`) — the production build (CSP/headers apply on real Vercel; not on local preview). Best for final checks.
- **Prod** (`www.gardnr.fit`) — smoke-test here after deploy with a throwaway account, then delete it.

**Billing note:** Stripe is in **live mode** and `BILLING_ENABLED`/`SOLO_BILLING_ENABLED` are currently **off**. To test §11 without real charges: flip the flags on in a local/preview build configured with **Stripe TEST keys**, use Stripe **test cards** (`4242 4242 4242 4242`), then revert. Never test billing against live keys unless you intend to refund.

**Reset between runs:** delete the throwaway account (full erasure), or use fresh emails. Coach/client state is sticky — start each role-pair scenario clean.

---

## 1. Auth & account
<!-- QA run 2026-07-07 (automated harness, local dev → prod Supabase): 15/17 pass, 2 partial. -->
- [x] **[S/Co]** Sign up as solo — email + password + name; **18+/Terms checkbox is required** (can't submit unchecked).
- [x] **[Co]** Sign up as coach (role picker → Coach); lands on the coach dashboard.
- [x] Password rules enforced (min length/complexity); weak/breached password rejected with a clear message. _(leaked-password protection confirmed ON: `Password1!` → 422 weak_password.)_
- [x] Duplicate email → "account already exists, sign in instead" (not a raw error). _(FIXED 2026-07-07: `friendlyError` now maps Supabase's "User already registered" to the sign-in copy — the anon `profiles` pre-check is dead under RLS. Verified via harness.)_
- [x] Log in / log out; session persists across refresh; sign-out clears it.
- [ ] **Forgot password** → reset email arrives → reset link works → new password logs in; old password fails. _(MANUAL: not testable with @example.com throwaways — Supabase rejects recovery for that domain. App wiring exists; needs a real inbox.)_
- [x] Password show/hide toggle works on every password field (login, signup, reset, profile). _(verified login+signup; shared `PasswordInput` component drives reset/profile too.)_
- [x] Edit display name (Profile) → reflects in nav + (for client) to the coach. _(nav verified; "to the coach" re-check in §7.)_
- [ ] Avatar: upload → shows everywhere (nav, roster, chat); change; remove → falls back to initials. _(not yet driven — file-upload flow, next pass.)_
- [x] Theme toggle Auto/Light/Dark — switches live, persists, no flash on reload (both themes). _(data-theme flips live; `gardnr-theme` persists across reload.)_
- [x] (If Google OAuth is enabled for launch) Google sign-in creates/links the account; otherwise confirm the button is hidden. _(button hidden — OAuth on hold, correct.)_
- [x] Wrong-password / unknown-email → friendly errors, no stack traces. _("Invalid login credentials", no stack.)_

## 2. Onboarding (new solo/client)
<!-- QA run 2026-07-07 (harness): 16/16 core-loop checks pass incl. all of §2. -->
- [x] **[S/Cl]** First run shows the biometrics setup (units, sex, DOB, height, current/goal weight, goal, activity).
- [x] DOB consistent with 18+ (no under-18 path). _(DOB field present + 18+ gate at signup; under-18 edge = MANUAL.)_
- [x] Completing it seeds starting macro targets + today's weigh-in; preview matches saved targets. _(preview computed; weigh-in seeded → Log shows 176 / Update.)_
- [x] **Skip** works → lands in app, no targets seeded, not re-prompted next launch. _(reload after skip = no re-prompt.)_
- [ ] Unit preference (kg/lb, cm/in) carries through logging + display. _(tested imperial; kg/cm carry-through = next pass.)_
- [ ] A returning solo→client (already onboarded) is **not** re-prompted. _(single-gate logic; needs a solo→client transition to drive.)_
- [x] Coaches never see onboarding.

## 3. Daily logging — the core loop **[S/Cl]**
<!-- QA run 2026-07-07 (harness): food/weight/steps/day-complete/empty-state VERIFIED. -->
- [x] Log a food manually (name, calories, P/C/F, serving) → appears in the diary + updates day totals. _(entry + 300-cal total verified.)_
- [x] Edit a food entry → totals recompute. Delete → removed, totals recompute. _(edit 300→500 recompute + delete drops entry, both VERIFIED.)_
- [x] Log weight (with time-of-day); log steps; log cardio; log body measurements (each site). _(weight, steps, cardio, waist measurement all VERIFIED.)_
- [x] Re-saving weight/steps for the same day **updates** (no duplicate). _(weight 176→178 updates + persists on reload.)_
- [x] **Mark day complete** → state shows; coach sees "marked complete." Un-complete if supported. _(toggle both ways verified; coach-side view = §7.)_
- [ ] Date navigation (prev/next, date picker) loads the right day; **today** is correct in your timezone. _(MANUAL — timezone/midnight.)_
- [ ] "Hide calories" mode hides cals everywhere it should, still logs. _(not yet driven.)_
- [ ] A **failed save shows a toast/error** (simulate by going offline). _(MANUAL — offline simulation.)_
- [x] Empty day shows the inviting empty state; "mark complete" hidden on empty days. _("Nothing logged yet today"; complete button gated on entries>0.)_

## 4. Nutrition power features **[S/Cl]**
<!-- QA run 2026-07-08 (harness): food search + saved meals + meal grouping VERIFIED. -->
- [x] **Food search** (type a food) → USDA results → select → prefills macros + serving + scales correctly. _(VERIFIED: edge fn 200, 12 results, select → 144 cal / 100g prefill.)_
- [ ] **Barcode scan** (camera) → OpenFoodFacts lookup → prefills; camera stops when closed. _(MANUAL — camera.)_
- [ ] **Manual barcode** entry (numeric) → lookup works; bad barcode → graceful "not found." _(not yet driven — OpenFoodFacts.)_
- [x] **Quick add** (frequent foods) → one-tap re-log inserts today's entry. _(VERIFIED: frequent-food quick-add re-logs, 500→1000; note: frequent list refreshes on reload, not after a manual add.)_
- [x] **Saved meals:** save today's foods as a meal; re-log a saved meal; rename; delete; duplicate prevented (name+content). _(save, re-log, dup-prevent, delete VERIFIED; rename impl correct (updates DB + refetches) but not driven by harness — MANUAL spot-check.)_
- [x] **Meal grouping:** assign Breakfast/Lunch/Dinner/Snack; per-meal subtotals correct. _(item logged under chosen meal (Lunch).)_
- [ ] **Meal containers:** group items into a container; repeat a container; expand/collapse (keyboard too). _(MANUAL — complex.)_
- [ ] **Move/drag** an item between meal slots; drag a container; touch + mouse both work. _(MANUAL — drag.)_
- [ ] **Multi-select** bulk: save-as-meal / move / delete in one go. _(select-mode + save-as-meal exercised; move/delete bulk = next pass.)_
- [ ] **Copy previous day** brings forward the right entries. _(not yet driven — needs a prior day.)_

## 5. Dashboard & analytics **[S/Cl]**
<!-- QA run 2026-07-07 (harness): renders with/without data, no page errors. -->
- [x] Calorie/cardio/steps charts render (30-day) with correct data; empty states when no data. _(dashboard renders for data + brand-new accounts, no page errors; per-chart value checks = MANUAL.)_
- [ ] Weight trend + rolling average correct. _(MANUAL — value correctness.)_
- [ ] 90-day compliance heatmap + summary; denominator ramps from first log. _(compliance logic unit-tested; UI = MANUAL.)_
- [ ] Compliance breakdown (weekday/weekend) + energy-balance read; no fabricated numbers. _(unit-tested; UI caveats = MANUAL.)_
- [ ] Milestone/streak celebration fires at the right streak. _(MANUAL — needs a streak.)_
- [ ] Drag-to-reorder dashboard cards persists per user. _(MANUAL — drag.)_
- [x] Brand-new account → "Welcome" empty state, not broken charts. _(verified — no broken charts on fresh account.)_

## 6. Coach — roster & triage **[Co]**
- [ ] Roster lists active clients with avatars; attention triage colors (red/yellow/green) match the rules.
- [ ] Rollup banner counts (at risk / needs review / on track / need targets) are correct.
- [ ] "N check-ins to review" pill deep-links to the oldest waiting check-in.
- [ ] Sort + status pills behave; single-client coach still sees the legend/tooltip.
- [ ] Empty roster → "Add your first client" CTA focuses the invite field.

## 7. Coach — invite & client management **[Co]**
<!-- QA run 2026-07-07 (harness, real coach→client→coachB via invite/join): 9/10 automated pass. Cross-tenant VERIFIED. AI/email items deferred to manual. -->
- [x] Invite a client by email → invite email arrives with a working join link; "✓ Invite emailed" shows; copyable link is a fallback. _(join link generated & works; real email delivery = MANUAL, example.com not deliverable.)_
- [x] Invitee opens the join link → page names the coach → accepts → becomes a client; first-run guides them. _(coach name personalizes; accept → client lands in onboarding.)_
- [x] Re-invite someone who **already has an account** → correct "already has an account / already your client / client of another coach" handling. _(verified "already your client" + "coach account"; `getInviteBlockReason` unit-tested for all branches.)_
- [x] Open a client (ClientView): stats, charts, body-measurements card, targets, check-in section, reports, chat all load. _(sections render; per-card deep check = MANUAL.)_
- [x] **Set client targets** (TargetCalculator) → saves; client sees them. _(VERIFIED: coach sets calories=2222 → targets POST 201 + persists on reload; client dashboard shows "targets are already set for you". Note: `saveClientTargets` swallows errors to console.error — no user-facing error toast on failure.)_
- [x] **Check-in builder:** add/edit/reorder/archive custom questions; set per-client cadence (weekly/biweekly/etc.). _(client submit → coach view VERIFIED via legacy form; custom-question builder + cadence UI = MANUAL. NOTE: legacy check-in requires BOTH obstacles + notes to submit — intended/by-design.)_
- [x] **Review a check-in** → mark reviewed + comment (via RPC) → client notified (email + bell + card). _(VERIFIED: review_checkin RPC 204 → client bell pings + sees coach comment. Email = MANUAL.)_
- [x] Client **cannot** fake `reviewed_at` (guard) — verify the review only works coach-side. _(covered by RLS integration harness — 103 tests incl. review guard.)_
- [ ] **Weekly report** (AI): generate → review/edit → send → client sees it (blurred preview → full modal). _(MANUAL — Anthropic call + client-side verify.)_
- [ ] **Meeting prep / call-prep** (AI, private) generates a distinct briefing; not visible to the client. _(MANUAL — AI + privacy check.)_
- [ ] **Smart nudge** sends the right contextual email (log reminder vs check-in) by client state. _(MANUAL — needs inbox.)_
- [ ] Section rails + cross-page deep-links (`?focus=`) jump to the right section. _(not yet driven.)_
- [x] **Cross-tenant:** Coach A cannot see Coach B's clients or data anywhere in the UI (RLS in practice). _(VERIFIED: Coach B roster empty + `/client/{A's client}` direct URL leaks no data. Backs the DB-layer RLS harness.)_

## 8. Messaging **[Co/Cl]**
<!-- QA run 2026-07-08 (harness, real coach↔client pair): 8/9 pass. -->
- [x] Coach↔client chat bubble: send/receive both directions; unread badge; mobile full-screen. _(both directions VERIFIED; mobile full-screen = MANUAL.)_
- [ ] Send failure shows an inline error (simulate offline) — message not lost silently. _(MANUAL — offline simulation.)_
- [x] Chat header shows the right name + avatar on both sides. _(coach sees client name, client sees coach name; avatar render = MANUAL.)_

## 9. Notifications **[all]**
<!-- QA run 2026-07-08 (harness): bell ping + clear VERIFIED. -->
- [x] Bell badge counts new events + alerts; clears on open; re-pings when an alert reappears. _(pings on new message + clears on open VERIFIED; re-ping = MANUAL.)_
- [x] **Recent events** (message, check-in, new report) deep-link to the source. _(message + check-in events VERIFIED. FIXED 2026-07-08: coach "client checked in" events were 400ing — `NotificationCenter` queried `check_ins.coach_id` (no such column); now scoped to `client_id IN (clients)`. Verified coach bell pings on submit.)_
- [ ] **Needs-attention alerts** per role (coach: off-track clients; client: locked / check-in due / nudged) are accurate and clear when resolved. _(alert logic unit-tested; UI accuracy = MANUAL.)_
- [ ] Live refresh: logging/check-in clears the relevant alert without a full reload. _(MANUAL.)_

## 10. Billing & subscriptions **(Stripe TEST mode — see header)**
<!-- Flags currently OFF (App.jsx BILLING_ENABLED=false, SOLO_BILLING_ENABLED=false). The paid SOLO tier is RETIRED (solo is free, hasSoloPremium always true) — solo billing items below are N/A. Coach billing = the real business; test before flipping BILLING_ENABLED on.
QA run 2026-07-08 (Stripe TEST mode, isolated local stack: local Supabase + functions serve + `stripe listen`, App.jsx flag flipped then reverted): coach matrix 18/18 + paywall UI 2/2. Flag reverted to false; stack torn down. -->
- [x] **[Co]** Coach paywall (when `BILLING_ENABLED=true`): no sub → paywall; checkout redirect → return → access granted. _(VERIFIED: no-sub coach → CoachPaywall "Start your free trial"; "Start 30-day free trial" → redirects to Stripe Checkout (`cs_test_…`); checkout shows correct 30-day trial + $19/mo founding price. Post-checkout access = webhook-driven (below).)_
  - [x] Paywall controls (abandon/return + delete) — VERIFIED 2026-07-08 (9/9): **Sign out** from paywall → logged out → log back in → **paywall again** (unfinished coach resumes gated); **Delete account** from paywall (both no-sub and abandoned `incomplete`-sub) → erases account + subscription row → can't log back in. **FIXED:** `CoachPaywall.confirmDelete` now checks the delete response before signing out (was signing out even on a failed delete — Profile path already did this).
- [~] ~~**[S]** Solo Premium trial start; trialing state; access to gated features.~~ **N/A — paid Solo tier retired (solo is free).**
- [x] Trial **eligibility**: a second trial on the **same email** is refused (ledger, hashed email). _(VERIFIED: trial recorded in `trial_ledger` on `trialing`; ledger persists across account deletion (email-hash keyed); `create-checkout-session` gates the trial on it.)_
- [x] **Cancel** → cancel-at-period-end; access continues to period end; confirmation email. _(VERIFIED: `cancel-subscription{action:cancel}` → `cancel_at_period_end=true`. Confirmation email = MANUAL.)_
- [x] **Resume** a canceled-at-period-end sub. _(VERIFIED: `{action:resume}` → `cancel_at_period_end=false`.)_
- [~] ~~Solo Premium **pause/resume** when the solo joins/leaves coaching; remaining days preserved.~~ **N/A — paid Solo tier retired** (plumbing dormant behind `SOLO_BILLING_ENABLED`).
- [x] Webhook: cancel/lapse → clients offboarded to solo at period end (see §12). _(VERIFIED: signed `customer.subscription.deleted` → coach sub `canceled` + active client `coach_clients.status → offboarded`.)_
- [ ] Orphaned Stripe customer recovery (deleted customer) → checkout still works. _(not driven; `customerIsUsable()` logic present in create-checkout-session — recreates customer if deleted.)_
- [x] Card declines / abandoned checkout → no half-state; user can retry. _(VERIFIED manually 2026-07-08: `4000…0002` → declined, stayed on Checkout, no sub created (no half-state); retry with `4242…` → completed → single sub row flipped to `trialing` + `trial_ledger.coach_trial_used=true`. Confirms the full browser→Stripe→webhook path end-to-end.)_

## 11. Lifecycle — offboarding, leaving, deletion **[Co/Cl]**
<!-- QA run 2026-07-08: delete-erasure + client-self-leave VERIFIED; coach-side offboard still to drive. -->
- [x] **Client self-leaves** coaching → reverts to solo, keeps their data; coach notified (bell + email). _(VERIFIED: leave → solo (no leave control), coach roster drops client, coach bell pings; email = MANUAL.)_
- [ ] **Coach cancels/lapses** → clients transitioned to solo at period end; clients notified on the dashboard; data retained. _(MANUAL — Stripe/billing.)_
- [ ] **Coach deletes account** → all their clients offboarded + roles flipped to solo + offboard marker + email; coach's own Stripe sub canceled. _(not yet driven — needs coach+clients fixture.)_
- [x] **Delete account** (any role) → Profile → delete → **all** personal data gone (…) **+ profile photo purged**; confirmation email; Stripe sub canceled. _(erasure VERIFIED via real delete button + fresh-export-empty; confirmation email = MANUAL; Stripe = billing off.)_
- [x] After deletion: the email can sign up fresh; old data does not reappear. _(VERIFIED: re-signup same email → empty export.)_
- [ ] **Reconnection:** an ex-client only rejoins via a **new invite** (no auto-reconnect).
- [ ] Offboard banner shows the right reason copy; dismiss persists cross-device.

## 12. Emails (Resend) — confirm each actually arrives & links work
<!-- QA run 2026-07-09: triggered via a real coach↔client pair on Gmail +aliases (jordangarden44+…), verified arrival/content/links via the Gmail integration. 7 verified, 1 finding, 3 deferred. -->
- [x] **Invite** — arrives (INBOX), on-brand (green Gardnr), "Accept invite" → `gardnr.fit/join?token=<token>` (token verified against dashboard). _(Note: the Gmail integration mis-decodes the `=` in QP URLs — shows `token[`/`token�` — a display artifact, the real link is `?token=<full>`.)_
- [x] **Check-in submitted** (→ coach) — arrives; shows adherence/energy/obstacles/notes.
- [x] **Check-in reviewed** (→ client) — arrives; includes the coach's note.
- [x] **Nudge** (→ client) — arrives ("Time to log your day"), correct log-reminder.
- [x] **Client-left notification** (→ coach) — arrives.
- [x] **Account-deletion confirmation** (client + coach) — arrives, on-brand.
- [x] **Password reset** — arrives + link works (`…supabase.co/auth/v1/verify?...&redirect_to=gardnr.fit/reset-password`). **FIXED 2026-07-09:** enabled Supabase Auth custom SMTP (Resend) → now sends from **`noreply@gardnr.fit`** (verified; was `noreply@mail.app.supabase.io`). Sender/trust issue resolved. _(Optional polish left: the email **body** is still Supabase's default recovery template with an "Opt out → supabase.com" footer — customize under Auth → Email Templates → Reset Password for full on-brand HTML.)_
- [ ] **Weekly report notification** — DEFERRED (needs driving the AI report generate→send flow).
- [ ] **Milestone** (→ coach) — DEFERRED (needs a real multi-day streak; can't fake without backdating prod data).
- [ ] **Weekly digest** (Mon cron) — DEFERRED (cron-triggered; not on-demand invokable on prod).
- [x] All render on-brand; links go to the right place; no broken/placeholder content. _(the 7 above render on-brand + deliver to INBOX, not spam; password-reset is the lone off-brand exception, flagged above.)_

## 13. Data rights & privacy (the compliance surface) **[all]**
<!-- QA run 2026-07-07 (harness): export/private-avatar/delete-erasure all VERIFIED. -->
- [x] **Export my data** → downloads JSON containing **all** your tables (profile, logs, measurements, targets, saved meals, check-ins, messages, notifications). _(real "Download data" button → JSON with all 13 tables + account/email.)_
- [x] **Delete account** erases everything (see §11) — re-verify the photo is gone (avatars bucket). _(real Profile delete → logs out; erasure verified via fresh-export-empty. Avatar purge is in the delete-account function; direct post-delete bucket re-check = MANUAL.)_
- [x] Avatars: a logged-out user / unrelated user **cannot** load another user's photo URL (private bucket). _(VERIFIED: public URL → 400; unrelated user sign → 400; owner sign+read → 200.)_
- [x] Footers link to Terms, Privacy, **Health Data** policy; `/.well-known/security.txt` loads. _(security.txt → 200; all three legal pages load under prod CSP.)_
- [ ] AI features only fire on explicit action (no auto-send to Anthropic); rate limit kicks in after the cap (30/h nutrition, 60/h report/prep). _(rate-limit tables covered by RLS harness; "explicit action only" = MANUAL.)_

## 14. PWA / mobile / cross-browser
- [ ] Install as PWA (mobile + desktop); icon/splash correct; theme applied before paint (no flash).
- [ ] Mobile bottom tab bar (Dashboard/Log/Profile or Clients/Profile); logged-out mobile lands on the login form.
- [ ] PWA update prompt appears after a new deploy; updating loads the new build.
- [ ] **Pinch-zoom works** (a11y fix) and inputs don't auto-zoom on iOS focus.
- [ ] **Browser matrix:** Chrome, Safari, Firefox (desktop) + iOS Safari + Android Chrome — core loop works on each.
- [ ] App works under the production **CSP** (no blocked scripts/styles/fonts/connections in the console on prod/preview).

## 15. Accessibility (re-verify after any UI change)
- [ ] `node scripts/a11y-scan.mjs` (light) and `AXE_DARK=1 node scripts/a11y-scan.mjs` (dark) → 0 violations on public pages.
- [ ] Keyboard-only: tab through signup, log a food, open/close modals (focus trap + Esc), expand a meal — all reachable, visible focus ring.
- [ ] Screen-reader smoke test (VoiceOver) on login + dashboard: labels read sensibly.

## 16. Edge cases & cross-cutting (the stuff that bites)
<!-- QA run 2026-07-09 (harness, negative-tz + offline sim): 7/7 automatable pass; found+fixed a double-submit dup. -->
- [x] **Timezones:** log near local midnight → entry lands on the correct calendar day (esp. US negative offsets). _(America/Los_Angeles context → entry logged on the local Pacific date; date logic unit-tested. True 23:59-boundary = MANUAL.)_
- [x] **Network failure / Supabase blip:** friendly "couldn't connect" message, no stuck spinners, retry works. _(offline food-save → error toast, not silent success; offline login → "Unable to connect to our servers.")_
- [x] **Double-submit:** rapid double-click on save/checkout/invite doesn't create duplicates. _(**FOUND+FIXED**: food "Add entry" was a plain insert with no guard → double-click made 2 rows; added a synchronous re-entrancy ref + disabled button. Verified 2→1. Weight/steps/measurements = upserts (safe); cardio/weight/steps collapse the form synchronously (button vanishes) so practically safe; checkout has a loading guard. **Invite (`Send invite`) was ALSO vulnerable (inserts, no guard, no DB unique constraint) → FIXED with the same ref-guard + disabled buttons; verified double-click → exactly 1 invitation.**)_
- [x] **Empty states** everywhere (no clients, no logs, no check-ins, no reports) — inviting, not broken. _(fresh solo: dashboard welcome + log "nothing logged yet", no broken UI. Coach empty roster = §6.)_
- [x] **Long content** (long food names, long coach reports, many clients) doesn't break layout. _(~200-char food name → renders, no horizontal overflow. Long reports / many clients = MANUAL.)_
- [x] **Concurrency:** same account open in two tabs/devices — edits don't corrupt; notifications reconcile. _(manually verified by user 2026-07-09. Automation N/A — multi-tab logs out under Playwright.)_
- [x] **Permissions:** deny camera (barcode) / it's unavailable → graceful fallback to manual entry. _(no camera → scanner doesn't crash; manual "Enter barcode #" stays available.)_
- [x] **Stale PWA:** old cached app after a deploy → update prompt recovers it (no broken avatars/blank screen). _(manually verified by user 2026-07-09 against the double-submit-fix deploy.)_

## 17. Production smoke test (do right after each deploy)
<!-- QA run 2026-07-08 (harness vs live www.gardnr.fit, after the CoachPaywall deploy): 6/6. -->
- [x] Load `www.gardnr.fit` (logged out) → landing renders, no console errors. _(landing ✓; no app console/page errors during the run.)_
- [x] Sign up a throwaway → onboard → log one food → see it on the dashboard. _(signup → skip → logged "Smoke Oatmeal" 321 cal → 321 shows on dashboard.)_
- [x] Check the error monitor (once Sentry is wired) shows no new exceptions from your run. _(RESOLVED 2026-07-09: `VITE_SENTRY_DSN` set in Vercel Production + redeployed → Sentry now LIVE. Verified: a thrown error on www.gardnr.fit → `POST …ingest.us.sentry.io/… 200`. Was dormant before (DSN unset). Project: gardnr-frontend / digigarden-llc. Sentry "Prevent Storing of IP Addresses" enabled (no geo). **FOLLOW-UP (deferred):** source maps not uploaded → stack traces are minified/unreadable; wire up the Sentry Vite plugin so errors map to real source.)_
- [x] Delete the throwaway account. _(delete-account 200; self-cleans.)_
<!-- Investigated 2026-07-08: automated fresh-navigation (new tab / bare goto to a route) after signup shows a logged-out state + cleared token; reproduced headless AND headed. NOT a real bug — user confirmed a real browser stays logged in (Playwright + supabase-js Web Locks / just-signed-up refresh-token timing). Harnesses must use SPA nav / reload, not goto-to-new-route, after auth. -->

**Notes:** Prod header/CSP/security.txt checks are in §13/§14 (already ✓). One throwaway from the first smoke run couldn't self-delete (unknown email) — remove from Supabase Auth dashboard.

---

## Pre-launch sign-off
- [ ] §1–§9 pass for all applicable roles
- [ ] §10–§11 billing & lifecycle pass in Stripe test mode
- [ ] §12 emails all arrive & link correctly
- [ ] §13 data rights & privacy pass
- [ ] §14 PWA + browser matrix pass
- [ ] §15 a11y clean
- [ ] §16 edge cases pass
- [x] Error monitoring live and quiet _(Sentry LIVE as of 2026-07-09 — verified capturing on www.gardnr.fit. See §17.)_
- [ ] Known issues triaged (ship-blockers fixed; rest logged)

**Signed off for public launch:** __________________  **Date:** __________
