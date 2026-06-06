# FitLog — AI Context Document
> This document is the single source of truth for any AI assistant continuing development on FitLog. It reflects the state of the project as of **June 1, 2026** at approximately 78 commits.

---

## Product Overview

**FitLog** is a web-based fitness coaching SaaS. It is not a general fitness tracker — it is specifically built for the coach-client relationship. Coaches manage clients, set targets, view compliance data, send reports, and message clients. Clients log their daily nutrition, weight, cardio, and steps and see their own progress.

- **Live URL:** https://fitlog-sepia.vercel.app
- **GitHub:** https://github.com/jordankitio-repo/fitlog
- **Supabase project ID:** mlqaurxefttbqsrllbyj (East US)

---

## Product Vision

FitLog is the nutrition and body composition layer coaches use alongside whatever workout tool they already have. Every competing platform (Trainerize, TrueCoach, Hevy) treats nutrition as an afterthought or a paid add-on. FitLog makes nutrition tracking, macro compliance, and body composition data the core product — not a feature.

**The pitch in one sentence:**
> FitLog is the nutrition and body composition layer coaches use alongside whatever workout tool they already have.

---

## Strategic Differentiators (vs. Trainerize, TrueCoach, Hevy)

1. Native nutrition tracking (not outsourced to MyFitnessPal)
2. Cardio + steps as coached data visible to coach in real time
3. Nutrition deviation / 7-day compliance rates per metric (calories, protein, cardio, steps)
4. Correlated body composition chart (weight + calorie % + cardio %)
5. Weight logging with time of day (morning vs evening matters for trend accuracy)
6. Web-first — no app download required for clients
7. Transparent flat pricing (not yet built)
8. AI-generated weekly coaching reports with macro + activity compliance data

---

## User Types

| Role | Description |
|---|---|
| `solo` | Individual self-tracker. No coach. Uses Dashboard + Log pages only. |
| `coach` | Manages clients. Sees CoachDashboard, can view any client's data via ClientView. |
| `client` | Connected to a coach. Simplified Dashboard (My Progress). Coach sets targets. |

Role is set on first login via RolePicker. New users (including OAuth) see RolePicker if `profiles.role` is null.

---

## Core Workflows

### Client
1. Logs in → My Progress dashboard
2. Logs daily: weight, nutrition entries, cardio sessions, steps
3. Sees today's stats, today vs target progress bars, charts
4. Reads reports from coach, messages coach
5. Submits weekly check-in (adherence, energy, obstacles, notes)

### Coach
1. Logs in → Coach Dashboard (client list with compliance pills)
2. Views any client → ClientView (full data view)
3. Sets client targets (calories, protein, carbs, fat, cardio, steps, weight goal)
4. Sends messages to client
5. Generates AI weekly report → edits → sends to client
6. Generates AI call prep briefing (private, not visible to client)
7. Writes private notes on client (timestamped append log)
8. Reads client check-ins

### Coach Invite Flow
1. Coach enters client email in CoachDashboard → sends invite
2. Client receives email, clicks link → `/join?token=xxx`
3. Client signs up or logs in → connected to coach

---

## Architecture

### Frontend
- **React 19 + Vite** (JSX, no TypeScript)
- **react-router-dom** for routing
- **Chart.js** via react-chartjs-2 (Line, Bar, mixed Chart)
- **Tailwind is NOT used** — all styling is inline styles + CSS variables in `index.css`
- Deployed on **Vercel** (auto-deploys on push to `main`)

### Backend
- **Supabase** (Postgres + Auth + Edge Functions + Storage)
- Auth: email/password + Google OAuth
- Edge Functions: Deno runtime, deployed via Supabase CLI

### Key File Structure
```
src/
  pages/
    App.jsx           — root, session/profile gate, role picker gate
    Dashboard.jsx     — solo + client dashboard
    Log.jsx           — daily logging (weight, nutrition, cardio, steps)
    Profile.jsx       — account settings, password change, data export, delete account
    Login.jsx         — email/password + Google OAuth
    CoachDashboard.jsx — coach home, client list, compliance pills, invite
    ClientView.jsx    — coach view of individual client
    RolePicker.jsx    — first-login role selection for OAuth users
    Join.jsx          — client invite acceptance flow
    ResetPassword.jsx — password reset handler
  components/
    NavBar.jsx
    Button.jsx        — variants: primary/ghost/danger/danger-solid/outline/muted/ai
    StatCard.jsx
    Skeleton.jsx
    Toast.jsx
    EmptyState.jsx
    BarcodeScanner.jsx
  utils/
    passwordValidation.js
  supabase.js         — Supabase client init
  index.css           — CSS variables, global styles, dark scrollbar
supabase/
  functions/
    delete-account/   — deletes all user data + auth user
    nutrition-coach/  — AI nutrition advice
    weekly-report/    — AI weekly coaching report generation
    notify-report/    — email notification when report sent
    notify-checkin/   — email notification when check-in submitted
    call-prep/        — AI call briefing for coaches
```

---

## Database Schema

### Tables

**profiles**
- `id` uuid PK (references auth.users)
- `email` text
- `full_name` text
- `role` text (null | 'solo' | 'coach' | 'client') — NO DEFAULT (intentional)
- `created_at` timestamptz

**nutrition_log**
- `id`, `user_id`, `food`, `calories`, `protein`, `carbs`, `fat`, `serving_size`, `serving_unit`, `logged_date`, `created_at`

**weight_log**
- `id`, `user_id`, `weight`, `unit` ('lbs'|'kg'), `logged_date`, `weighed_at` (time — HH:MM:SS 24hr format), `created_at`

**cardio_log**
- `id`, `user_id`, `exercise_type`, `duration`, `calories_burned`, `avg_heart_rate`, `logged_date`, `created_at`

**steps_log**
- `id`, `user_id`, `steps`, `distance`, `logged_date`, `created_at`

**targets**
- `id`, `user_id` (unique), `calories`, `protein`, `carbs`, `fat`, `cardio_minutes`, `steps`, `weight_goal`, `weight_goal_unit`, `updated_at`

**coach_clients**
- `id`, `coach_id`, `client_id`, `status` ('pending'|'active'), `created_at`

**messages** (unified, replaces old coach_messages + client_messages)
- `id`, `coach_id`, `client_id`, `sender_id`, `content`, `reaction`, `read_at`, `created_at`
- RLS: `coach_id = auth.uid() OR client_id = auth.uid()` WITH CHECK same
- GRANT: SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated

**reports**
- `id`, `coach_id`, `client_id`, `content`, `week_of` (date — Sunday-based), `read_at`, `archived`, `created_at`

**check_ins**
- `id`, `client_id`, `coach_id`, `week_of` (date), `adherence_rating`, `energy_level`, `obstacles`, `notes`, `created_at`
- Unique constraint: `client_id, week_of`

**coach_notes**
- `id`, `coach_id`, `client_id`, `content`, `updated_at`
- Unique constraint: `coach_id, client_id`
- Content is a timestamped append log (prepended on each save)

**invite_tokens**
- `id`, `coach_id`, `email`, `token`, `used`, `created_at`

### Triggers
- `on_auth_user_created` → `handle_new_user()` — inserts id + email into profiles only. No default role. Role is null until RolePicker runs.

### RLS
All tables have RLS enabled. Policies are user-scoped (user_id = auth.uid() or coach/client relationship).

---

## Key Business Logic

### Week Calculation
All week-based logic uses **Sunday as week start**:
```js
const weekOf = new Date(new Date().setDate(new Date().getDate() - new Date().getDay()))
```
`getDay()` returns 0 for Sunday. This is used for: reports, check-ins, compliance calculation.

### Weekly Report Date Range
Reports cover **Sunday to Saturday** (7 days). Range is calculated in `ClientView.jsx`:
```js
const start = addDays(currentWeekStart, -7)  // previous Sunday
const end = addDays(currentWeekStart, -1)    // previous Saturday
```
Explicit `weekRange` label is passed to the Edge Function and prepended to the report as a deterministic header.

