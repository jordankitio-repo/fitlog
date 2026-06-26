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
- [ ] **[S/Co]** Sign up as solo — email + password + name; **18+/Terms checkbox is required** (can't submit unchecked).
- [ ] **[Co]** Sign up as coach (role picker → Coach); lands on the coach dashboard.
- [ ] Password rules enforced (min length/complexity); weak/breached password rejected with a clear message.
- [ ] Duplicate email → "account already exists, sign in instead" (not a raw error).
- [ ] Log in / log out; session persists across refresh; sign-out clears it.
- [ ] **Forgot password** → reset email arrives → reset link works → new password logs in; old password fails.
- [ ] Password show/hide toggle works on every password field (login, signup, reset, profile).
- [ ] Edit display name (Profile) → reflects in nav + (for client) to the coach.
- [ ] Avatar: upload → shows everywhere (nav, roster, chat); change; remove → falls back to initials.
- [ ] Theme toggle Auto/Light/Dark — switches live, persists, no flash on reload (both themes).
- [ ] (If Google OAuth is enabled for launch) Google sign-in creates/links the account; otherwise confirm the button is hidden.
- [ ] Wrong-password / unknown-email → friendly errors, no stack traces.

## 2. Onboarding (new solo/client)
- [ ] **[S/Cl]** First run shows the biometrics setup (units, sex, DOB, height, current/goal weight, goal, activity).
- [ ] DOB consistent with 18+ (no under-18 path).
- [ ] Completing it seeds starting macro targets + today's weigh-in; preview matches saved targets.
- [ ] **Skip** works → lands in app, no targets seeded, not re-prompted next launch.
- [ ] Unit preference (kg/lb, cm/in) carries through logging + display.
- [ ] A returning solo→client (already onboarded) is **not** re-prompted.
- [ ] Coaches never see onboarding.

## 3. Daily logging — the core loop **[S/Cl]**
- [ ] Log a food manually (name, calories, P/C/F, serving) → appears in the diary + updates day totals.
- [ ] Edit a food entry → totals recompute. Delete → removed, totals recompute.
- [ ] Log weight (with time-of-day); log steps; log cardio; log body measurements (each site).
- [ ] Re-saving weight/steps for the same day **updates** (no duplicate).
- [ ] **Mark day complete** → state shows; coach sees "marked complete." Un-complete if supported.
- [ ] Date navigation (prev/next, date picker) loads the right day; **today** is correct in your timezone (try late-night near midnight).
- [ ] "Hide calories" mode hides cals everywhere it should, still logs.
- [ ] A **failed save shows a toast/error** (simulate by going offline) — never silently looks successful.
- [ ] Empty day shows the inviting empty state; "mark complete" hidden on empty days.

## 4. Nutrition power features **[S/Cl]**
- [ ] **Food search** (type a food) → USDA results → select → prefills macros + serving + scales correctly.
- [ ] **Barcode scan** (camera) → OpenFoodFacts lookup → prefills; camera stops when closed.
- [ ] **Manual barcode** entry (numeric) → lookup works; bad barcode → graceful "not found."
- [ ] **Quick add** (frequent foods) → one-tap re-log inserts today's entry.
- [ ] **Saved meals:** save today's foods as a meal; re-log a saved meal; rename; delete; duplicate prevented (name+content).
- [ ] **Meal grouping:** assign Breakfast/Lunch/Dinner/Snack; per-meal subtotals correct.
- [ ] **Meal containers:** group items into a container; repeat a container; expand/collapse (keyboard too — Enter/Space).
- [ ] **Move/drag** an item between meal slots; drag a container; touch + mouse both work.
- [ ] **Multi-select** bulk: save-as-meal / move / delete in one go.
- [ ] **Copy previous day** brings forward the right entries.

## 5. Dashboard & analytics **[S/Cl]**
- [ ] Calorie/cardio/steps charts render (30-day) with correct data; empty states when no data.
- [ ] Weight trend + rolling average correct.
- [ ] 90-day compliance heatmap + summary; denominator ramps from first log (e.g. 12/12, not 12/90).
- [ ] Compliance breakdown (weekday/weekend) + energy-balance read show with proper caveats; no fabricated numbers.
- [ ] Milestone/streak celebration fires at the right streak.
- [ ] Drag-to-reorder dashboard cards persists per user (where enabled).
- [ ] Brand-new account → "Welcome" empty state, not broken charts.

## 6. Coach — roster & triage **[Co]**
- [ ] Roster lists active clients with avatars; attention triage colors (red/yellow/green) match the rules.
- [ ] Rollup banner counts (at risk / needs review / on track / need targets) are correct.
- [ ] "N check-ins to review" pill deep-links to the oldest waiting check-in.
- [ ] Sort + status pills behave; single-client coach still sees the legend/tooltip.
- [ ] Empty roster → "Add your first client" CTA focuses the invite field.

## 7. Coach — invite & client management **[Co]**
- [ ] Invite a client by email → invite email arrives with a working join link; "✓ Invite emailed" shows; copyable link is a fallback.
- [ ] Invitee opens the join link → page names the coach → accepts → becomes a client; first-run guides them.
- [ ] Re-invite someone who **already has an account** → correct "already has an account / already your client / client of another coach" handling.
- [ ] Open a client (ClientView): stats, charts, body-measurements card, targets, check-in section, reports, chat all load.
- [ ] **Set client targets** (TargetCalculator) → saves; client sees them.
- [ ] **Check-in builder:** add/edit/reorder/archive custom questions; set per-client cadence (weekly/biweekly/etc.).
- [ ] **Review a check-in** → mark reviewed + comment (via RPC) → client notified (email + bell + card).
- [ ] Client **cannot** fake `reviewed_at` (guard) — verify the review only works coach-side.
- [ ] **Weekly report** (AI): generate → review/edit → send → client sees it (blurred preview → full modal).
- [ ] **Meeting prep / call-prep** (AI, private) generates a distinct briefing; not visible to the client.
- [ ] **Smart nudge** sends the right contextual email (log reminder vs check-in) by client state.
- [ ] Section rails + cross-page deep-links (`?focus=`) jump to the right section.
- [ ] **Cross-tenant:** Coach A cannot see Coach B's clients or data anywhere in the UI (RLS in practice).

## 8. Messaging **[Co/Cl]**
- [ ] Coach↔client chat bubble: send/receive both directions; unread badge; mobile full-screen.
- [ ] Send failure shows an inline error (simulate offline) — message not lost silently.
- [ ] Chat header shows the right name + avatar on both sides.

## 9. Notifications **[all]**
- [ ] Bell badge counts new events + alerts; clears on open; re-pings when an alert reappears.
- [ ] **Recent events** (message, check-in, new report) deep-link to the source.
- [ ] **Needs-attention alerts** per role (coach: off-track clients; client: locked / check-in due / nudged) are accurate and clear when resolved.
- [ ] Live refresh: logging/check-in clears the relevant alert without a full reload.

## 10. Billing & subscriptions **(Stripe TEST mode — see header)**
- [ ] **[Co]** Coach paywall (when `BILLING_ENABLED=true`): no sub → paywall; checkout redirect → return → access granted.
- [ ] **[S]** Solo Premium trial start; trialing state; access to gated features.
- [ ] Trial **eligibility**: a second trial on the **same email** is refused (ledger, hashed email).
- [ ] **Cancel** → cancel-at-period-end; access continues to period end; confirmation email.
- [ ] **Resume** a canceled-at-period-end sub.
- [ ] Solo Premium **pause/resume** when the solo joins/leaves coaching; remaining days preserved.
- [ ] Webhook: cancel/lapse → clients offboarded to solo at period end (see §12).
- [ ] Orphaned Stripe customer recovery (deleted customer) → checkout still works.
- [ ] Card declines / abandoned checkout → no half-state; user can retry.

## 11. Lifecycle — offboarding, leaving, deletion **[Co/Cl]**
- [ ] **Client self-leaves** coaching → reverts to solo, keeps their data; coach notified (bell + email).
- [ ] **Coach cancels/lapses** → clients transitioned to solo at period end; clients notified on the dashboard; data retained.
- [ ] **Coach deletes account** → all their clients offboarded + roles flipped to solo + offboard marker + email; coach's own Stripe sub canceled.
- [ ] **Delete account** (any role) → Profile → delete → **all** personal data gone (nutrition, weight, cardio, steps, body measurements, targets, saved meals, day-complete, check-ins, messages, notifications) **+ profile photo purged**; confirmation email; Stripe sub canceled.
- [ ] After deletion: the email can sign up fresh; old data does not reappear.
- [ ] **Reconnection:** an ex-client only rejoins via a **new invite** (no auto-reconnect).
- [ ] Offboard banner shows the right reason copy; dismiss persists cross-device.

## 12. Emails (Resend) — confirm each actually arrives & links work
- [ ] Invite · password reset · weekly report notification · check-in submitted · check-in reviewed · nudge · milestone · account-deletion confirmation (client) · client-left/deleted notification (coach) · weekly digest (Mon cron).
- [ ] All render on-brand; links go to the right place; no broken/placeholder content.

## 13. Data rights & privacy (the compliance surface) **[all]**
- [ ] **Export my data** → downloads JSON containing **all** your tables (profile, logs, measurements, targets, saved meals, check-ins, messages, notifications).
- [ ] **Delete account** erases everything (see §11) — re-verify the photo is gone (avatars bucket).
- [ ] Avatars: a logged-out user / unrelated user **cannot** load another user's photo URL (private bucket).
- [ ] Footers link to Terms, Privacy, **Health Data** policy; `/.well-known/security.txt` loads.
- [ ] AI features only fire on explicit action (no auto-send to Anthropic); rate limit kicks in after the cap (30/h nutrition, 60/h report/prep).

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
- [ ] **Timezones:** log near local midnight → entry lands on the correct calendar day (esp. US negative offsets).
- [ ] **Network failure / Supabase blip:** friendly "couldn't connect" message, no stuck spinners, retry works.
- [ ] **Double-submit:** rapid double-click on save/checkout/invite doesn't create duplicates.
- [ ] **Empty states** everywhere (no clients, no logs, no check-ins, no reports) — inviting, not broken.
- [ ] **Long content** (long food names, long coach reports, many clients) doesn't break layout.
- [ ] **Concurrency:** same account open in two tabs/devices — edits don't corrupt; notifications reconcile.
- [ ] **Permissions:** deny camera (barcode) / it's unavailable → graceful fallback to manual entry.
- [ ] **Stale PWA:** old cached app after a deploy → update prompt recovers it (no broken avatars/blank screen).

## 17. Production smoke test (do right after each deploy)
- [ ] Load `www.gardnr.fit` (logged out) → landing renders, no console errors.
- [ ] Sign up a throwaway → onboard → log one food → see it on the dashboard.
- [ ] Check the error monitor (once Sentry is wired) shows no new exceptions from your run.
- [ ] Delete the throwaway account.

---

## Pre-launch sign-off
- [ ] §1–§9 pass for all applicable roles
- [ ] §10–§11 billing & lifecycle pass in Stripe test mode
- [ ] §12 emails all arrive & link correctly
- [ ] §13 data rights & privacy pass
- [ ] §14 PWA + browser matrix pass
- [ ] §15 a11y clean
- [ ] §16 edge cases pass
- [ ] Error monitoring live and quiet
- [ ] Known issues triaged (ship-blockers fixed; rest logged)

**Signed off for public launch:** __________________  **Date:** __________
