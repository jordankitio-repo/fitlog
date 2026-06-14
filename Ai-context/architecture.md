# Gardnr — System Architecture

> **Purpose:** Durable description of how the system is built — stack, data model, flows, and how each subsystem works. This is the stable layer. It changes only when the structure changes (new table, new edge function, new integration, new flow), NOT every session.
>
> **What does NOT belong here:** rationale ("why we chose X") → `decisions.md`. Live state (commit, bugs, priorities) → `current-state.md`. Feature backlog → `features.md`.

---

## Product Overview

Gardnr is a web-based fitness coaching SaaS built specifically for the coach–client relationship — not a general fitness tracker. Coaches manage clients, set targets, view compliance data, send reports, and message clients. Clients log daily nutrition, weight, cardio, and steps and see their own progress.

**The pitch:** Gardnr is the nutrition and body composition layer coaches use alongside whatever workout tool they already have. Tagline: "Coaches don't build physiques. They create conditions for growth."

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
- **Theming:** dark default + light mode via tokenized CSS-variable ramp. `utils/theme.js` owns the `gardnr-theme` preference (`auto`|`light`|`dark`); resolved value on `<html data-theme>`; `:root[data-theme="light"]` flips the ramp; pre-paint inline script in `index.html`. Chart chrome uses theme-agnostic literals (`utils/chartTheme.js`) because canvas can't read CSS vars. (Full rationale in `decisions.md` → Design & UX.)
- **Inter** font from Google Fonts; type scale via CSS vars (`--text-xl` … `--text-xs`)
- **PWA:** `vite-plugin-pwa` (`registerType:'prompt'`, `injectRegister:false`) + service worker; `PWAUpdatePrompt` surfaces updates; build stamp (`__BUILD_TIME__` via Vite `define`) shown in Profile for cache diagnosis. Scrollbar chrome hidden in the installed app via `@media (display-mode: standalone)` (`index.css`).
- Deployed on **Vercel** (project `gardnr`; `npx vercel --prod --project gardnr --yes` — direct deploy reliable, push hook intermittently no-ops)

### Backend
- **Supabase** (Postgres + Auth + Edge Functions + Storage)
- Edge Functions: Deno runtime, deployed via Supabase CLI
- Email via **Resend**

### Infrastructure
- **GitHub:** https://github.com/jordankitio-repo/fitlog
- **Supabase project ID:** `mlqaurxefttbqsrllbyj` (East US)
- **Edge Function base URL:** `https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/`
- **Domain/CDN:** Namecheap → Vercel, SSL provisioned. Primary: `gardnr.fit`. `tryfitlog.com` 308-redirects to `www.gardnr.fit` until expiry.
- **Resend:** DKIM + SPF + DMARC verified on `gardnr.fit`; sender `noreply@gardnr.fit`. DKIM on `resend._domainkey.gardnr.fit`; SPF (MX + TXT) on `send.gardnr.fit` — Resend's standard subdomain layout. Root domain carries no SPF record by design.
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
    Landing.jsx       — public landing page (Gardnr responsive rewrite; lp- namespace; DM Sans; landing.css co-located)
    Terms.jsx         — Terms of Service (public)
    Privacy.jsx       — Privacy Policy (public)
    BillingSuccess.jsx — Stripe checkout success page (/billing/success)
  components/
    NavBar.jsx — responsive: solid sticky bar with the logo-icon mark + green-dim "pill" active tabs (desktop); brand + hamburger → animated dropdown with per-item icons + green left-accent active item (mobile, ≤600px via a `useMediaQuery` hook). Solid (not frosted) on purpose — see decisions.md.
    Button.jsx, StatCard.jsx, Skeleton.jsx, Toast.jsx, EmptyState.jsx,
    PasswordInput.jsx — password field with an eye show/hide toggle; used by all password fields.
    BarcodeScanner.jsx, SectionHeader.jsx, FeedbackButton.jsx,
    CoachPaywall.jsx — gate for coaches without active subscription. Checks trial_ledger on mount via check-trial-eligibility; shows billing warning + confirm modal if trial used. Always exposes both "Sign out" and "Delete account" — users who abandon at the paywall can self-serve exit without contacting support.
    ComplianceHeatmap.jsx, SoloUpgrade.jsx, SubscriptionManager.jsx
    NotificationCenter.jsx — bell + dropdown (events + persistent alerts); ThemeToggle.jsx — Auto/Light/Dark segmented control (Profile → Appearance)
    ChatBubble.jsx / ClientChat.jsx — bottom-right messaging; PWAUpdatePrompt.jsx — service-worker update toast
    InfoTip.jsx — portaled, viewport-clamped "i" tooltip; ChartColorToggle.jsx — per-chart plain-colors switch
    ReportBody.jsx — collapses a coach report to a faded preview; tap opens the full report in a blurred-backdrop modal (Dashboard active + archived)
  utils/
    passwordValidation.js, styles.js (cardStyle), lockState.js (resolveLockState),
    dateHelpers.js, inviteValidation.js (getInviteBlockReason)
    theme.js (day/night), chartTheme.js (CHART literals for canvas), notifyRefresh.js (bell refresh event)
    clientStats.js (computeClientStats/computeClientAlerts — shared by bell + CoachDashboard)
    attentionLevel.js (coach triage), nudgeReason.js (nudge reason), metricBarChart.js, usePlainCharts.js
  supabase.js         — Supabase client init
  index.css           — CSS variables, global styles, dark scrollbar.
                        NOTE: `html, body, #root` use `overflow-x: clip` (NOT `hidden`) —
                        `hidden` establishes a scroll container and breaks `position: sticky`
                        on the nav (it scrolls away instead of pinning).
