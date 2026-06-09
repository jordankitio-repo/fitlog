
# Gardnr — Decisions Log

> **Purpose:** The reasoning behind every major product and technical choice. When a future decision contradicts one here, add the new decision rather than editing the old one — the history of *why* matters.
>
> **Format:** Decision / Reason / Consequences. Grouped by area.
>
> **What does NOT belong here:** how things are wired (→ `architecture.md`), live status (→ `current-state.md`), feature backlog (→ `features.md`).

---

## Product Strategy

### Nutrition is the core product, not an add-on
**Reason:** Every competing platform (Trainerize, TrueCoach, Hevy) treats nutrition as an afterthought or a paid add-on and outsources it to MyFitnessPal. Gardnr makes nutrition tracking, macro compliance, and body composition the core product.
**Consequences:** Product positioning is "the nutrition layer alongside whatever workout tool you already have," not a workout platform. Workout programming is explicitly deferred until nutrition coaching is validated. Native nutrition logging is built in, never outsourced.

### Coach–client layer is hard-walled from solo users
**Reason:** Protect the coach product's positioning and price. A solo user who wants accountability should need a coach, not a cheaper self-serve tier that replicates coaching.
**Consequences:** Solo Premium gets *better self-analytics only*. The interaction layer (targets-from-coach, reports, check-ins, nudges, call prep, private notes) is never available to solo regardless of tier.

### Clients are always free
**Reason:** Clients are invited by a coach, not self-serve payers. The coach pays for the platform and brings the client.
**Consequences:** No client-side billing. Clients receive the coaching layer but not solo self-analytics (those are either a coach-side view of client data or a Solo Premium upsell). Offboarded clients fall back to a solo tier.

### Web-first, no client app download
**Reason:** Removing the app-install step lowers friction for coaches onboarding clients — a key differentiator.
**Consequences:** Everything must work in-browser and be mobile responsive. A branded mobile app is far-future only.

---

## Pricing & Billing

### Founding coach rate locked forever at $19/mo
**Reason:** Reward and retain the first coaches who validate the product; create urgency for early adoption.
**Consequences:** Two live price IDs maintained (founding $19, standard $29). Founding price stays honored even after standard launches.

### Cancel at period end, not immediately
**Reason:** Fairer to the user (they keep what they paid for), avoids refund logic entirely, and the existing webhook already handles the eventual `deleted` event.
**Consequences:** Sets Stripe `cancel_at_period_end = true`; status stays `active`/`trialing` until period end so access continues correctly. For coaches, clients are NOT offboarded until the period actually ends (the `deleted` event fires then). During a trial, canceling means it cancels at trial end with no charge ever.

### `cancel-subscription` looks up the sub by current role, not an OR query
**Reason:** An `or=(coach_id,solo_id)` query could pick the wrong row if a user ever had both a coach sub and an old solo sub row.
**Consequences:** Role-based lookup is precise and naturally blocks paused/client users (role `client` → 400, no sub to manage).

### `pause-solo-subscription` sets the local marker only if the Stripe pause succeeds (active subs)
**Reason:** If Stripe failed but the local marker was set anyway, the user would lose access locally while Stripe kept billing — worst of both worlds.
**Consequences:** Active subs: marker set only on Stripe success. Trialing subs (no Stripe call): marker always set. Resume mirrors this — `paused_for_coaching` cleared only if the Stripe resume call succeeded.

### Canceled users cannot start a fresh trial
**Reason:** Prevent trial-farming by repeatedly canceling and re-subscribing.
**Consequences:** `create-checkout-session` blocks `canceled` status from re-trialing.

