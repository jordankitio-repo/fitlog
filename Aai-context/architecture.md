# FitLog — System Architecture

> **Purpose:** Durable description of how the system is built — stack, data model, flows, and how each subsystem works. This is the stable layer. It changes only when the structure changes (new table, new edge function, new integration, new flow), NOT every session.
>
> **What does NOT belong here:** rationale ("why we chose X") → `decisions.md`. Live state (commit, bugs, priorities) → `current-state.md`. Feature backlog → `features.md`.

---

## Product Overview

FitLog is a web-based fitness coaching SaaS built specifically for the coach–client relationship — not a general fitness tracker. Coaches manage clients, set targets, view compliance data, send reports, and message clients. Clients log daily nutrition, weight, cardio, and steps and see their own progress.

**The pitch:** FitLog is the nutrition and body composition layer coaches use alongside whatever workout tool they already have.

**Differentiators (vs. Trainerize, TrueCoach, Hevy):**
1. Native nutrition tracking (not outsourced to MyFitnessPal)
2. Cardio + steps as coached data visible to coach in real time
3. Nutrition deviation / 7-day compliance rates per metric (calories, protein, cardio, steps)
4. Correlated body composition chart (weight + calorie % + cardio %)
5. Weight logging with time of day (morning vs evening matters for trend accuracy)
6. Web-first — no app download required for clients
7. Transparent flat pricing
8. AI-generated weekly coaching reports with macro + activity compliance data

*(Strategic reasoning behind these is in `decisions.md`.)*

---

## User Roles

| Role | Description |
|---|---|
| `solo` | Individual self-tracker. No coach. Uses Dashboard + Log pages only. May be free or Solo Premium. |
| `coach` | Manages clients. Sees CoachDashboard, can view any client's data via ClientView. Pays monthly. |
| `client` | Connected to a coach. Simplified Dashboard (My Progress). Coach sets targets. Always free. |

Role is set on first login via RolePicker. New users (including OAuth) see RolePicker if `profiles.role` is null. The `role` column has **no default** — see `decisions.md`.

---

## Tech Stack

### Frontend
- **React 19 + Vite** (JSX, no TypeScript)
- **react-router-dom** for routing
- **Chart.js** via react-chartjs-2 (Line, Bar, mixed Chart); `Filler` plugin registered in Dashboard.jsx and ClientView.jsx
- Styling: **inline styles + CSS variables in `index.css`** (no Tailwind)
- **Inter** font from Google Fonts; type scale via CSS vars (`--text-xl` … `--text-xs`)
- Deployed on **Vercel** (auto-deploy on push to `main`)

### Backend
- **Supabase** (Postgres + Auth + Edge Functions + Storage)
- Edge Functions: Deno runtime, deployed via Supabase CLI
- Email via **Resend**

### Infrastructure
- **GitHub:** https://github.com/jordankitio-repo/fitlog
- **Supabase project ID:** `mlqaurxefttbqsrllbyj` (East US)
- **Edge Function base URL:** `https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/`
- **Domain/CDN:** Namecheap → Vercel, SSL provisioned
- **Resend:** DKIM + SPF + DMARC verified; sender `noreply@tryfitlog.com`
- **pg_cron + pg_net:** enabled, weekly digest scheduled `0 13 * * 1`
- **CI/CD:** Vercel auto-deploy on push to `main`

---

## File Structure