supabase/
  functions/          — see Edge Functions table below
```

---

## Database Schema

### Tables

**profiles**
- `id` uuid PK (references auth.users), `email`, `full_name`, `role` (null|'solo'|'coach'|'client' — NO DEFAULT), `last_milestone_streak` int default 0, `created_at`
- `layout` jsonb not null default `'{}'` (migration `20260611120000`) — per-user dashboard card order, keyed by surface (`clientView`, `dashboard`); written by the drag-to-reorder feature, read with a `mergeOrder(saved, defaults)` fallback so new/un-ordered cards still appear.

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

**invitations**
- `id`, `coach_id`, `email`, `token`, `used`, `created_at`

**subscriptions**
- `id`, `coach_id` → profiles, `solo_id` → profiles, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `status` ('trialing'|'active'|'past_due'|'canceled'|'incomplete'), `trial_end`, `current_period_end`, `paused_for_coaching` bool default false, `cancel_at_period_end` bool default false, `created_at`
- Unique: `(coach_id)` (`subscriptions_coach_id_unique`)
- RLS: SELECT to authenticated where `coach_id = auth.uid()`; separate SELECT policy where `solo_id = auth.uid()`. INSERT/UPDATE to service_role.

### Triggers
- `on_auth_user_created` (on `auth.users`) → `handle_new_user()` — inserts `id` + `email` into profiles. No default role. (Verified present in live DB, June 6 2026.)

### RLS
All tables have RLS **enabled** (verified table-by-table via `pg_class.relrowsecurity`, Jun 8 2026). Policies are user-scoped (`user_id = auth.uid()`) or coach/client-relationship-scoped.

> **History / gotcha (Jun 8 2026):** `profiles` had RLS *disabled* (`relrowsecurity = false`) — its SELECT/INSERT/UPDATE policies existed but were silently ignored, so any authenticated user could read/enumerate every profile (email, name, role). RLS being defined-but-not-enabled produces no error and looks correct in the policy list; the only reliable check is `relrowsecurity` itself (or a live cross-account read). Fixed in migration `20260608134000` (`alter table profiles enable row level security`). Lesson: enabling a policy ≠ enabling RLS on the table.

`profiles` SELECT policy (`profiles_select_self_or_related`): own row OR an **active** coach↔client counterpart, via the `is_profile_related(target uuid)` SECURITY DEFINER helper (the SECURITY DEFINER bypass avoids profiles↔coach_clients policy recursion). INSERT/UPDATE are own-row only (`id = auth.uid()`); deletes go through the service-role `delete-account` function. Migrations: `20260608130000`/`131000` (policies), `134000` (enable RLS).

---

## Authentication

- Email/password via Supabase Auth
- Google OAuth via Supabase + Google Cloud Console
  - Redirect URI: `https://mlqaurxefttbqsrllbyj.supabase.co/auth/v1/callback`
  - `redirectTo: window.location.origin` (no trailing slash)
  - Allowlist includes localhost:5173 variants + production URL + `/reset-password`
  - **Currently in testing mode** — only manually-added test users can sign in via Google. Needs Google verification before public launch.