### ~~Trial marked used at checkout-session creation~~ — OVERRIDDEN Jun 8
**Original behavior:** `create-checkout-session` wrote the `trial_ledger` entry the moment the Stripe checkout session was created.
**Override reason:** Opening the Stripe page and then abandoning it (never paying) still burned the trial — the next attempt showed an immediate charge instead of "free then $X".
**New behavior:** Trial usage is recorded by `stripe-webhook` on `checkout.session.completed`, and only when the resulting subscription actually has `status === 'trialing'`. The webhook resolves the owner via `subscription.metadata.{solo_id,coach_id}` + `plan_type`, hashes the profile email (byte-identical to `create-checkout-session` / `check-trial-eligibility`), and upserts with `on_conflict=email_hash`.
**Consequences:** Requires a unique index on `trial_ledger.email_hash` (migration `20260608120000`) — the merge-duplicates upsert needs it as the conflict target, or it inserts duplicate rows and the `limit=1` eligibility read becomes nondeterministic. Eligibility is still computed at checkout (to decide `trial_period_days`); only the *recording* moved. The ledger still survives account deletion, so re-signup with the same email cannot earn a second free trial.

### Stored Stripe customer IDs are verified before reuse
**Reason:** A `stripe_customer_id` can be orphaned if the customer is deleted in Stripe; reusing it makes checkout fail with "No such customer."
**Consequences:** `create-checkout-session` calls `customerIsUsable()` (GET + `deleted` check) before reusing an ID, and creates a fresh customer if it's gone. The new ID is persisted by the existing subscription upsert.

### Transactional emails are awaited, not fire-and-forget
**Reason:** Supabase Edge (Deno) can tear down the isolate as soon as the response returns, killing an in-flight `fetch().catch()` before Resend receives it — silently dropping "sent" emails. The old code also never checked Resend's response, so 4xx errors were swallowed.
**Consequences:** Deletion/offboard emails are `await`ed and routed through a `sendEmail()` helper that logs non-OK Resend responses. Costs ~300ms after the user-facing work is done; worth it for delivery reliability + diagnosability.

### ~~Trial clock continues during coaching (accepted v1 limitation)~~ — OVERRIDDEN Jun 7
**Original reason:** Stripe has no true trial-clock pause.
**Override:** Trial time is now preserved. On pause: remaining days calculated from Stripe `trial_end`, Stripe trial subscription cancelled (no charge — trialing), `paused_trial_days_remaining` stored on the subscriptions row. On resume: new Stripe subscription created via API with `trial_period_days = paused_trial_days_remaining` on the same customer + saved payment method. Active (paying) subs unchanged — `pause_collection` still used for those.
**Consequences:** Write-before-delete ordering is critical: DB row must have `paused_for_coaching=true` committed before Stripe DELETE fires, because `customer.subscription.deleted` webhook reads that flag. `stripe-webhook` skips the deleted handler when `paused_for_coaching=true` to prevent double-processing.

### Data is never deleted regardless of payment status (cancellation only)
**Reason:** Trust and re-activation. A coach or solo user who lapses should not lose history.
**Consequences:** Access is restricted, not data. Canceled accounts keep all rows; resubscribing restores access to intact data.
**Exception (Jun 7):** Account deletion (explicit user action) IS a full hard delete — all rows + auth user. This is a legal right and a separate flow from cancellation. The `trial_ledger` table is the one thing that survives deletion by design (fraud prevention — see below).

### Trial eligibility is per-product granular, not blanket
**Reason:** A deleted coach who re-signs up as solo never used a solo trial. Burning both trials on one deletion is punitive and inconsistent.
**Consequences:** `trial_ledger` tracks `coach_trial_used` and `solo_trial_used` separately. Deleting as coach burns `coach_trial_used` only; solo trial remains available. `create-checkout-session` checks the relevant flag before attaching a trial period.

### `trial_ledger` stores SHA-256 peppered hash, not plaintext email
**Reason:** Minimum PII retention for fraud prevention. Plaintext email retention post-deletion creates GDPR/CCPA exposure.
**Consequences:** Hash = `SHA-256(EMAIL_HASH_PEPPER + ':' + lower(trim(email)))`. Pepper stored as Supabase secret. If pepper ever changes, old hashes can't be matched — treat as a breaking change. Legal todo: disclose fraud-prevention retention in Privacy Policy.

### On deletion, cancel Stripe subscription but keep Stripe customer
**Reason:** Cleaner re-signup (customer record preserved), Stripe-side history maintained, avoids recreating a customer on re-signup.
**Consequences:** `delete-account` calls `DELETE /v1/subscriptions/:id` but never deletes the Stripe customer. The customer's payment method history is preserved for any future re-subscription.