```
src/
  pages/
    App.jsx           — root, session/profile gate, role picker gate, BILLING_ENABLED flag,
                        subscription fetch, CoachPaywall gate, public-route early returns
    Dashboard.jsx     — solo + client dashboard (stats, charts, milestone banner, rolling avg)
    Log.jsx           — daily logging (weight, nutrition, cardio, steps, copy-food)
    Profile.jsx       — account settings, security, data export, delete, billing card
    Login.jsx         — email/password + Google OAuth
    CoachDashboard.jsx — coach home, client list, compliance pills, invite, sort/ranking
    ClientView.jsx    — coach view of one client (charts, logs, targets, heatmap, reports)
    RolePicker.jsx    — first-login role selection
    Join.jsx          — client invite acceptance flow
    ResetPassword.jsx — password reset handler
    Landing.jsx       — public landing page
    Terms.jsx         — Terms of Service (public)
    Privacy.jsx       — Privacy Policy (public)
    BillingSuccess.jsx — Stripe checkout success page (/billing/success)
  components/
    NavBar.jsx, Button.jsx, StatCard.jsx, Skeleton.jsx, Toast.jsx, EmptyState.jsx,
    BarcodeScanner.jsx, SectionHeader.jsx, CoachPaywall.jsx, FeedbackButton.jsx,
    ComplianceHeatmap.jsx, SoloUpgrade.jsx, SubscriptionManager.jsx
  utils/
    passwordValidation.js, styles.js (cardStyle), lockState.js (resolveLockState),
    dateHelpers.js, inviteValidation.js (getInviteBlockReason)
  supabase.js         — Supabase client init
  index.css           — CSS variables, global styles, dark scrollbar
supabase/
  functions/          — see Edge Functions table below
```

---

## Database Schema

### Tables

**profiles**
- `id` uuid PK (references auth.users), `email`, `full_name`, `role` (null|'solo'|'coach'|'client' — NO DEFAULT), `last_milestone_streak` int default 0, `created_at`

**nutrition_log**
- `id`, `user_id`, `food`, `calories`, `protein`, `carbs`, `fat`, `serving_size`, `serving_unit`, `logged_date`, `created_at`

**weight_log**
- `id`, `user_id`, `weight`, `unit` ('lbs'|'kg'), `logged_date`, `weighed_at` (time, HH:MM:SS 24hr), `created_at`
- No unique constraint — supports multiple weigh-ins per day; reads take most recent via `order('created_at', desc).limit(1)`

**cardio_log**
- `id`, `user_id`, `exercise_type`, `duration`, `calories_burned`, `avg_heart_rate`, `logged_date`, `created_at`

**steps_log**
- `id`, `user_id`, `steps`, `distance`, `logged_date`, `created_at`
- Unique: `(user_id, logged_date)` (`steps_log_user_date_key`); `saveSteps` upserts on `user_id,logged_date`

**targets**
- `id`, `user_id` (unique), `calories`, `protein`, `carbs`, `fat`, `cardio_minutes`, `steps`, `weight_goal`, `weight_goal_unit`, `updated_at`

**coach_clients**
- `id`, `coach_id`, `client_id`, `status` ('pending'|'active'), `hide_calories` bool default false, `last_nudged_at` timestamptz, `created_at`

**messages** (unified — replaced old coach_messages + client_messages)
- `id`, `coach_id`, `client_id`, `sender_id`, `content`, `reaction`, `read_at`, `created_at`
- RLS: `coach_id = auth.uid() OR client_id = auth.uid()` (WITH CHECK same)
- GRANT: SELECT, INSERT, UPDATE, DELETE TO authenticated

**reports**
- `id`, `coach_id`, `client_id`, `content`, `week_of` (date, Sunday-based), `read_at`, `archived`, `created_at`

**check_ins**
- `id`, `client_id`, `coach_id`, `week_of` (date), `adherence_rating`, `energy_level`, `obstacles`, `notes`, `created_at`
- Unique: `(client_id, week_of)`

**coach_notes**
- `id`, `coach_id`, `client_id`, `content` (timestamped append log, prepended each save), `updated_at`
- Unique: `(coach_id, client_id)`

**invite_tokens**
- `id`, `coach_id`, `email`, `token`, `used`, `created_at`

**subscriptions**
- `id`, `coach_id` → profiles, `solo_id` → profiles, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `status` ('trialing'|'active'|'past_due'|'canceled'|'incomplete'), `trial_end`, `current_period_end`, `paused_for_coaching` bool default false, `cancel_at_period_end` bool default false, `created_at`
- Unique: `(coach_id)` (`subscriptions_coach_id_unique`)
- RLS: SELECT to authenticated where `coach_id = auth.uid()`; separate SELECT policy where `solo_id = auth.uid()`. INSERT/UPDATE to service_role.