### Weight Time Display
`weighed_at` is stored as PostgreSQL `time` type (HH:MM:SS 24hr). Display uses `formatTime()`:
```js
function formatTime(timeStr) {
  const [hours, minutes] = timeStr.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${minutes} ${ampm}`
}
```

### 7-Day Compliance Pills (CoachDashboard)
Per client, per metric (calories, protein, cardio, steps): count days in last 7 where logged value >= 90% of target. Color coding: green ≥5, yellow 3-4, red <3.

### Messaging
One unified `messages` table. `sender_id` identifies who sent each message. Both coach and client see the same thread in chronological order. Bubbles: blue right for sender, bordered left for receiver. Auto-scroll to bottom on new messages. Max height 400px with dark scrollbar.

### Reports
- Coach generates AI report → edits in textarea → sends to client
- Stored in `reports` table with `week_of` (Sunday date)
- Client sees reports grouped by week, collapsible, with left accent border card design
- Client can archive individual reports
- Coach sees sent reports grouped by week with read/unread status

### Private Notes (Coach)
Single text field per coach-client pair. Timestamped prepend on each new entry:
```
── Jun 1, 2026, 12:20 AM ──
Note content here

── May 25, 2026 ──
Earlier note here
```
History textarea is read-only by default. "Edit history" button enables editing.

### Copy Food from Another Day
In Log.jsx. Date picker → selectable food entry list with checkboxes → "Add X items to today". Covers: repeat single food, repeat whole day, copy any subset. Nutrition only — weight/steps/cardio not included (data integrity).

### Password Policy
Supabase: min 8 chars, lowercase + uppercase + digits + symbols required.
Frontend validation in Login.jsx (signup) and Profile.jsx (change password): same rules enforced client-side.
Profile.jsx requires current password when changing (Supabase "Require current password when updating" enabled).

---

## Authentication

- Email/password via Supabase Auth
- Google OAuth via Supabase + Google Cloud Console
  - Redirect URI: `https://mlqaurxefttbqsrllbyj.supabase.co/auth/v1/callback`
  - JS Origin: `https://fitlog-sepia.vercel.app`
  - `redirectTo: window.location.origin` (no trailing slash — trailing slash causes fallback to Site URL)
  - Supabase Site URL: `https://fitlog-sepia.vercel.app`
  - Redirect URLs allowlist: `http://localhost:5173`, `http://localhost:5173/`, `http://localhost:5173/reset-password`, `https://fitlog-sepia.vercel.app`, `https://fitlog-sepia.vercel.app/reset-password`
- **Google OAuth is in testing mode** — only manually added test users can sign in. Needs Google verification before public launch.
- New OAuth users (role = null) → RolePicker screen before main app

---

## Edge Functions

All deployed to Supabase. Base URL: `https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/`

| Function | Purpose |
|---|---|
| `delete-account` | Deletes all user data rows then auth user via service role key |
| `nutrition-coach` | AI nutrition advice |
| `weekly-report` | Generates AI weekly coaching report using 7-day data + check-in |
| `notify-report` | Sends email to client when coach sends a report |
| `notify-checkin` | Sends email to coach when client submits check-in |
| `call-prep` | Generates AI call briefing for coach (private) |

Email is via **Resend**. Currently only delivers to Resend account owner email until domain is verified.

---

## Important Decisions & Rationale

| Decision | Rationale |
|---|---|
| No TypeScript | Speed of development, Jay learning JS |
| Inline styles over CSS classes | Pragmatic for component-level styling, no Tailwind |
| Single `messages` table | Replaced split coach_messages + client_messages for unified thread UX |
| `role` column has NO default | Ensures new OAuth users see RolePicker instead of defaulting to solo |
| Reports separate from messages | Different purpose — formal, structured, archivable |
| Copy food only, not other log types | Weight/steps are measurements, not re-enterable data. Copying would falsify data. |
| Sunday-to-Saturday weekly report range | Consistent with week_of calculation everywhere, 7 days exactly |
| No emoji in AI tools buttons | Professional aesthetic |
| Scrollable message thread (400px max) | Prevents card stretching with many messages |

---

## Current State (June 1, 2026)

**Commits:** ~78
**Build:** Passing (`npm run build`)
**Lint:** Failing on pre-existing issues in Button.jsx, CoachDashboard.jsx, Join.jsx, Log.jsx, Profile.jsx — no new errors introduced recently
**Deployed:** Yes, auto-deploy on push to `main` via Vercel

### What works end-to-end:
- Full solo tracking (nutrition, weight, cardio, steps, charts)
- Full coach-client workflow (invite, targets, compliance, reports, messaging, check-ins)
- AI weekly report + call prep briefing
- Google OAuth + email/password auth
- Role picker for new users
- Copy food from another day
- Data export + delete account
- Mobile responsive
- Strong password policy
- Private notes with timestamped append

---

## Open Issues / Known Bugs

| Issue | Status |
|---|---|
| Chart.js Filler plugin warning (weight chart fill) | Cosmetic, deferred |
| Existing lint errors in several files | Pre-existing, not blocking |
| Google OAuth in testing mode | Needs Google verification for public launch |
| Resend email only delivers to account owner | Needs domain verification |
| `npm run lint` fails | Pre-existing, unrelated to recent work |

---

## Roadmap (Priority Order)

### Immediate (blocking revenue)
1. **Stripe integration** — coaches cannot be charged yet. This is the only hard blocker for monetization.
2. **Landing page** — no public page to send prospective coaches to.
3. **Email domain verification (Resend)** — notifications currently only deliver to Resend account owner.
4. **Terms of Service + Privacy Policy** — required before charging money.

### Near-term
5. **Google OAuth production verification** — currently in testing mode, only manually added test users can sign in with Google.
6. **Beta coach outreach** — validate product with 2-3 free coaches before building more features.