### Active Solo Premium resume = billing resumes where period left off
**Reason:** Standard SaaS behavior. Extending the billing period by the paused duration is more complex and not expected by users.
**Consequences:** `pause_collection` cleared on resume; Stripe resumes at the existing `current_period_end`. No period extension.

### Coach re-signup after deletion = paywalled, no trial
**Reason:** Coaches consumed their trial. Re-deletion + re-signup must not be a trial farming vector.
**Consequences:** `create-checkout-session` checks `coach_trial_used` in `trial_ledger`; if true, no `trial_period_days` is attached — coach must subscribe directly. Account can exist (hits `CoachPaywall`) but has no free access.

### Offboard notice lives on `profiles`, not `coach_clients`
**Reason:** When a coach deletes their account, the `coach_clients` row is destroyed. A notice keyed to that row dies with it.
**Consequences:** `profiles.offboarded_at` + `profiles.offboard_reason` are written at offboard time and survive coach deletion. Dashboard reads from `profiles`. Dismiss clears both fields to null server-side (cross-device, no localStorage timestamp key). Self-leave (`offboard-self`) writes no marker — the user did it themselves, no banner needed.

### Offboard reason values: `coach_offboarded` | `coach_deleted`
**Reason:** Banner copy differs by reason; the client deserves to know whether their coach chose to end the relationship or their account was closed.
**Consequences:** `offboard-client` writes `coach_offboarded`; `delete-account` coach branch writes `coach_deleted`. `offboard-self` writes nothing. Dashboard renders different copy per value.

### Access allow-list is `['trialing', 'active', 'past_due']`
**Reason:** `past_due` users should keep access during Stripe Smart Retries (~2 weeks) rather than being cut off the moment a card fails — fairer and reduces involuntary churn.
**Consequences:** A single shared `PAID_STATUSES` constant is used everywhere for access checks, keeping the rule consistent across coach and solo gating.

---

## Data Model

### Single unified `messages` table
**Reason:** Replaced split `coach_messages` + `client_messages` for a unified thread UX.
**Consequences:** Both coach and client read the same conversation stream in chronological order; `sender_id` identifies who sent each message.

### `profiles.role` has NO default
**Reason:** Ensure new users (including OAuth) see the RolePicker instead of silently defaulting to `solo`.
**Consequences:** Role is null until RolePicker runs. If a default ever reappears, drop it: `ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;`

### Reports are separate from messages
**Reason:** Different purpose — reports are formal, structured, and archivable; messages are conversational.
**Consequences:** Separate `reports` table with `week_of`, read/unread, archive state; client sees reports grouped by week, collapsible.

### Copy-food copies nutrition only, never weight/steps/cardio
**Reason:** Weight and steps are *measurements*, not re-enterable plan data. Copying them would falsify the record.
**Consequences:** The copy-food feature in Log.jsx is scoped to nutrition entries only.

### `weight_log` has no unique constraint; reads take the most recent
**Reason:** Multiple weigh-ins per day are legitimate (morning vs evening).
**Consequences:** `.maybeSingle()` would throw on multiple rows; reads use `order('created_at', desc).limit(1)` instead.

### `steps_log` unique on `(user_id, logged_date)`, not `logged_date`
**Reason:** Original `UNIQUE (logged_date)` was global — only one user could log steps per date across the whole platform (a real bug).
**Consequences:** Per-user-per-date uniqueness; `saveSteps` upserts on `user_id,logged_date`.

### `weighed_at` stored as 24hr `HH:MM:SS`, not a locale string
**Reason:** A locale-dependent string ("10:30 AM") doesn't match the PostgreSQL `time` column and breaks sorting/parsing.
**Consequences:** Stored as `HH:MM:SS`; `formatTime()` converts to 12hr for display.

---

## Time & Dates

### Sunday is the week boundary, everywhere
**Reason:** One consistent week definition across reports, compliance, and check-ins prevents mismatches.
**Consequences:** All week calculations depend on Sunday start (`getDay()` === 0). `getCurrentWeekSunday()` is the single source; weekly reports cover Sunday→Saturday.