- New users with `role = null` → RolePicker before main app
- Password policy: min 8 chars, lower + upper + digit + symbol, via `getPasswordValidationError` — enforced client-side on signup (Login.jsx), change (Profile.jsx), and reset (ResetPassword.jsx, aligned Jun 8 2026; previously a weaker 6-char rule) and in Supabase. Profile.jsx requires current password to change.

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
- `stripe-webhook` verifies Stripe signature (HMAC-SHA256), deployed `--no-verify-jwt` (Stripe sends no JWT). `verify_jwt = false` is set permanently in `supabase/config.toml` — this persists through every redeploy. Same applies to `pause-solo-subscription`, `cancel-subscription`, `milestone-reached`, `check-trial-eligibility`. **Rule: any function that receives requests without a Supabase JWT must have `verify_jwt = false` in config.toml, not just the deploy flag.**
- Signature hardening (Jun 8 2026): rejects signatures whose `t=` timestamp is outside a 300s window (replay protection) and compares the HMAC in length-constant time.
- On `customer.subscription.deleted`: guard added — if `paused_for_coaching = true`, skip the update entirely (coaching-pause cancel, not real churn). Otherwise offboards coach's clients.
- Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- On `checkout.session.completed`: fetches the real subscription object from Stripe API to read true `status`, `trial_end`, `current_period_end`, `price_id` (this is the fix for the trialing-vs-active mapping)
- On `deleted`: offboards coach's clients; resets `cancel_at_period_end` to false
- `customer.subscription.updated`: persists `cancel_at_period_end`

### Checkout / cancel flow
- `create-checkout-session`: verifies auth, branches coach vs solo, creates/reuses Stripe customer. Checks `trial_ledger` (SHA-256 peppered email hash) — omits `trial_period_days` if product flag already true; writes ledger entry at checkout start. 30-day coach trial / 14-day solo trial. Upserts subscriptions row (`Prefer: resolution=merge-duplicates`).
- `check-trial-eligibility`: returns `{ coach_trial_used, solo_trial_used }` for the authenticated caller. Called by `CoachPaywall` on mount to show billing warning before redirecting to Stripe.
- Trial ledger: `trial_ledger` table keyed by `email_hash` (SHA-256 of `EMAIL_HASH_PEPPER:email`). Never deleted with the account — survives for fraud prevention. `GRANT SELECT, INSERT, UPDATE TO service_role` required.
- `cancel-subscription` (`{ action: 'cancel' | 'resume' }`): looks up sub by **current role** (coach_id if coach, solo_id if solo — not an OR query), sets Stripe `cancel_at_period_end` true/false, patches local flag immediately, sends confirmation email on cancel only
- `SubscriptionManager.jsx`: cancel → confirm dialog → cancel; shows "plan ends on [date]" + Resume when `cancel_at_period_end` true. `onChange` does `window.location.reload()` (subscription prop fetched once in App.jsx, goes stale after cancel)

### Solo pause/resume
- `pause-solo-subscription`: when a solo user joins a coach. Active subs → Stripe `pause_collection` (write DB guard first, then Stripe call — ordering is critical: webhook reads `paused_for_coaching` before acting on deletion events). Trialing subs → GET trial_end from Stripe, write DB (`paused_for_coaching=true`, `paused_trial_days_remaining=N`), then cancel Stripe sub (no charge). Rollback DB write if Stripe cancel fails.
- Resume: `resumeSoloSubscription` helper (duplicated in `offboard-client`, `offboard-self`, `delete-account` — deferred extraction to `_shared/`). Trialing path: recreates Stripe sub via API with `trial_period_days = paused_trial_days_remaining` + customer's default PM. Active path: clears `pause_collection`. Clears `paused_for_coaching` + `paused_trial_days_remaining` only on success.
- `Join.jsx` only sets `profiles.role = client` + creates `coach_clients` row — never deletes the subscription row, so resume works automatically once pause clears.

