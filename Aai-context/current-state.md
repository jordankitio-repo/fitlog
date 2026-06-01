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