### All date math uses local Date components, never `new Date('YYYY-MM-DD')`
**Reason:** `new Date('YYYY-MM-DD')` parses as UTC, which shifts the date (and weekday) by one in negative-offset timezones — caused real week_of mismatches and weekday-split bugs.
**Consequences:** `toLocalDateString` and local `Date` object access are used throughout heatmap, weekday/weekend split, and week calculations.

---

## Edge Functions & Email

### Webhook and internal functions deployed `--no-verify-jwt`, verify internally
**Reason:** Stripe doesn't send a Supabase JWT (caused 401s); internal functions need to verify the caller themselves rather than rely on gateway JWT checks.
**Consequences:** `stripe-webhook` verifies the Stripe signature (HMAC-SHA256). Internal functions (`pause-solo-subscription`, `cancel-subscription`, `milestone-reached`) verify the caller via `auth/v1/user`.
**Important:** `verify_jwt = false` must be set in `supabase/config.toml` for each affected function — redeploying without this resets to the default (JWT required) and breaks Stripe. Config entries added Jun 7 for `stripe-webhook`, `pause-solo-subscription`, `cancel-subscription`, `milestone-reached`. Git push does NOT deploy edge functions — `supabase functions deploy <name>` is always a separate step.

### Client-facing AI/email functions must verify the caller and derive recipients server-side (Jun 8 2026)
**Reason:** `call-prep`, `weekly-report`, `notify-report`, `notify-checkin` ran with `verify_jwt=false` and **no in-function caller check** — they were open: anyone with the URL could burn Anthropic credits (AI proxies) or send email to arbitrary addresses from the verified `noreply@gardnr.fit` domain (email relays). `verify_jwt=false` alone is not security; it *removes* the gateway check, so the function MUST verify the caller itself.
**Consequences:** Each verifies the caller via `auth/v1/user`. Where a coach acts on a client (`call-prep`, `weekly-report`, `notify-report`), the client now passes `clientId` and the function confirms an **active** `coach_clients` row. Email recipients are **derived server-side** from the relationship (never trusted from the request body): `notify-report` looks up the client email from `clientId`; `notify-checkin` looks up the coach from the caller's active relationship. **Rule: a `verify_jwt=false` function must do its own auth; never trust a request-body email/recipient.**

### `weekly-digest` cron must authenticate as `service_role`, not anon (Jun 8 2026)
**Reason:** The `weekly-coach-digest` pg_cron job (`0 13 * * 1`) called the function with the **public anon key**, so the endpoint was effectively open — anyone could trigger a fan-out of digest emails to every coach. The anon key is shipped in the frontend bundle, so it can never be a gate.
**Consequences:** `weekly-digest` now sets `verify_jwt = true` (gateway validates the JWT signature) and additionally requires the decoded `role` claim to be `service_role`. The pg_cron job was rewritten (via a one-shot `service_role`-only RPC) to send the service role key in its `Authorization` header. The key lives only in `cron.job` (not exposed to anon/authenticated, never committed to the repo). `CRON_SECRET` was abandoned because the `supabase secrets set` CLI errored on an access-token format quirk in this environment; gating on the role claim needs no new secret.

### RLS must be ENABLED on the table, not just have policies (Jun 8 2026)
**Reason:** `profiles` had policies defined (own-read, coach-read-clients, etc.) but `relrowsecurity = false`, so they were silently ignored and any authenticated user could read every profile (email/name/role enumeration). A defined-but-unenforced policy looks identical to a working one in the dashboard policy list — there is no error.
**Consequences:** Enabled RLS on `profiles` (migration `20260608134000`) and consolidated to a single scoped SELECT policy (`is_profile_related(id)`: own row or active coach↔client) + own-row INSERT/UPDATE. **Rule: when auditing access, check `pg_class.relrowsecurity` per table (or do a live cross-account read) — don't trust the policy list alone.** All other tables were verified RLS-enabled the same day.

