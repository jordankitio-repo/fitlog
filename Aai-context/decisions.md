
# FitLog — Decisions Log

> **Purpose:** The reasoning behind every major product and technical choice. When a future decision contradicts one here, add the new decision rather than editing the old one — the history of *why* matters.
>
> **Format:** Decision / Reason / Consequences. Grouped by area.
>
> **What does NOT belong here:** how things are wired (→ `architecture.md`), live status (→ `current-state.md`), feature backlog (→ `features.md`).

---

## Product Strategy

### Nutrition is the core product, not an add-on
**Reason:** Every competing platform (Trainerize, TrueCoach, Hevy) treats nutrition as an afterthought or a paid add-on and outsources it to MyFitnessPal. FitLog makes nutrition tracking, macro compliance, and body composition the core product.
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

### Trial clock continues during coaching (accepted v1 limitation)
**Reason:** Stripe has no true trial-clock pause. Building one is disproportionate effort for an edge case.
**Consequences:** If a solo user joins a coach mid-trial and leaves later, the trial may be over on return. `paused_for_coaching` is a local marker; offboarding clears it and the user returns to whatever status Stripe has reached. Documented and accepted; revisit only if it becomes a real complaint.

### Data is never deleted regardless of payment status
**Reason:** Trust and re-activation. A coach or solo user who lapses should not lose history.
**Consequences:** Access is restricted, not data. Canceled accounts keep all rows; resubscribing restores access to intact data.

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