### Account deletion
- `delete-account`: role-aware. **Coach**: processes all clients first (resume paused subs, flip roles, write offboard markers, send emails), then bulk-deletes data rows, then cancels Stripe sub + **explicitly deletes `subscriptions?coach_id=eq.uid`** (FK: NO ACTION), then deletes auth user. **Solo/client**: cancels Stripe sub + **explicitly deletes `subscriptions?solo_id=eq.uid`** (FK: NO ACTION), fetches coach info if `client` role (before bulk deletions destroy `coach_clients`), then bulk-deletes data rows, then auth delete, then sends emails best-effort: client confirmation always; coach notification if active coach was found.
- **Rule:** Both `subscriptions.coach_id → profiles.id` and `subscriptions.solo_id → profiles.id` are NO ACTION FKs. The subscriptions row must be explicitly deleted before auth delete or Postgres rejects the cascade. Response checking is mandatory — silent failures show as FK violations downstream. Any future billing role must follow the same pattern.
- Offboard marker written to `profiles.offboarded_at` + `profiles.offboard_reason` — survives coach row deletion. Reason values: `coach_offboarded` (offboard-client), `coach_deleted` (delete-account coach branch). Self-leave writes no marker.

### Live mode
- Founding $19/mo: `price_1TemKxAYmISHFVlMiNx7SWQy`
- Standard $29/mo: `price_1TemKwAYmISHFVlMnz5NENY8`
- Live keys in Vercel (`pk_live_…`) + Supabase secrets (`sk_live_…`, `whsec_live_…`)
- Live webhook → `https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/stripe-webhook`

---

## Coach–Client System

### Invite flow
1. Coach enters client email in CoachDashboard → sends invite (creates `invitations` row, Resend email)
2. Client clicks link → `/join?token=xxx`
3. Client signs up or logs in → `Join.jsx` sets `profiles.role = client`, creates `coach_clients` row
4. Existing users see contextual "you're already a Gardnr user" messaging; existing data preserved

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

All email via Resend (`noreply@gardnr.fit`). Email sends are wrapped in non-throwing try/catch (see `decisions.md`).

| Function | Trigger | Recipient |
|---|---|---|
| `notify-report` | Coach sends a report | Client |
| `notify-checkin` | Client submits weekly check-in | Coach |
| `nudge-client` | Coach nudges inactive client (48hr cooldown) | Client |
| `milestone-reached` | Client hits a streak milestone | Coach |
| `weekly-digest` | Monday 8am UTC via pg_cron (`0 13 * * 1`) | Each coach (all-client compliance summary) |
| `delete-account` (inline) | Client or solo user deletes account | Client (confirmation) |
| `delete-account` (inline) | Client with active coach deletes account | Coach (notification) |

In-app: nudge banner (client Dashboard, dismissible per nudge timestamp); milestone celebration banner.

### Notification center (`NotificationCenter.jsx`, in NavBar)
A bell + dropdown, all **derived from existing tables — no notifications schema**. Carries two kinds of entry (model rationale in `decisions.md` → Design & UX):
- **Recent (events)** — one-off: new check-in / client message (coach), new report / coach message (client). Tracked by last-seen timestamp (`gardnr-notif-seen`), drop off once seen. Click deep-links via `?focus=` (`reports`/`chat`/`checkIn`/`checkin`) consumed by Dashboard/ClientView section-scroll effects + `ChatBubble`.
- **Needs attention (alerts)** — ongoing conditions that persist until they clear. Coach: per off-track client via `attentionLevel` (`utils/clientStats.js` → `computeClientStats`). Client: own action-items via `computeClientAlerts` (lock / coach-unlock / check-in due, Thu+ / coach-nudge until logged today). Badge counts *new* alerts + unseen events, clears on open; seen alert ids in `gardnr-notif-seen-alerts`.
- **Freshness:** recomputes on mount, tab-refocus, and a `gardnr-notif-refresh` window event (`utils/notifyRefresh.js`) fired by nutrition saves/edits/deletes + check-in submit, so a same-page action clears the alert it resolves.
- **`utils/clientStats.js`** is the single source of truth for per-client facts (days-since-log, this-week check-in, 7-day compliance, lock state), shared by the bell and `CoachDashboard` so they can't drift.