### CoachPaywall always exposes a "Delete account" path
**Reason:** Users who sign up, pick coach role, and reach the paywall but never subscribe are stuck — no Profile page is accessible from the paywall, only Sign out. Leaving without deleting creates a floating account they can never remove without contacting support.
**Consequences:** CoachPaywall renders both "Sign out" and "Delete account" as separate actions at all times, regardless of subscription state. Two buttons, user decides. No conditional logic — simplest and least error-prone.

### Every role that owns a subscriptions row must explicitly delete it before auth delete
**Reason:** Both `subscriptions.solo_id → profiles.id` and `subscriptions.coach_id → profiles.id` are NO ACTION FKs. Any future role that owns a subscriptions row will hit the same issue.
**Consequences:** `delete-account` has explicit DELETE blocks for both coach and solo before the auth delete. Any new billing role added in future must follow the same pattern: cancel Stripe → delete DB row (with response checking) → then auth delete.

### Solo account deletion must explicitly delete the subscriptions row before auth delete
**Reason:** `subscriptions.solo_id` is a FK to `profiles.id` (NO ACTION). Deleting the auth user cascades to delete the profiles row, which Postgres rejects if the subscriptions row still references it.
**Consequences:** `delete-account` solo branch: cancel Stripe sub → explicitly DELETE subscriptions row (with response checking, throw on failure) → then proceed with the generic deletions loop and auth delete. Response checking is mandatory — silent failures produce confusing FK violations downstream.

### Every table used in edge function DELETEs/INSERTs needs explicit grants to service_role
**Reason:** Tables don't automatically have DELETE or INSERT granted to service_role even though service_role bypasses RLS. Missing grants return `42501 permission denied` which fails silently if response codes aren't checked.
**Applied grants so far:** `GRANT DELETE ON public.subscriptions TO service_role`, `GRANT SELECT, INSERT, UPDATE ON public.trial_ledger TO service_role`.
**Rule:** When adding a new table operation in an edge function, verify the grant exists. Test with response checking — never ignore DELETE/INSERT response codes.

### `GRANT DELETE ON public.subscriptions TO service_role` is required
**Reason:** The subscriptions table was created with only SELECT granted to authenticated/service_role. DELETE was never granted. Even though service_role bypasses RLS, it still needs explicit table-level DELETE permission.
**Consequences:** Without this grant, any service_role DELETE on subscriptions returns `42501 permission denied` silently if not response-checked. Grant applied in SQL editor. Any new table used in edge function DELETEs must have this grant verified.

### `delete-account` client offboarding ordering
**Reason:** When a coach deletes, `coach_clients` rows must be processed before they are deleted, and the coach's Stripe sub must be cancelled after `coach_clients` rows are gone.
**Consequences:** Order is: (1) fetch + process all clients (resume subs, flip roles, write offboard markers, send emails), (2) bulk DELETE all data rows including `coach_clients`, (3) cancel coach Stripe sub, (4) delete auth user. Stripe cancel goes last in the data deletion sequence so the resulting `customer.subscription.deleted` webhook finds no clients to re-offboard.

### `resumeSoloSubscription` is duplicated across three files (deferred extraction)
**Reason:** Extracting to `_shared/` mid-feature would require editing two live-billing functions as a side effect of shipping a new feature — bad change hygiene.
**Consequences:** Verbatim copies in `offboard-self`, `offboard-client`, `delete-account`. Flagged as tech debt: extract to `supabase/functions/_shared/resumeSoloSubscription.ts` in a dedicated refactor pass where all three are visible and testable together.

### `checkout.session.completed` fetches the real subscription object from Stripe
**Reason:** Inferring status from `payment_status === 'paid'` was unreliable for trial checkouts and wrote `active` when it should be `trialing`.
**Consequences:** The handler now reads true `status`, `trial_end`, `current_period_end`, and `price_id` directly from the Stripe subscription object. (Verified writing `trialing` correctly in live mode, June 6 2026.)

### Email sends are wrapped in non-throwing try/catch
**Reason:** A thrown email error inside a webhook handler triggers Stripe/webhook retry loops and can double-process events.
**Consequences:** All Resend calls are best-effort; a failed email never blocks the core transaction or causes a retry storm.