### Later
7. Apple OAuth
8. Workout programming (not core, don't build until nutrition coaching is validated)
9. Branded mobile app (far future)

---

## Development Environment

- **Local:** Mac (arm64), Node v22, dev server at `localhost:5173`
- **Local network access:** `npm run dev` with `server: { host: true }` in `vite.config.js` → accessible at `192.168.1.x:5173`
- **Deploy:** `git push` to `main` → Vercel auto-deploys
- **Edge Functions:** `supabase functions deploy <function-name>` (Docker not required)
- **SQL migrations:** Run directly in Supabase SQL Editor

### Key commands
```bash
npm run dev          # start local dev server
npm run build        # production build check
git add . && git commit -m "..." && git push   # deploy
supabase functions deploy <name>               # deploy edge function
```

---

## Supabase Config Notes

- `profiles.role` must have NO DEFAULT — drop it if it ever reappears: `ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;`
- `messages` table needs explicit GRANT: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;`
- RLS on `messages` needs `WITH CHECK` clause for inserts to work
- `week_of` in `reports` is a `date` type, not text
- `weighed_at` in `weight_log` is a `time` type (stores as HH:MM:SS, format on display)

---

## Design System

All colors via CSS variables in `index.css`:
- `--color-bg` — page background
- `--color-surface` — card background
- `--color-border` — borders
- `--color-text` — primary text
- `--color-muted` — secondary text
- `--color-primary` — #4f8ef7 (blue)
- `--radius` — border radius

Dark theme throughout. No light mode.

Chart colors: `#4f8ef7` (blue/weight), `#a78bfa` (purple/cardio), `#34d399` (green/steps), `#fbbf24` (yellow/calories).

---

*Document generated June 1, 2026. Update after each significant session.*

## Session Update — June 1–2, 2026 (~commits 79–85)

### Completed This Session

**Landing Page (`src/pages/Landing.jsx`)**
- Built full marketing landing page for logged-out visitors at `/`
- Sections: hero, problem, features, how it works, pricing teaser, footer
- Fixed parallax: `.landing-hero-media` is `position: fixed`, content sections use `rgba(12,12,14,0.88)` + `backdrop-filter: blur(2px)` to slide over background
- Nav is `position: fixed` with `.landing-page` having `padding-top: 64px`
- Four background UI cards: compliance pills, message thread, weight trend SVG, weekly report preview
- CTAs: "Start free" → `/login?mode=signup&role=coach`, "Book a demo" → mailto
- App.jsx: logged-out `/` shows Landing instead of redirecting to `/login`
- Main container style is conditional: no max-width/padding when logged out

**Authentication**
- Google OAuth redirect fixed: `redirectTo: window.location.origin` (no trailing slash)
- Added `http://localhost:5173/` (with slash) to Supabase Redirect URLs allowlist
- Mobile OAuth via local IP is expected dev limitation — test OAuth on production

**Messaging System Refactor**
- Replaced `coach_messages` + `client_messages` tables with single `messages` table
- Schema: `id, coach_id, client_id, sender_id, content, reaction, read_at, created_at`
- RLS: `FOR ALL USING (coach_id = auth.uid() OR client_id = auth.uid()) WITH CHECK (same)`
- Required explicit grant: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;`
- Both Dashboard.jsx and ClientView.jsx use unified thread, ascending order, bubble design
- `isMe = m.sender_id === profile?.id` (NOT session — Dashboard only receives profile prop)
- Scrollable thread: `maxHeight: 400px`, `overflowY: auto`, dark scrollbar CSS, `messagesEndRef` auto-scroll
- Old tables were already dropped by Supabase

**Weekly Report Date Range Fix**
- Added local date helpers to avoid `toISOString()` timezone shifts
- Range: previous Sunday → previous Saturday (7 days exactly)
- `getWeeklyReportRange()`: `start = addDays(currentWeekStart, -7)`, `end = addDays(currentWeekStart, -1)`
- Explicit `weekRange` label passed to `weekly-report` Edge Function
- Edge Function prepends deterministic header to report

**`getCurrentWeekSunday()` — Consistent Week Calculation**
- Added to Dashboard.jsx, ClientView.jsx, CoachDashboard.jsx
- Replaces all inline `toLocalDateString(new Date(...getDay()...))` calculations
- Avoids UTC/local timezone shift that caused week_of mismatches
```js
function getCurrentWeekSunday() {
  const now = new Date()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - now.getDay())
  return `${sunday.getFullYear()}-${String(sunday.getMonth()+1).padStart(2,'0')}-${String(sunday.getDate()).padStart(2,'0')}`
}
```
- Deleted bad check_in row with `week_of: 2026-06-01` from DB

**Weekly Check-in Improvements (Dashboard.jsx — client side)**
- Red "To do" badge on SectionHeader when check-in not submitted
- `SectionHeader` now accepts `badgeColor` prop
- Spacing fixed between subtitle and Fill out button
- All fields enforced before submission: `obstacles` and `notes` must not be empty
- `saveCheckIn` uses `getCurrentWeekSunday()`

**Weekly Check-in Improvements (ClientView.jsx — coach side)**
- Check-in card always shows (removed `{clientCheckIn && ...}` gate)
- Empty state: "No check-in submitted this week."
- Obstacles and Notes labels: full text color, uppercase, letter-spacing
- **Supabase Realtime subscription** — coach view auto-updates when client submits:
```js
supabase.channel(`check_ins_${clientId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins', filter: `client_id=eq.${clientId}` }, () => {
    fetchClientCheckIn()
  })
  .subscribe()
```
- No manual Refresh button needed — updates are instant

**CoachDashboard.jsx**
- `fetchAllClientStats` uses `getCurrentWeekSunday()` for check-in query
- Client card now correctly shows check-in status

**Copy Food from Another Day (Log.jsx)**
- Inline panel with date picker + selectable food entries + select all + add button
- Covers: repeat single food, repeat whole day, copy any subset
- Nutrition only — weight/steps/cardio excluded (data integrity rationale)

**Misc Fixes**
- Steps "Distance" placeholder → "Miles"
- Weight `weighed_at` display: `formatTime()` helper converts HH:MM:SS to 12hr format
- Applied to both Log.jsx and ClientView.jsx
- `vite.config.js`: `server: { host: true }` for LAN access

### Pending (Lock Mechanic — Designed, Not Built)
**Design agreed:**
- After 3 consecutive days of no nutrition logging → lock client's "Today vs target" + charts
- Client can still LOG data — never block data entry
- Coach unlocks via button in ClientView
- Auto-unlock after 7 days (prevents coach holding account hostage)
- Coach sees "Locked" badge on client card in CoachDashboard
- Requires: `locked_at` field in `coach_clients` table, lock check on Dashboard load, unlock endpoint in ClientView

### Current Commit Count
~85 commits

### Updated Roadmap Priority
1. Lock mechanic (designed, ready to build)
2. Stripe / monetization
3. Email domain verification (Resend)
4. ToS / Privacy policy
5. Google OAuth production verification
---

## Session Update — June 4, 2026 (~commits 140–160)

### Completed

---

#### Stripe Billing — Full Implementation

**Stripe account setup:**
- Created Stripe account (individual/sole proprietor)
- Sandbox mode for development and testing
- Two products created on `FitLog Coach`:
  - Founding rate: `$19/month` — Price ID: `price_1TechtAWijxnniIjAWpCOW1X`
  - Standard rate: `$29/month` — Price ID: `price_1Ted6xAWijxnniIjuaByj6pQ`
- Both prices use monthly recurring billing with 30-day free trial

**Environment variables added:**
- Vercel (Production + Preview): `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `VITE_STRIPE_FOUNDING_PRICE_ID`, `VITE_STRIPE_STANDARD_PRICE_ID`
- Supabase Edge Function secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Local `.env`: all four variables

**Database:**
```sql
CREATE TABLE public.subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  status text CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  trial_end timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT USING (coach_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_coach_id_unique UNIQUE (coach_id);
```

**Edge functions:**
- `create-checkout-session` — verifies coach auth, creates/reuses Stripe customer, creates checkout session with 30-day trial, upserts subscriptions row
- `stripe-webhook` — verifies Stripe signature (HMAC-SHA256), handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- JWT verification disabled on `stripe-webhook` (Stripe doesn't send JWTs)
- Webhook registered in Stripe Dashboard pointing to Supabase function URL

**Frontend:**
- `src/pages/BillingSuccess.jsx` — success page at `/billing/success`, renders outside auth gate via early return in `App.jsx`
- `App.jsx` — `export const BILLING_ENABLED = false` flag, early return for `/billing/success` route
- `Profile.jsx` — Billing card for coaches with "Start free trial" button calling `create-checkout-session`
- `/billing/success` route added to `AppRoutes`

**Known issues fixed during implementation:**
- Trailing space in `VITE_STRIPE_FOUNDING_PRICE_ID` Vercel env var caused "No such price" Stripe error — trimmed
- `STRIPE_SECRET_KEY` needed to be set in Supabase Edge Function secrets separately from Vercel
- Multiple simultaneous clicks created duplicate subscription rows — fixed with `UNIQUE (coach_id)` constraint and `Prefer: resolution=merge-duplicates` upsert header
- Webhook returning 401 — fixed by disabling JWT verification on `stripe-webhook` function

**Flow tested end-to-end on production:**
1. Coach clicks "Start free trial" on Profile page
2. Redirected to Stripe Checkout (sandbox)
3. Completes with test card `4242 4242 4242 4242`
4. Lands on `/billing/success`
5. Stripe fires `checkout.session.completed` webhook
6. `subscriptions` row updated: `status = 'active'`, `stripe_subscription_id` populated
7. "Go to dashboard" returns to CoachDashboard

---

#### Monetization Architecture (decided June 4, 2026)

**Roles:**
- `coach` — pays monthly, manages clients
- `client` — free, connected to a coach
- `solo` — self-tracker, free or paid tier

**Coach pricing:**
- Founding: $19/month (locked for first coaches)
- Standard: $29/month (public launch)
- 30-day free trial on both
- `BILLING_ENABLED = false` in `App.jsx` — flip to activate paywall
- Access allowed for `active`, `trialing`, `past_due` statuses
- `canceled` → upgrade prompt shown, data preserved, clients unaffected
- Missed payments: Stripe Smart Retries over ~2 weeks, coach keeps access during `past_due` (grace)

**Solo tiers (not yet built):**
- Free Solo: basic logging, limited history, no AI, no charts, no targets
- Paid Solo (~$9-12/month): full history, all charts, targets, AI feedback, data export

**Client → Solo transition logic (not yet built):**
- Triggered by: coach offboards client, client self-offboards, coach subscription canceled
- 30-day grace period with full access
- At day 30: in-app banner + email offering Free Solo or Paid Solo
- No action → defaults to Free Solo
- Solo → Client: free immediately, paid solo pauses, if offboarded again grace restarts

**Coach subscription canceled:**
- Auto-offboard all active clients → 30-day grace period (webhook trigger, not yet built)

**Data policy:**
- Data NEVER deleted regardless of payment status
- Access restricted, not data

**Build order:**
1. ✅ Coach Stripe billing
2. ⬜ Paywall gate (`BILLING_ENABLED = true`) — after ToS + beta coaches
3. ⬜ Auto-offboard clients on coach subscription cancel
4. ⬜ Solo tier feature gating
5. ⬜ Grace period flow
6. ⬜ Paid solo Stripe product + checkout

---

#### Design Sprint (completed June 3, 2026)

**Inter font + type scale:**
- Added Inter from Google Fonts
- CSS variables: `--text-xl`, `--text-lg`, `--text-md`, `--text-sm`, `--text-xs`
- `h1` uses `var(--text-xl)`, `h2` uses `var(--text-lg)` with `letter-spacing: -0.01em`
- Body font stack updated to Inter first

**Stat cards — metric color system:**
- Left accent border per metric using `color` prop
- Value size `2rem`, label `0.65rem` uppercase, `minHeight: 80px`
- Colors: Calories `#fbbf24`, Protein `#f87171`, Carbs `#e2d5b0`, Fat `#fb923c`, Weight `#34d399`, Cardio `#4f8ef7`, Steps `#a78bfa`
- Applied in Dashboard and ClientView
- Steps card spans full width

**Chart color + opacity:**
- Bar charts (Calories, Cardio, Steps): `backgroundColor` at `0.7` opacity
- Line charts (Weight): `backgroundColor` at `0.15` opacity
- All chart colors match stat card metric colors

**Surface depth:**
- Shared `cardStyle` extracted to `src/utils/styles.js`
- `boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)'`
- CSS vars: `--color-bg: #0a0a0a`, `--color-surface: #141414`, `--color-border: #242424`
- Applied across all pages

**NavBar:**
- Active link via `useLocation`: white + weight 600; inactive: muted
- FitLog logo is now `Link to="/"`
- Gap `24px`, logo `letterSpacing: -0.02em`

**Compliance pills (CoachDashboard):**
- Metric identity colors always shown
- Opacity: `1.0` high, `0.75` medium, `0.55` low compliance
- Low compliance gets subtle colored background fill as pre-attentive signal
- Pills suppress when `logged === 0` (no data)

**Log page restructure:**
- Order: Weight → Nutrition → Cardio+Steps → Entries
- Progressive disclosure: all sections collapsible via SectionHeader
- Weight: shows summary when logged, expands to edit
- Cardio sessions always visible when collapsed
- Steps summary always visible when collapsed
- Repeat button (`↻`) on each nutrition entry
- Serving size prefill removed
- Barcode buttons ghost variant
- All primary action buttons right-aligned

**SectionHeader component:**
- Extracted to `src/components/SectionHeader.jsx`
- Consistent `▶`/`▼` toggle with animated grid-row collapse
- Used in Dashboard, ClientView, Log

**Profile page:**
- "Change password" → "Security"
- Export + Delete merged into one "Data" card
- Account info labels: uppercase muted

**CoachDashboard:**
- Summary stat cards: `2rem` numbers, uppercase muted labels
- Removed "Your clients" heading
- "View data →" → ghost variant
- Client cards: `gap: 16px`, name `fontWeight: 700`
- Obstacles: own labeled section
- EmptyState emoji removed

**Button hover:** `brightness(1.12)` on hover

**Emoji cleanup:**
- Removed from exercise types, empty states, barcode buttons, export, role picker
- Kept: message reactions, checkmarks, streak milestones

**Spacing rhythm:**
- Variables: `--space-xs` through `--space-xl`
- All page wrappers: `gap: 24px`
- Internal gaps: `16px` between sections, `12px` form fields, `8px` tight groups

---

#### Features

**Hide calories toggle:**
- `hide_calories BOOLEAN DEFAULT false` on `coach_clients`
- Toggle in ClientView targets section
- Hides calories StatCard, progress bar, chart, entry display on client Dashboard and Log
- Logging form always shows calories input

**Nudge mechanic:**
- `last_nudged_at TIMESTAMPTZ` on `coach_clients`
- Edge function `nudge-client`: verifies coach, 48hr cooldown, Resend email, updates timestamp
- Nudge button on CoachDashboard card (when `daysSinceLog >= 2`)
- Nudge button on ClientView header (gated by `daysSinceLog`)
- In-app nudge banner on client Dashboard (dismissible per nudge timestamp)
- Cooldown feedback shown to coach

**notify-checkin:**
- Replaced starter with full Resend email handler
- Sends to coach when client submits weekly check-in
- Deployed and tested end-to-end ✓

**coach_messages fix:**
- `ClientView.jsx` line 650: `coach_messages` → `messages`

**Offboard card redesign:**
- Moved from ClientView header to bottom card
- Neutral "Coaching" title, red only on button
- Matches client-side "Leave coaching plan" pattern

**Domain setup:**
- `tryfitlog.com` purchased on Namecheap
- Connected to Vercel (A record + CNAME), SSL provisioned
- Live at `https://www.tryfitlog.com`
- Supabase redirect URLs updated
- Resend domain verified (DKIM + SPF + DMARC)
- `notify-report` sender: `noreply@tryfitlog.com`
- `notify-report` CTA: `https://www.tryfitlog.com/login`

---

#### New Edge Functions

| Function | Purpose |
|---|---|
| `nudge-client` | Coach nudges inactive client, 48hr cooldown, Resend email |
| `notify-checkin` | Email to coach on client check-in submission |
| `create-checkout-session` | Creates Stripe checkout session with 30-day trial |
| `stripe-webhook` | Handles Stripe events, updates subscriptions table |
| `pause-solo-subscription` | Locally pauses Solo Premium during coaching; active Stripe subs also pause collection |

---

#### Schema Changes (June 3–4, 2026)

```sql
-- June 3
ALTER TABLE public.coach_clients ADD COLUMN IF NOT EXISTS hide_calories BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.coach_clients ADD COLUMN IF NOT EXISTS last_nudged_at TIMESTAMPTZ;

-- June 4
CREATE TABLE public.subscriptions (...); -- see full DDL above
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_coach_id_unique UNIQUE (coach_id);
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO service_role;

-- June 5
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS paused_for_coaching BOOLEAN NOT NULL DEFAULT false;
```

**Known billing limitation:** Solo trial subscriptions cannot be truly paused in Stripe. When a trialing Solo Premium user joins a coach, FitLog sets `paused_for_coaching = true` locally, but the Stripe trial clock continues to run during coaching. Offboarding clears the local marker; if the trial expired while coached, the user returns to whatever status Stripe has reached.

---

#### New Utilities + Components

| File | Purpose |
|---|---|
| `src/utils/styles.js` | Shared `cardStyle` |
| `src/utils/lockState.js` | `resolveLockState` pure function |
| `src/utils/dateHelpers.js` | All date helpers |
| `src/utils/inviteValidation.js` | `getInviteBlockReason` |
| `src/components/SectionHeader.jsx` | Collapsible section header |
| `src/pages/BillingSuccess.jsx` | Stripe checkout success page |

---

#### Unit Tests

48 tests passing across 4 files:

| File | Tests |
|---|---|
| `lockState.test.js` | 15 |
| `passwordValidation.test.js` | 7 |
| `dateHelpers.test.js` | 19 |
| `inviteValidation.test.js` | 7 |

---

#### Open Issues Updated

| Issue | Status |
|---|---|
| Stripe webhook JWT 401 | Fixed — JWT verification disabled on stripe-webhook |
| Duplicate subscriptions on rapid clicks | Fixed — UNIQUE constraint + upsert |
| Trailing space in Vercel env var | Fixed — trimmed in function + env var corrected |
| BillingSuccess blank on production | Fixed — early return in App.jsx before auth gate |
| Large Vite JS chunk warning | Deferred |
| `npm run lint` 4 errors / 9 warnings | Deferred |
| Offboard notice shows twice | Cosmetic, deferred |

---

### Current Commit Count
~160 commits

### Updated Live URL
https://www.tryfitlog.com (previously fitlog-sepia.vercel.app)

### Updated Roadmap Priority
1. ToS + Privacy Policy (required before charging)
2. Activate `BILLING_ENABLED = true` after ToS
3. Beta coach outreach (3–5 founding coaches at $19/month)
4. Weekly coach digest email (feature #12)
5. Client compliance heatmap (feature #11)
6. Auto-offboard clients on coach subscription cancel (webhook)
7. Rolling 7-day weight average
8. Solo tier feature gating + paid solo product
9. Grace period flow for client → solo transitions
10. Fix lint errors
11. Google OAuth re-architecture

---

## Session — June 4, 2026 (~180 commits)

### Summary
This session completed the full pre-launch checklist: weekly coach digest email, legal documents, feedback mechanism, and Stripe live mode. FitLog is now live and billing real coaches.

---

### Completed This Session

#### Weekly Coach Digest Email

- New Edge Function: `supabase/functions/weekly-digest/index.ts`
- Runs every Monday at 8:00 AM UTC via `pg_cron`
- Queries all coaches with active clients
- Per client: 7-day compliance for calories, protein, cardio, steps + check-in status + days logged
- Sends one email per coach via Resend (dark-themed HTML table)
- Compliance color coding: green ≥5/7, yellow 3-4/7, red <3/7
- Manual trigger: `POST /functions/v1/weekly-digest` with anon key
- Cron job name: `weekly-coach-digest`, schedule: `0 13 * * 1`

**pg_cron setup (run in Supabase SQL Editor):**
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'weekly-coach-digest',
  '0 13 * * 1',
  $$
  select net.http_post(
    url := 'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/weekly-digest',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUPABASE_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

---

#### Legal Documents

- `src/pages/Terms.jsx` — full Terms of Service (21 sections)
- `src/pages/Privacy.jsx` — full Privacy Policy (14 sections)
- Both are public routes (no auth required)
- Both use existing CSS variables — no extra CSS needed
- Key FitLog-specific clauses included:
  - Health Data Disclaimer (Section 19 of ToS)
  - AI/Anthropic data processing disclosure (Section 8 of Privacy)
  - Coach independence disclaimer
  - Data retention on cancellation (data preserved, access suspended)
  - CCPA/CPRA coverage for California users
- Governing law: Texas, Harris County
- Dispute resolution: informal negotiation (30 days) → binding arbitration (AAA rules, Harris County)
- Liability cap: 6 months of payments
- Contact: digigardenllc@gmail.com
- Effective date: June 4, 2026

**Legal doc tracker — pending updates (add when features are built):**
| Item | Document | Trigger |
|---|---|---|
| Self-serve cancellation via account settings | ToS Section 6 | When cancel flow built in Profile |
| Grace period terms for clients after coach cancels | ToS Section 19 | When auto-offboard webhook built |
| Solo tier feature differences | ToS Section 6 | When solo gating built |

---

#### Feedback & Support Button

- New component: `src/components/FeedbackButton.jsx`
- Opens pre-filled mailto link to `digigardenllc@gmail.com`
- Pre-fills: user name, user email, type selector (Feedback / Bug / Cancel / Other)
- Added to `NavBar.jsx` (always visible when logged in)
- Added to `CoachPaywall.jsx` (visible when coach is blocked)
- `profile` prop passed into `CoachPaywall` from `App.jsx`

---

#### Stripe Live Mode

**Live price IDs:**
| Product | Price ID |
|---|---|
| Founding ($19/month) | `price_1TemKxAYmISHFVlMiNx7SWQy` |
| Standard ($29/month) | `price_1TemKwAYmISHFVlMnz5NENY8` |

**Vercel env vars updated:**
- `VITE_STRIPE_PUBLISHABLE_KEY` → `pk_live_...`
- `VITE_STRIPE_FOUNDING_PRICE_ID` → `price_1TemKxAYmISHFVlMiNx7SWQy`
- `VITE_STRIPE_STANDARD_PRICE_ID` → `price_1TemKwAYmISHFVlMnz5NENY8`

**Supabase secrets updated:**
- `STRIPE_SECRET_KEY` → `sk_live_...`
- `STRIPE_WEBHOOK_SECRET` → `whsec_live_...`

**Live webhook endpoint:**
- URL: `https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Registered in Stripe Dashboard → Live mode → Developers → Webhooks

**Billing flag:**
```jsx
// src/App.jsx
export const BILLING_ENABLED = true
```

**RLS fix required for subscription fetch:**
```sql
grant select on public.subscriptions to authenticated;

create policy "Coaches can view own subscription"
on public.subscriptions
for select
to authenticated
using (coach_id = auth.uid());
```

**End-to-end verification (June 4, 2026):**
- Stripe live customer created: `cus_Ue4tf5x7G7oYYj`
- Live subscription created: `sub_1TemjPAYmISHFVlMiRGCXbV1`
- Price ID confirmed: `price_1TemKxAYmISHFVlMiNx7SWQy` (Founding)
- Trial end: July 4, 2026
- No payment taken — free trial active ✅
- Supabase `subscriptions` row confirmed ✅
- App grants full access post-checkout ✅

**Known minor issue:**
- Supabase `subscriptions.status` writes `active` instead of `trialing` — webhook handler maps status incorrectly. Not breaking (both grant access). Fix webhook handler to read `subscription.status` from Stripe event correctly before next billing cycle.

---

### New Files This Session

| File | Purpose |
|---|---|
| `src/pages/Terms.jsx` | Terms of Service — public route |
| `src/pages/Privacy.jsx` | Privacy Policy — public route |
| `src/components/FeedbackButton.jsx` | Pre-filled mailto support button |
| `src/components/CoachPaywall.jsx` | Paywall gate for coaches with no active subscription |
| `supabase/functions/weekly-digest/index.ts` | Monday digest email to coaches |

---

### Schema Changes This Session

```sql
-- RLS fix for subscription fetch from frontend
grant select on public.subscriptions to authenticated;

create policy "Coaches can view own subscription"
on public.subscriptions
for select
to authenticated
using (coach_id = auth.uid());

-- pg_cron + pg_net extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

---

### App.jsx Changes This Session

- Added `/terms` and `/privacy` to public route early-return block
- Added subscription fetch effect for coaches (`BILLING_ENABLED` gated)
- Added `CoachPaywall` gate before main app render
- Flipped `BILLING_ENABLED = true`
- Added `CoachPaywall` and `Terms`/`Privacy` imports

---

### Updated Roadmap Priority

1. Fix `subscriptions.status` webhook mapping (`trialing` vs `active`)
2. Beta coach outreach (3–5 founding coaches at $19/month, locked forever)
3. Auto-offboard clients on coach subscription cancel (webhook handler)
4. Client compliance heatmap
5. Rolling 7-day weight average
6. Solo tier feature gating + paid solo product
7. Grace period flow for client → solo transitions
8. Self-serve cancellation in Profile page
9. Fix lint errors
10. Google OAuth re-architecture

### Current Commit Count
~180 commits

---

## Session — June 5, 2026

### Summary
Full Tier 1 feature sweep plus several bug fixes. Six new features shipped, six bugs fixed, one schema corrected. FitLog now has a complete analytics layer for coaches and clients.

---

### Features Shipped

#### Compliance Heatmap
- New component: `src/components/ComplianceHeatmap.jsx`
- 13-week (91-day) calendar grid in `ClientView.jsx`, below logging consistency cards
- Sunday-first grid matching app week convention — verified with date math tests
- Color coding: green ≥90% calorie target, yellow 60–89%, red <60%, gray no log
- Hover tooltip: date + calories logged + percentage of target
- Month labels, day labels (every other row), legend
- `overflowX: auto` scroll wrapper for narrow viewports
- Cell size: 18px, gap: 2px
- Data fetch: `fetchHeatmapData()` — 97-day window, aggregates calories per date from `nutrition_log`
- Uses `toLocalDateString` helper throughout — avoids `new Date('YYYY-MM-DD')` UTC timezone bug

#### Rolling 7-Day Weight Average
- Added `computeRollingAverage(data, window=7)` utility function in `Dashboard.jsx` and `ClientView.jsx`
- Second dataset on weight chart: dashed green line (`rgba(52,211,153,0.45)`, `borderDash:[4,4]`, no point dots)
- Chart legend enabled to distinguish "Weight" vs "7-day avg"
- Registered `Filler` plugin in both `Dashboard.jsx` and `ClientView.jsx` to fix Chart.js warning

#### Weekday vs Weekend Compliance Split
- Extended `fetchConsistency` fetch range from 30 to 90 days — this single change also powers best week analysis below
- Weekday/weekend classification uses local `Date` object directly — avoids `new Date(dateString)` UTC parsing bug that shifts weekday by 1 in negative-offset timezones
- New state fields: `weekdayLogged`, `weekendLogged`, `weekdayTotal`, `weekendTotal`
- Two new stat cards below existing streak/last7/last30 cards in `ClientView.jsx`
- Each card shows logged/total count + percentage

#### Best Week Analysis
- Computed inside `fetchConsistency` in `ClientView.jsx` — no new fetch needed
- Scans all 13 Sunday–Saturday windows in last 90 days
- Finds window with highest logged day count; ties broken by most recent
- New state fields: `bestWeekCount`, `bestWeekStart`, `bestWeekEnd`
- New card below weekday/weekend cards: shows date range + days/7 count
- Color: green for 7/7, yellow for 5–6, muted otherwise

#### Client Comparison/Ranking Dashboard
- Added `scoreClient(s)` utility: sums `value` across all `hasData` compliance items
- Added `sortBy` state (default: `'compliance'`)
- Three sort modes: Compliance (score desc, recency tiebreak), Last logged (daysSinceLog asc), Check-in (submitted first)
- No-stats clients score -1 and sink to bottom in all modes
- Sort controls render only when `clients.length > 1`
- Replaced `clients.map(` with `sortedClients.map(` in render

#### Milestone Celebrations + Coach Notification
- New DB column: `profiles.last_milestone_streak` (integer, default 0)
- New Edge Function: `supabase/functions/milestone-reached/index.ts`
  - Deployed with `--no-verify-jwt` (verifies caller internally via `auth/v1/user`)
  - Milestones: 7, 14, 30, 60, 90 days
  - Guard: only fires if `streakCount in MILESTONES AND last_milestone_streak < streakCount`
  - Updates `last_milestone_streak` on fire — email sends once per milestone level, never duplicates
  - Sends Resend email to coach: subject `🔥 {clientName} just hit a {N}-day streak`
  - Returns `{ ok: true, milestone }` on fire, `{ skipped: true }` on duplicate
- Frontend: `useEffect` in `Dashboard.jsx` watches `streak`, calls Edge Function when milestone hit
- Banner only shows when backend returns `{ ok: true, milestone }` — never re-shows on refresh
- In-app banner: green-bordered card with 🔥 emoji, streak count, contextual message, dismiss button
- Milestone-specific messages: 7 ("One week straight"), 14 ("Two weeks"), 30 ("This is who you are now"), 60 ("Seriously impressive"), 90 ("You've changed your life")
- Users with no active coach connection: in-app banner only, email skipped gracefully
- Clients with an active coach: banner + coach email

---

### Bugs Fixed

#### Stripe Webhook `trialing` Status
- Root cause: `checkout.session.completed` handler inferred status from `payment_status === 'paid'` which was unreliable for trial checkouts
- Fix: fetch the actual subscription object from Stripe API immediately after checkout to get real `status`, `trial_end`, `current_period_end`, and `price_id`
- Also fixed: `stripe-webhook` redeployed with `--no-verify-jwt` — was returning 401 in live mode

#### Steps Unique Constraint
- Root cause: `steps_log` had `UNIQUE (logged_date)` — only one user could log steps per date globally
- Fix: dropped `steps_log_logged_date_key`, added `steps_log_user_date_key UNIQUE (user_id, logged_date)`
- Updated `saveSteps` in `Log.jsx` to use `upsert` with `onConflict: 'user_id,logged_date'`
- Updated `fetchSteps` to filter by `user_id` in addition to `logged_date`

#### fetchWeight Multiple Rows
- Root cause: `fetchWeight` used `.maybeSingle()` which throws `PGRST116` when multiple weight rows exist for the same date (valid since `weight_log` has no unique constraint — supports multiple weigh-ins per day)
- Fix: changed both `Dashboard.jsx` and `Log.jsx` to `.order('created_at', { ascending: false }).limit(1)` — always takes most recent entry
- Also fixed: `weighed_at` was stored as locale-dependent string ("10:30 AM") — now stored as `HH:MM:SS` 24hr format to match PostgreSQL `time` column

#### daysSinceLog Negative Value
- Root cause: future-dated test data caused negative subtraction
- Fix: `Math.max(0, ...)` clamp added to `daysSinceLog` calculation in `CoachDashboard.jsx`

#### Chart.js Filler Plugin Warning
- Added `Filler` to `ChartJS.register(...)` in both `Dashboard.jsx` and `ClientView.jsx`

#### StatCard Regression
- Local file had lost `import { cardStyle } from '../utils/styles'`, the `...cardStyle` spread, and `minHeight: '80px'`
- Restored from git — file written directly via terminal to bypass editor conflict

---

### Schema Changes

```sql
-- Fix steps unique constraint
alter table public.steps_log drop constraint steps_log_logged_date_key;
alter table public.steps_log add constraint steps_log_user_date_key unique (user_id, logged_date);

-- Milestone tracking
alter table public.profiles
add column if not exists last_milestone_streak integer default 0;
```

---

### New Files This Session

| File | Purpose |
|---|---|
| `src/components/ComplianceHeatmap.jsx` | 13-week calorie compliance calendar grid |
| `supabase/functions/milestone-reached/index.ts` | Milestone detection + coach email notification |

---

### Edge Function Deployment Notes

All functions requiring caller auth verification are deployed with `--no-verify-jwt` and verify internally:

| Function | Flag | Auth method |
|---|---|---|
| `stripe-webhook` | `--no-verify-jwt` | Stripe signature header |
| `milestone-reached` | `--no-verify-jwt` | `auth/v1/user` internal fetch |
| `weekly-digest` | `--no-verify-jwt` | Called by pg_cron (no user context) |

---

### Test Data

Generated 90 days of test data for `jordangarden44@gmail.com` and `gardenkitiojordan@yahoo.fr` via SQL inserts. To clean up:

```sql
delete from nutrition_log where food = 'Test meal';
delete from weight_log where weighed_at = '07:00:00';
delete from cardio_log where exercise_type = 'Running' and user_id in (
  select id from profiles where email in ('jordangarden44@gmail.com','gardenkitiojordan@yahoo.fr')
);
-- Steps: no reliable filter column — delete by date range of test data
delete from steps_log
where logged_date between '2026-03-07' and '2026-06-04'
and user_id in (
  select id from profiles where email in ('jordangarden44@gmail.com','gardenkitiojordan@yahoo.fr')
);
```

---

### Updated Roadmap Priority

**Tier 1 — Complete ✅**
All 6 Tier 1 features shipped.

**Next: Tier 2**
1. Structured client onboarding assessment
2. Body measurements tracking
3. Rate of weight change alerts
4. Auto-generated shareable PDF report card

**Billing — Pending**
1. Auto-offboard clients on coach cancel (webhook handler)
2. Solo tier feature gating + paid solo Stripe product
3. Grace period flow
4. Self-serve cancellation in Profile
5. Gate AI nutrition advice behind Solo Premium

**Legal Doc Updates Pending**
| Item | Document | Trigger |
|---|---|---|
| Self-serve cancellation | ToS Section 6 | When built |
| Grace period terms | ToS Section 19 | When built |
| Solo tier differences | ToS Section 6 | When built |
| Solo Premium data usage | Privacy Policy Section 2 | When built |
| AI nutrition advice gating | Privacy Policy Section 8 | When built |

### Current Commit
`e399b44 feat: milestone celebrations shipped, remove test milestone 4`

---

## Session — June 5, 2026 (Billing Layer Completion)

### Summary
Completed the entire billing and access-control layer. Shipped coach cancellation auto-offboarding, the full Solo Premium tier ($7.99/mo, 14-day trial), subscription pause/resume during coaching, server-side AI gating, self-serve cancel/resume, and cancellation emails. This session was heavy on Stripe integration, schema changes, and edge-case reasoning — the design notes below matter for future work.

---

## Part 1 — Auto-Offboard Clients on Coach Cancel

### Reasoning
When a coach's Stripe subscription ends (`customer.subscription.deleted`), their clients must transition cleanly to solo mode. Previously the webhook only set `subscriptions.status = 'canceled'` and left clients orphaned.

### Design
- Offboarding sets `coach_clients.status = 'offboarded'` + `offboarded_at`, and flips client `profiles.role` to `'solo'` (matching the existing manual-offboard behavior in `offboard-client`/`offboard-self`).
- Clients keep all data; they just lose the coaching layer and naturally fall through to solo free tier.
- Email notification to each client via Resend.

### Architecture
- Logic lives in `stripe-webhook` `customer.subscription.deleted` case → calls new `offboardCoachClients(supabaseUrl, serviceKey, coachId)` helper.
- `coachId` resolved via `fetchSubscriptionRow` (selects `id, coach_id`), which works because the subscription row still exists at deletion time (only status changed, row not deleted).
- **Critical:** email loop wrapped in try/catch that logs but never throws — otherwise email failure → 500 → Stripe retries the whole webhook → duplicate offboarding work. Idempotency holds anyway (re-patching `offboarded` rows is harmless), but emails would re-send.
- Solo subscriptions correctly untouched: `offboardCoachClients` only runs when `subRow.coach_id` is non-null. Solo rows have `coach_id = null`.

---

## Part 2 — Solo Premium Tier

### Reasoning
Solo users were getting AI nutrition advice and analytics for free, which costs money per AI call and gives away the product. Solo Premium ($7.99/mo) gates advanced self-analytics WITHOUT competing with the coach product — the coach-client interaction layer (reports, check-ins, nudges, targets) remains hard-walled and is never available to solo users regardless of tier.

### Pricing
| Tier | Price | Trial |
|---|---|---|
| Solo Free | $0 | — |
| Solo Premium | $7.99/mo | 14 days |
| Coach Founding | $19/mo | 30 days |
| Coach Standard | $29/mo | 30 days |

Solo Premium price ID (live): `price_1Tf3sfAYmISHFVlM9Q90VjMS`
Env var: `VITE_STRIPE_SOLO_PRICE_ID`

### Schema
```sql
alter table public.subscriptions add column if not exists solo_id uuid references profiles(id);
```
- `subscriptions` rows are parallel: a coach row has `coach_id` set, `solo_id` null; a solo row has `solo_id` set, `coach_id` null. No restructuring — kept churn low. Future migration to `profile_id + plan_type` deferred.
- RLS: added a second SELECT policy so solo users can read their own subscription:
```sql
create policy "Solo users can view own subscription"
on public.subscriptions for select to authenticated
using (solo_id = auth.uid());
```
(The coach policy `coach_id = auth.uid()` already existed. Without the solo policy, solo subscription fetches silently returned nothing — this was a real bug found during testing.)

### create-checkout-session (extended for solo)
- Was coach-only (rejected non-coach roles). Now branches on `profile.role`:
  - **coach:** lookup by `coach_id`, 30-day trial, metadata `plan_type=coach`
  - **solo:** lookup by `solo_id`, 14-day trial, metadata `plan_type=solo` + `solo_id`
- Stripe metadata includes `plan_type` on both customer and subscription for future webhook routing (currently webhook routes by Stripe IDs, not metadata, so no webhook change was needed for basic solo billing).
- Blocks re-checkout if existing solo sub status is in `[trialing, active, past_due, canceled]` — `canceled` was the gap (a canceled solo user could otherwise start a fresh 14-day trial). `past_due` was already blocked via `PAID_STATUSES`.

### Frontend gating
- Flags in `App.jsx`:
```js
export const BILLING_ENABLED = true
export const SOLO_BILLING_ENABLED = true
const PAID_STATUSES = ['trialing', 'active', 'past_due']
```
- Solo billing is **feature-level gating, not an app-level route gate** (solo users keep core logging free). This differs from coach billing which is a full `CoachPaywall` route block.
- Derived flag (final, corrected form):
```js
const hasSoloPremium =
  !SOLO_BILLING_ENABLED ||
  (profile?.role === 'solo' &&
    PAID_STATUSES.includes(soloSubscription?.status) &&
    !soloSubscription?.paused_for_coaching)
```
- **Important semantic:** `hasSoloPremium` means "has Solo Premium ACCESS." It is `false` for coaches and clients. Clients do NOT get solo analytics (7-day avg, AI) — those would compete with the coach product. This was corrected mid-session after an initial version made `hasSoloPremium` true for all non-solo roles.
- Gated surfaces:
  - Rolling 7-day weight average (Dashboard) — dataset conditionally excluded
  - AI nutrition feedback button (Log) — already had `profile?.role !== 'client'` guard, plus `hasSoloPremium`
  - SoloUpgrade prompts hidden for clients (they shouldn't be upsold; coach pays for them)
- New component: `src/components/SoloUpgrade.jsx` — inline upgrade prompt (full + compact modes), starts solo checkout via `create-checkout-session`.

### Server-side AI gate
- `nutrition-coach` previously had NO auth at all — anyone with the URL could call it.
- Now: verifies caller via `auth/v1/user`, loads role, allows coach/client unconditionally, requires solo users to have `PAID_STATUSES` subscription. Rejects unpaid solo with 403.
- This is the enforcement source of truth; the UI gate is just pre-gating to avoid inviting users into a flow that will fail.

---

## Part 3 — Subscription Pause/Resume During Coaching

### Reasoning
If a paid Solo Premium user accepts a coach invite, they shouldn't be billed for Solo Premium while coached (the coach provides the analytics view of their data). When offboarded, they should resume their solo subscription where they left off.

### The Stripe limitation that shaped the design
Stripe's native subscription pause (`status=paused`) requires flexible billing mode and **cannot pause trialing subscriptions**. Since we need to pause both `active` and `trialing` solo subs, native pause doesn't fit. Solution: a local marker + `pause_collection` for active subs only.

### Schema
```sql
alter table public.subscriptions add column if not exists paused_for_coaching boolean not null default false;
```

### Behavior matrix
| Status on joining coach | Stripe action | DB action |
|---|---|---|
| `trialing` | none (can't pause trials) | `paused_for_coaching = true` |
| `active` | `pause_collection[behavior]=void` | `paused_for_coaching = true` |
| `canceled` / `past_due` | none | none |

- `void` behavior means invoices created during pause are voided — customer not charged for coaching period. Resume only affects future invoices; it does not rewind billing periods.
- `hasSoloPremium` requires `!paused_for_coaching`, so a paused sub correctly blocks premium access while the user is a client.

### Architecture
- New Edge Function `pause-solo-subscription` — called client-side from `Join.jsx` after invite acceptance, **non-blocking** (invite succeeds even if pause fails).
  - **Bug fixed during review:** for active subs, the local marker is now only set if the Stripe `pause_collection` call succeeds. Otherwise a Stripe failure would block access locally while Stripe keeps billing — worst of both. Trialing subs (no Stripe call) always set the marker.
- Resume logic added inline to BOTH `offboard-client` and `offboard-self` via a shared `resumeSoloSubscription` helper:
  - Finds sub where `solo_id = clientId AND paused_for_coaching = true`
  - If active + has Stripe sub: sends `pause_collection=''` (empty string) to Stripe to resume — this is the correct Stripe API to remove a pause.
  - Only clears `paused_for_coaching` if the Stripe resume succeeded (`canClearLocalPause` guard).

### Known v1 limitation (documented, accepted)
Trial subscriptions keep aging in Stripe while the user is coached — there's no true trial-clock pause. If a solo user joins a coach mid-trial (14 days) and leaves 30 days later, the trial is over. Acceptable for v1; revisit if it becomes a real complaint.

### Subscription resume scenarios (the three cases)
| Who gets offboarded | Result |
|---|---|
| Never had solo / was free solo | Returns to free solo, can start trial |
| Was paid Solo Premium | Returns to solo, existing subscription resumes (pause cleared) |

Note: `Join.jsx` only changes `profiles.role` to `client` and creates the `coach_clients` row — it never deletes the subscription row, which is why resume works automatically once pause is cleared.

---

## Part 4 — Self-Serve Cancel + Resume

### Reasoning
Cancellation was email-only ("contact us"). Users expect self-serve. Built cancel-at-period-end (not immediate) — fairer, no refund logic, and the existing webhook already handles the eventual `deleted` event.

### Design decision: cancel at period end (not immediate)
- Sets Stripe `cancel_at_period_end = true`
- User keeps access until period end; status stays `active`/`trialing` until then, so `hasSoloPremium`/coach access remains true — correct.
- For coaches: clients are NOT offboarded until the period actually ends (the `deleted` event fires at period end, not at cancel time). Already handled correctly.
- During trial: canceling means it cancels at trial end, no charge ever. Correct and desirable.

### Schema
```sql
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
```

### Architecture
- New Edge Function `cancel-subscription` with `{ action: 'cancel' | 'resume' }`.
  - **Design fix during review:** finds the subscription by CURRENT role (`coach_id` if coach, `solo_id` if solo), NOT an `or=(coach_id,solo_id)` query. The OR query could pick the wrong row if a user ever had both a coach and an old solo subscription row. Role-based lookup is precise and also naturally blocks paused/client users (role `client` → 400, no subscription to manage).
  - Sets Stripe `cancel_at_period_end` to true/false, then patches the local flag immediately so the UI reflects without waiting for the webhook.
- Webhook `customer.subscription.updated` now persists `cancel_at_period_end: object?.cancel_at_period_end ?? false`. The `deleted` case resets it to false. Both writes are idempotent with the function's local patch (no race).
- New component `src/components/SubscriptionManager.jsx` — cancel link → confirm dialog → cancel; shows "plan will end on [date]" + Resume button when `cancel_at_period_end` is true. Wired into both coach and solo billing cards in `Profile.jsx`.
  - Uses `current_period_end || trial_end` for the end date (trialing subs have `current_period_end = null`).
  - `onChange` does `window.location.reload()` — load-bearing because the subscription prop is fetched once in App.jsx and goes stale after cancel. Inelegant but correct; a refetch-callback refactor was deferred.
- Date line in billing cards hides "Renews" when `cancel_at_period_end` is true (SubscriptionManager shows its own end-date notice instead).

### Cancellation confirmation email
- Sent from `cancel-subscription` on `action === 'cancel'` only (resume sends nothing).
- Non-blocking try/catch. States plan name (Coach vs Solo Premium), end date, and a resume path.

---

## New Edge Functions This Session
| Function | Auth | Purpose |
|---|---|---|
| `pause-solo-subscription` | `--no-verify-jwt`, internal auth check | Pause solo sub when joining coach |
| `cancel-subscription` | `--no-verify-jwt`, internal auth check | Cancel/resume at period end + email |

## Modified Edge Functions
| Function | Change |
|---|---|
| `stripe-webhook` | offboardCoachClients on cancel; persist cancel_at_period_end |
| `create-checkout-session` | coach + solo branching; block canceled re-trial |
| `offboard-client` | resume solo sub; manual-offboard email |
| `offboard-self` | resume solo sub |
| `nutrition-coach` | auth + role + solo subscription gate |

## Schema Changes This Session
```sql
alter table public.subscriptions add column if not exists solo_id uuid references profiles(id);
alter table public.subscriptions add column if not exists paused_for_coaching boolean not null default false;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;

create policy "Solo users can view own subscription"
on public.subscriptions for select to authenticated
using (solo_id = auth.uid());
```

## New Frontend Files
| File | Purpose |
|---|---|
| `src/components/SoloUpgrade.jsx` | Inline solo premium upgrade prompt (full + compact) |
| `src/components/SubscriptionManager.jsx` | Cancel/resume control for billing cards |

## Subscription Status Reference (for future work)
- `incomplete` — checkout started, not yet confirmed
- `trialing` — in free trial, grants access
- `active` — paying, grants access
- `past_due` — payment failed, still grants access (Stripe retries ~2 weeks)
- `canceled` — ended, no access
- `paused_for_coaching` (local flag, not a Stripe status) — solo sub paused while user is a coached client
- `cancel_at_period_end` (flag) — scheduled to cancel; access continues until period end

`PAID_STATUSES = ['trialing', 'active', 'past_due']` — the shared allow-list used everywhere for access checks.

---

## Bugs Fixed This Session
| Bug | Fix |
|---|---|
| Solo subscription fetch returned nothing | Added RLS policy for `solo_id = auth.uid()` |
| `hasSoloPremium` true for clients (gave them solo analytics) | Rewrote to require `role === 'solo'` |
| Offboard in-app notice never re-showed after first dismissal | Dismissal now keyed by `offboarded_at` timestamp, not a permanent boolean |
| No email on manual coach offboard | Added non-blocking Resend email to `offboard-client` |
| pause-solo: local marker set even if Stripe pause failed | Only set marker if Stripe pause succeeds (active subs) |
| canceled solo user could start a fresh trial | Block `canceled` in create-checkout-session |
| `cancel-subscription` OR-query could cancel wrong sub | Look up by current role instead |

---

## Updated Roadmap

### Billing Layer — COMPLETE ✅
All billing/access items shipped.

### Next: Tier 2
1. Structured client onboarding assessment
2. Body measurements tracking
3. Rate of weight change alerts
4. Auto-generated shareable PDF report card

### Legal Doc Updates Pending (expanded this session)
| Item | Document | Trigger |
|---|---|---|
| Self-serve cancellation (now exists) | ToS Section 6 | Update — cancellation is no longer email-only |
| Solo Premium tier + $7.99 pricing | ToS Section 6 | Add solo tier terms |
| Solo Premium data usage (AI) | Privacy Policy Section 8 | Add |
| Pause/resume billing behavior | ToS Section 6 | Document pause-during-coaching |
| Trial-aging-during-coaching limitation | ToS | Disclose trial clock continues during coaching |
| Client reconnection requires new invite | ToS Section 19 | Clarify offboarded clients re-accept invite |
| Coach cancel → clients offboarded at period end | ToS Section 19 | Clarify timing |

### Technical Debt
| Item | Notes |
|---|---|
| SubscriptionManager full-page reload | Could lift refetch callback from App.jsx |
| Duplicate offboard email copy | `stripe-webhook` and `offboard-client` have separate copies; no shared helper |
| Large Vite chunk warning | Still deferred |
| Lint errors (pre-existing) | Still deferred |
| `subscriptions` schema | Eventual migration to `profile_id + plan_type` instead of parallel `coach_id`/`solo_id` |

### Current Commit
`e5acdf4 feat: email cancellation confirmations`