---

## Analytics Engine

How each metric is computed and where it lives.

### Week calculation (foundational)
All week logic uses **Sunday as week start** (`getDay()` returns 0 for Sunday). `getCurrentWeekSunday()` builds the date from local Date components to avoid UTC shift. Used by reports, check-ins, compliance. *(Rationale in `decisions.md`.)*

### Weekly report date range
Sunday→Saturday (7 days). In ClientView: `start = addDays(currentWeekStart, -7)`, `end = addDays(currentWeekStart, -1)`. Explicit `weekRange` label passed to the edge function.

### 7-day compliance pills (CoachDashboard)
Per client per metric (calories, protein, cardio, steps): count days in last 7 where logged ≥ 90% of target. Color: green ≥5, yellow 3–4, red <3. Pills suppress when `logged === 0`. Opacity encodes compliance level; low compliance gets a subtle colored fill.

### Compliance heatmap (ComplianceHeatmap.jsx — ClientView + Dashboard)
13-week (91-day) Sunday-first calendar grid. Coach-side: `fetchHeatmapData()` aggregates calories per date over a 97-day window. Solo Dashboard: same `logsByDate` shape built inside `fetchNutritionAnalytics` (see "Solo Dashboard self-analytics" below). Color: green ≥90% calorie target, yellow 60–89%, red <60%, gray no log. Uses `toLocalDateString` throughout. Cell 18px, gap 2px, `overflowX:auto`.

### Rolling 7-day weight average
`computeRollingAverage(data, window=7)` in Dashboard.jsx + ClientView.jsx. Second dataset on weight chart: dashed green line, no points.

### Weekday vs weekend compliance split
`fetchConsistency` range = 90 days. Classification uses local Date object directly (avoids UTC weekday shift). State: `weekdayLogged/weekendLogged/weekdayTotal/weekendTotal`. Two stat cards in ClientView.

### Best week analysis
Computed inside `fetchConsistency` (no new fetch). Scans all 13 Sun–Sat windows in last 90 days; highest logged-day count, ties broken by recency. State: `bestWeekCount/bestWeekStart/bestWeekEnd`.

### Solo Dashboard self-analytics (Premium-gated)
Weekday/weekend split, best week, and the heatmap also render on the solo's own Dashboard (they previously existed coach-side only). One `fetchNutritionAnalytics()` does a single 97-day `nutrition_log` pull and derives all three (heatmap `logsByDate`, best week, 30-day weekday/weekend counts) instead of three queries. All three sit inside one "Logging consistency" card gated on `hasSoloPremium`: Premium sees the data, free sees a single `SoloUpgrade` CTA. Scoped to `role !== 'client'` (mirrors the rolling-weight-average gate). Descriptive-only — see decisions.md "Solo self-analytics stay descriptive."

### Client comparison/ranking (CoachDashboard)
`scoreClient(s)` sums `value` across all `hasData` compliance items. `sortBy` modes: Compliance (score desc, recency tiebreak), Last logged (daysSinceLog asc), Check-in (submitted first). No-stats clients score -1, sink to bottom. Sort controls render only when `clients.length > 1`.