### Triggers
- `on_auth_user_created` (on `auth.users`) → `handle_new_user()` — inserts `id` + `email` into profiles. No default role. (Verified present in live DB, June 6 2026.)

### RLS
All tables have RLS enabled. Policies are user-scoped (`user_id = auth.uid()`) or coach/client-relationship-scoped.

---

## Authentication

- Email/password via Supabase Auth
- Google OAuth via Supabase + Google Cloud Console
  - Redirect URI: `https://mlqaurxefttbqsrllbyj.supabase.co/auth/v1/callback`
  - `redirectTo: window.location.origin` (no trailing slash)
  - Allowlist includes localhost:5173 variants + production URL + `/reset-password`
  - **Currently in testing mode** — only manually-added test users can sign in via Google. Needs Google verification before public launch.
- New users with `role = null` → RolePicker before main app
- Password policy: min 8 chars, lower + upper + digit + symbol, enforced client-side (Login.jsx signup, Profile.jsx change) and in Supabase. Profile.jsx requires current password to change.

---

## Billing Architecture

### Model
- `coach` — pays monthly ($19 founding locked / $29 standard), 30-day trial
- `client` — always free, coach pays
- `solo` — free tier, or Solo Premium (~$7.99/mo)

### Access control
- `BILLING_ENABLED = true` in `App.jsx` — gates coaches
- `PAID_STATUSES = ['trialing', 'active', 'past_due']` — shared allow-list used everywhere for access checks
- `canceled` → no access, upgrade prompt shown, data preserved
- `cancel_at_period_end` flag → access continues until period end
- `paused_for_coaching` (local flag, not a Stripe status) → solo sub paused while user is a coached client

### Subscription status reference
- `incomplete` — checkout started, not confirmed
- `trialing` — in free trial, grants access
- `active` — paying, grants access
- `past_due` — payment failed, still grants access (Stripe retries ~2 weeks)
- `canceled` — ended, no access

### Webhook architecture
- `stripe-webhook` verifies Stripe signature (HMAC-SHA256), deployed `--no-verify-jwt` (Stripe sends no JWT)
- Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- On `checkout.session.completed`: fetches the real subscription object from Stripe API to read true `status`, `trial_end`, `current_period_end`, `price_id` (this is the fix for the trialing-vs-active mapping)
- On `deleted`: offboards coach's clients; resets `cancel_at_period_end` to false
- `customer.subscription.updated`: persists `cancel_at_period_end`

### Checkout / cancel flow
- `create-checkout-session`: verifies auth, branches coach vs solo, creates/reuses Stripe customer, 30-day trial, upserts subscriptions row (`Prefer: resolution=merge-duplicates`), blocks `canceled` users from re-trialing
- `cancel-subscription` (`{ action: 'cancel' | 'resume' }`): looks up sub by **current role** (coach_id if coach, solo_id if solo — not an OR query), sets Stripe `cancel_at_period_end` true/false, patches local flag immediately, sends confirmation email on cancel only
- `SubscriptionManager.jsx`: cancel → confirm dialog → cancel; shows "plan ends on [date]" + Resume when `cancel_at_period_end` true. `onChange` does `window.location.reload()` (subscription prop fetched once in App.jsx, goes stale after cancel)

### Solo pause/resume
- `pause-solo-subscription`: when a solo user joins a coach. Active subs → Stripe `pause_collection`; local marker set **only if** Stripe call succeeds. Trialing subs → marker only (no Stripe call).
- Resume: shared `resumeSoloSubscription` helper in `offboard-client` and `offboard-self`. Sends Stripe `pause_collection=''` to resume; clears `paused_for_coaching` only if Stripe resume succeeded.
- `Join.jsx` only sets `profiles.role = client` + creates `coach_clients` row — never deletes the subscription row, so resume works automatically once pause clears.