### Milestone email fires once per level
**Reason:** Avoid spamming a coach every time a client refreshes while at a milestone streak.
**Consequences:** `milestone-reached` fires only if `streakCount in MILESTONES AND last_milestone_streak < streakCount`, then updates `last_milestone_streak`. Banner shows only on a genuine `{ ok: true, milestone }` response, never on refresh.

---

## UI / UX

### No TypeScript
**Reason:** Speed of development and Jay is learning JS — types would add friction without payoff at this stage.
**Consequences:** Plain JSX throughout. No compile-time type safety; rely on tests and runtime checks.

### Inline styles + CSS variables, no Tailwind
**Reason:** Pragmatic for component-level styling without adding a build/utility dependency.
**Consequences:** Styling lives inline and in `index.css` CSS variables; shared `cardStyle` extracted to `utils/styles.js`.

### No emoji in AI-tool buttons; minimal emoji elsewhere
**Reason:** Professional aesthetic for the coach-facing product.
**Consequences:** Emoji removed from exercise types, empty states, barcode buttons, export, role picker. Kept only where they carry meaning: message reactions, checkmarks, streak milestones.

### Message thread scrolls, capped at 400px
**Reason:** Prevent the card from stretching indefinitely with a long thread.
**Consequences:** Thread is a 400px-max scroll area with a dark scrollbar; auto-scrolls to bottom on new messages.

### `SubscriptionManager.onChange` does a full `window.location.reload()`
**Reason:** The subscription prop is fetched once in App.jsx and goes stale after a cancel/resume; a reload is the simplest correct refresh.
**Consequences:** Inelegant but correct. A refetch-callback refactor (lifting the fetch out of App.jsx) is deferred technical debt.

### App nav is a solid sticky bar; page roots use `overflow-x: clip`, not `hidden` (Jun 9 2026)
**Reason:** A frosted (`backdrop-filter`) nav both bled scrolled content through the translucent bar and trapped the mobile menu's `position: fixed` backdrop against the 56px nav (the menu never dimmed the page). Separately, `overflow-x: hidden` on `html/body/#root` turns them into scroll containers, which **breaks `position: sticky`** — the nav scrolled away on mobile (the real cause of the "header overlaps the status bar" report).
**Consequences:** Nav background is solid `--color-surface` + a soft shadow (`.gnav`). Page roots use `overflow-x: clip` (clips horizontal overflow without creating a scroll container, so sticky keeps working). NavBar is responsive: desktop pill-tab bar; mobile (≤600px) hamburger → dropdown. **Rule: don't put `backdrop-filter` on a bar that contains a `fixed` overlay, and never use `overflow-x: hidden` on a sticky element's scroll ancestor — use `clip`.**

### Verify UI changes with the Playwright harness — don't ship blind (Jun 9 2026)
**Reason:** Several UI regressions (a wrapping nav that looked unintentional, and the sticky-nav bug) shipped because changes were reasoned about but never actually viewed. The sticky bug only appeared on a *scrolled* page.
**Consequences:** `scripts/shoot.mjs` / `shoot-all.mjs` (Playwright, devDeps) screenshot real pages via throwaway accounts (incl. coach/client via an injected subscription + client-token link). **Run `node scripts/shoot.mjs` and read `/tmp/shots/*.png` after any UI change before claiming it's done.** See architecture.md → Visual QA.

---

## Open Product Decisions (not yet resolved)

These are flagged in `features.md` and need a call before the relevant feature ships.

### Should clients see heatmap / rolling average on their own Dashboard?
**Current stance:** No (❌ in the tier matrix). Client self-analytics would overlap with Solo Premium and could undercut its value.
**Open because:** Defaulting to coach-side-only for clients until explicitly decided.

### Body measurements & progress photos for clients
**Current stance:** Gated to "coach enables" — the coach decides whether a client tracks these.
**Open because:** Not yet validated whether this should be client-default or coach-controlled.

### Progress photo timeline (when built) keyed to timestamps, not workouts
**Reason (provisional):** Users may upload progress photos without any associated training session.
**Consequences (provisional):** Timeline would be built on photo timestamps, independent of any workout ID. (Recorded now so the decision isn't relitigated when Tier 3 photos are built.)