### Milestone celebrations
Milestones: 7, 14, 30, 60, 90 days. `milestone-reached` edge fn guard: fires only if `streakCount in MILESTONES AND last_milestone_streak < streakCount`, then updates `last_milestone_streak` (fires once per level, never duplicates). Dashboard `useEffect` watches `streak` and calls the fn for both `client` and `solo` roles (coaches don't log, so they never trigger it). Banner shows only when backend returns `{ ok: true, milestone }`. The fn emails a coach only when an active relationship exists, so solo users (no coach) get the in-app banner with no email; clients with a coach get banner + coach email.

---

## Display Helpers

### Weight time display
`weighed_at` stored as PostgreSQL `time` (HH:MM:SS 24hr). `formatTime()` converts to 12hr AM/PM for display (Log.jsx, ClientView.jsx).

### Copy food from another day (Log.jsx)
Date picker → selectable food entry list with checkboxes → "Add X items to today". Covers repeat single food, repeat whole day, copy any subset. **Nutrition only** — weight/steps/cardio excluded (see `decisions.md`).

### Food search (Log.jsx + `food-search`)
The "Food name" field is a 350ms-debounced search (stale-response guard via a seq ref) → results dropdown → selecting prefills the form through the **same per-100g path barcode uses** (`baseNutrients` + serving-scaling effect). Backed by USDA FDC. FDC energy lives under nutrient number `208` (SR Legacy/FNDDS) or `957`/`958` Atwater (Foundation) — resolved in priority order, KCAL-only, values clamped ≥0, results without resolvable calories dropped. Logged results flow into Quick add + Copy Day.

### Quick add — frequent foods (Log.jsx)
Collapsed Nutrition section shows a 2-col card grid of the user's top-6 most-logged foods, derived from `nutrition_log` (last 300 rows, deduped + frequency-ranked in JS — **no schema**), each carrying macros from its most recent entry; one tap re-logs today via the existing insert. All roles; respects `hideCalories`.

### Private notes (coach)
Single text field per coach-client pair, timestamped prepend on each save. Read-only by default; "Edit history" enables editing.

---

## Edge Functions (complete)

| Function | Auth | Purpose |
|---|---|---|
| `delete-account` | user | Role-aware deletion. Coach: offboard clients → delete data → cancel Stripe + delete subscriptions row → auth delete. Solo/client: cancel Stripe + delete subscriptions row → fetch coach info → delete data → auth delete → send emails (client confirmation; coach notification if applicable) |
| `check-trial-eligibility` | user | Returns { coach_trial_used, solo_trial_used } from trial_ledger. Called by CoachPaywall on mount. |
| `nutrition-coach` | user + role + solo gate | AI nutrition advice |
| `food-search` | user (`verify_jwt`) | Food name search proxying USDA FoodData Central (key server-side). Generic foods only (Foundation/SR Legacy/FNDDS); normalizes to per-100g macros. Uses FDC's **POST** endpoint (GET 400s on URL-encoded commas in `dataType`). Barcode lookups stay on OpenFoodFacts. |
| `weekly-report` | coach + owns `clientId` | AI weekly coaching report. Client passes `clientId`; fn verifies active coach↔client. |
| `notify-report` | coach + owns `clientId` | Email client when report sent. Recipient email derived server-side from `clientId` (not client-supplied). |
| `notify-checkin` | client (caller) | Email coach on check-in. Coach + recipient derived server-side from caller's active relationship. |
| `call-prep` | coach + owns `clientId` | AI call briefing (coach). Client passes `clientId`; fn verifies active coach↔client. |
| `nudge-client` | coach | Nudge inactive client, 48hr cooldown |
| `create-checkout-session` | user | Stripe checkout, 30-day trial, coach+solo branching |
| `stripe-webhook` | `--no-verify-jwt` (Stripe signature + 300s replay window) | Handle Stripe events, update subscriptions, offboard on cancel |
| `pause-solo-subscription` | `--no-verify-jwt`, internal | Pause solo sub on joining coach |
| `cancel-subscription` | `--no-verify-jwt`, internal | Cancel/resume at period end + email |
| `offboard-client` | coach | Remove client, resume solo sub, email |
| `offboard-self` | client | Client leaves coach, resume solo sub |
| `milestone-reached` | `--no-verify-jwt`, internal | Streak milestone detection + coach email |
| `weekly-digest` | `verify_jwt = true` + role=`service_role` | Monday coach digest. pg_cron job sends the service role key (was anon — i.e. effectively open — until Jun 8 2026). |

> **Security fix (Jun 8 2026):** `weekly-report`, `notify-report`, `notify-checkin`, `call-prep` previously did **no caller verification** (`verify_jwt=false` + no in-function check) — open Anthropic proxies / email relays. `weekly-digest` was triggered by pg_cron with the **public anon key**, so it was effectively open. All now verify the caller (and, where a coach acts on a client, the active relationship), derive email recipients server-side, and `weekly-digest` requires a `service_role` JWT. See decisions.md.

---

## Development Environment

- Local: Mac (arm64), Node v22, dev server `localhost:5173`
- LAN access: `server: { host: true }` in `vite.config.js` → `192.168.1.x:5173`
- Deploy: `git push` to `main` → Vercel auto-deploys. **Frontend prod is the `gardnr` Vercel project** (not `fitlog`); the local `.vercel` link can go stale — re-link with `supabase`/`vercel link --project gardnr` if a deploy aliases to a `fitlog-*` URL instead of `www.gardnr.fit`.
- **Stuck-deploy recovery (Hobby tier = ONE build slot):** if a pushed change doesn't go live, a build may be hung. A deploy stuck in `Initializing`/`Queued` for minutes (normal builds finish in 5–10s) squats the single slot, so every later deploy queues behind it forever — this is NOT a need for paid concurrent builds. Fix: `npx vercel ls gardnr` to spot the hung deployment, then `npx vercel remove <deployment-url> --yes` to free the slot; the next queued build takes it and promotes to production. Verify live: the bundle hash from `curl -s --compressed "https://www.gardnr.fit/?cb=$(date +%s)" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'` should match the local `dist/assets/index-*.js`, and `npx vercel inspect <url>` should list `www.gardnr.fit` under Aliases. (Diagnosed/fixed Jun 10.)
- **`git push` didn't trigger a deploy at all (different failure mode):** sometimes the GitHub→Vercel hook silently no-ops — the push succeeds but **no new deployment is created** for that commit (`npx vercel ls gardnr` shows nothing newer than the previous deploy). Symptom: live keeps serving the *previous* commit's bundle even though everything looks "Ready", and redeploying the latest deployment just refreshes the *old* code. Fix: **`npx vercel --prod`** to build the local HEAD and deploy it straight to production (bypasses the hook). It builds remotely and re-aliases `www.gardnr.fit`; live flips within seconds. When in doubt after a push, prefer `vercel --prod` over babysitting the git deploy. (Hit twice Jun 10–11.)
- Edge functions: `supabase functions deploy <name>` (Docker not required)
- SQL migrations: `supabase db push --linked` (works without Docker; `db dump` needs Docker) — or run directly in the Supabase SQL Editor. `supabase secrets set` currently errors locally on an access-token format quirk (set function secrets via the dashboard if needed).

```bash
npm run dev          # local dev server
npm run build        # production build check
npx vitest run       # unit tests (48)
git add . && git commit -m "..." && git push   # deploy frontend (gardnr project)
supabase functions deploy <name>               # deploy edge function
supabase db push --linked                      # apply migrations to remote
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

### Visual QA (Playwright)
`scripts/shoot.mjs` and `scripts/shoot-all.mjs` (Playwright + Chromium, devDeps) screenshot real pages at phone + desktop widths using throwaway accounts, then delete them. `shoot-all.mjs` also covers gated screens: a throwaway coach gets a `trialing` `subscriptions` row injected (service-role key from `supabase projects api-keys`) to clear the paywall, and a throwaway client is linked via a **client-token** `coach_clients` insert (service_role has no INSERT grant there — the real path is the client inserting their own row in the Join flow). Run `node scripts/shoot.mjs [baseUrl]` (defaults to local dev; pass `https://www.gardnr.fit` for prod) and read `/tmp/shots/*.png`. **Run after any UI change** — these were built after a sticky-nav bug shipped that only surfaced when actually viewing a scrolled page. For richer (non-empty) screenshots, seed a test account with `test-data.sql` (30 days of solo logs).