### Live mode
- Founding $19/mo: `price_1TemKxAYmISHFVlMiNx7SWQy`
- Standard $29/mo: `price_1TemKwAYmISHFVlMnz5NENY8`
- Live keys in Vercel (`pk_live_…`) + Supabase secrets (`sk_live_…`, `whsec_live_…`)
- Live webhook → `https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/stripe-webhook`

---

## Coach–Client System

### Invite flow
1. Coach enters client email in CoachDashboard → sends invite (creates `invite_tokens` row, Resend email)
2. Client clicks link → `/join?token=xxx`
3. Client signs up or logs in → `Join.jsx` sets `profiles.role = client`, creates `coach_clients` row
4. Existing users see contextual "you're already a FitLog user" messaging; existing data preserved

### Relationship
- Coach sets targets, sends messages, generates reports, writes private notes, reads check-ins, nudges inactive clients
- `hide_calories` toggle (per client) hides calorie StatCard/progress/chart/entries on client side; logging form still shows calories
- Compliance pills per client per metric (CoachDashboard); heatmap + analytics in ClientView

### Offboard / leave / resume
- Coach offboards (`offboard-client`) or client leaves (`offboard-self`) → client returns to solo, resume helper restores any paused Solo Premium sub
- Coach subscription canceled → clients offboarded at period end (via `deleted` webhook)
- Offboarded clients reconnect only via a new invite (re-accept)

### Realtime
- ClientView subscribes to `check_ins` changes via Supabase Realtime channel → auto-updates when client submits (no manual refresh)

---

## AI Systems

All AI features run as Supabase Edge Functions calling the model provider, returning generated text to the frontend for review.

| Function | Purpose | Visibility |
|---|---|---|
| `weekly-report` | Generates AI weekly coaching report from 7-day data + check-in. Edge fn prepends a deterministic week-range header. | Coach generates → edits → sends to client |
| `call-prep` | Generates AI call briefing for a coach | Private to coach |
| `nutrition-coach` | AI nutrition advice. Gated: auth + role + solo-subscription check. | Coach + Solo Premium |

---

## Notifications & Email

All email via Resend (`noreply@tryfitlog.com`). Email sends are wrapped in non-throwing try/catch (see `decisions.md`).

| Function | Trigger | Recipient |
|---|---|---|
| `notify-report` | Coach sends a report | Client |
| `notify-checkin` | Client submits weekly check-in | Coach |
| `nudge-client` | Coach nudges inactive client (48hr cooldown) | Client |
| `milestone-reached` | Client hits a streak milestone | Coach |
| `weekly-digest` | Monday 8am UTC via pg_cron (`0 13 * * 1`) | Each coach (all-client compliance summary) |

In-app: nudge banner (client Dashboard, dismissible per nudge timestamp); milestone celebration banner.

---

## Analytics Engine

How each metric is computed and where it lives.

### Week calculation (foundational)
All week logic uses **Sunday as week start** (`getDay()` returns 0 for Sunday). `getCurrentWeekSunday()` builds the date from local Date components to avoid UTC shift. Used by reports, check-ins, compliance. *(Rationale in `decisions.md`.)*

### Weekly report date range
Sunday→Saturday (7 days). In ClientView: `start = addDays(currentWeekStart, -7)`, `end = addDays(currentWeekStart, -1)`. Explicit `weekRange` label passed to the edge function.

### 7-day compliance pills (CoachDashboard)
Per client per metric (calories, protein, cardio, steps): count days in last 7 where logged ≥ 90% of target. Color: green ≥5, yellow 3–4, red <3. Pills suppress when `logged === 0`. Opacity encodes compliance level; low compliance gets a subtle colored fill.

### Compliance heatmap (ComplianceHeatmap.jsx — ClientView)
13-week (91-day) Sunday-first calendar grid. `fetchHeatmapData()` aggregates calories per date over a 97-day window. Color: green ≥90% calorie target, yellow 60–89%, red <60%, gray no log. Uses `toLocalDateString` throughout. Cell 18px, gap 2px, `overflowX:auto`.

### Rolling 7-day weight average
`computeRollingAverage(data, window=7)` in Dashboard.jsx + ClientView.jsx. Second dataset on weight chart: dashed green line, no points.

### Weekday vs weekend compliance split
`fetchConsistency` range = 90 days. Classification uses local Date object directly (avoids UTC weekday shift). State: `weekdayLogged/weekendLogged/weekdayTotal/weekendTotal`. Two stat cards in ClientView.

### Best week analysis
Computed inside `fetchConsistency` (no new fetch). Scans all 13 Sun–Sat windows in last 90 days; highest logged-day count, ties broken by recency. State: `bestWeekCount/bestWeekStart/bestWeekEnd`.

### Client comparison/ranking (CoachDashboard)
`scoreClient(s)` sums `value` across all `hasData` compliance items. `sortBy` modes: Compliance (score desc, recency tiebreak), Last logged (daysSinceLog asc), Check-in (submitted first). No-stats clients score -1, sink to bottom. Sort controls render only when `clients.length > 1`.

### Milestone celebrations
Milestones: 7, 14, 30, 60, 90 days. `milestone-reached` edge fn guard: fires only if `streakCount in MILESTONES AND last_milestone_streak < streakCount`, then updates `last_milestone_streak` (fires once per level, never duplicates). Dashboard `useEffect` watches `streak`, calls fn on milestone. Banner shows only when backend returns `{ ok: true, milestone }`. Solo users: in-app banner only; clients with a coach: banner + coach email.

---

## Display Helpers

### Weight time display
`weighed_at` stored as PostgreSQL `time` (HH:MM:SS 24hr). `formatTime()` converts to 12hr AM/PM for display (Log.jsx, ClientView.jsx).

### Copy food from another day (Log.jsx)
Date picker → selectable food entry list with checkboxes → "Add X items to today". Covers repeat single food, repeat whole day, copy any subset. **Nutrition only** — weight/steps/cardio excluded (see `decisions.md`).

### Private notes (coach)
Single text field per coach-client pair, timestamped prepend on each save. Read-only by default; "Edit history" enables editing.

---

## Edge Functions (complete)

| Function | Auth | Purpose |
|---|---|---|
| `delete-account` | user | Deletes all user data rows then auth user (service role) |
| `nutrition-coach` | user + role + solo gate | AI nutrition advice |
| `weekly-report` | user | AI weekly coaching report |
| `notify-report` | user | Email client when report sent |
| `notify-checkin` | user | Email coach on check-in |
| `call-prep` | user | AI call briefing (coach) |
| `nudge-client` | coach | Nudge inactive client, 48hr cooldown |
| `create-checkout-session` | user | Stripe checkout, 30-day trial, coach+solo branching |
| `stripe-webhook` | `--no-verify-jwt` (Stripe signature) | Handle Stripe events, update subscriptions, offboard on cancel |
| `pause-solo-subscription` | `--no-verify-jwt`, internal | Pause solo sub on joining coach |
| `cancel-subscription` | `--no-verify-jwt`, internal | Cancel/resume at period end + email |
| `offboard-client` | coach | Remove client, resume solo sub, email |
| `offboard-self` | client | Client leaves coach, resume solo sub |
| `milestone-reached` | `--no-verify-jwt`, internal | Streak milestone detection + coach email |
| `weekly-digest` | anon (cron) | Monday coach digest |

---

## Development Environment

- Local: Mac (arm64), Node v22, dev server `localhost:5173`
- LAN access: `server: { host: true }` in `vite.config.js` → `192.168.1.x:5173`
- Deploy: `git push` to `main` → Vercel auto-deploys
- Edge functions: `supabase functions deploy <name>` (Docker not required)
- SQL migrations: run directly in Supabase SQL Editor

```bash
npm run dev          # local dev server
npm run build        # production build check
git add . && git commit -m "..." && git push   # deploy
supabase functions deploy <name>               # deploy edge function
```

---

## Testing

48 unit tests passing across 4 files:

| File | Tests |
|---|---|
| `lockState.test.js` | 15 |
| `passwordValidation.test.js` | 7 |
| `dateHelpers.test.js` | 19 |
| `inviteValidation.test.js` | 7 |
