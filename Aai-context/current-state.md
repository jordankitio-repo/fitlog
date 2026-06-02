# FitLog — AI Context Document
> This document is the single source of truth for any AI assistant continuing development on FitLog. It reflects the local repo state as of **June 2, 2026** at **98 commits**.

---

## Product Overview

**FitLog** is a web-based fitness coaching SaaS. It is not a general fitness tracker — it is specifically built for the coach-client relationship. Coaches manage clients, set targets, view compliance data, send reports, and message clients. Clients log daily nutrition, weight, cardio, and steps and see their own progress.

- **Live URL:** https://fitlog-sepia.vercel.app
- **GitHub:** https://github.com/jordankitio-repo/fitlog
- **Supabase project ID:** `mlqaurxefttbqsrllbyj` (East US)

---

## Product Vision

FitLog is the nutrition and body composition layer coaches use alongside whatever workout tool they already have. Competing platforms like Trainerize, TrueCoach, and Hevy treat nutrition as an afterthought or paid add-on. FitLog makes nutrition tracking, macro compliance, and body composition data the core product.

**Pitch:**
> FitLog is the nutrition and body composition layer coaches use alongside whatever workout tool they already have.

---

## Strategic Differentiators

1. Native nutrition tracking, not outsourced to MyFitnessPal
2. Cardio + steps as coached data visible to coaches in real time
3. Nutrition deviation and 7-day compliance rates per metric
4. Correlated body composition chart: weight + calorie % + cardio %
5. Weight logging with time of day for better trend context
6. Web-first; no app download required for clients
7. Transparent flat pricing, not yet built
8. AI-generated weekly coaching reports with macro + activity compliance data
9. Client accountability lock mechanic that hides progress/charts after missed nutrition logging while still allowing data entry

---

## User Types

| Role | Description |
|---|---|
| `solo` | Individual self-tracker. No coach. Uses Dashboard + Log pages only. |
| `coach` | Manages clients. Sees CoachDashboard and can view any active client's data via ClientView. |
| `client` | Connected to a coach. Uses simplified Dashboard ("My Progress"). Coach sets targets. |

Current auth is **email/password only**. Email signups set role during signup. `RolePicker` still exists as a safety net for profiles where `profiles.role` is null.

---

## Core Workflows

### Public Visitor
1. Visits `/`
2. Sees marketing landing page
3. Can click "Start free" to `/login?mode=signup&role=coach`
4. Can click "Book a demo" mailto link

### Solo User
1. Signs up as individual
2. Logs nutrition, weight, cardio, and steps
3. Uses Dashboard and Log pages
4. Can later accept a coach invite and convert to `client` with data preserved

### Client
1. Logs in → My Progress dashboard
2. Logs daily: weight, nutrition entries, cardio sessions, steps
3. Sees today's stats, targets, charts, reports, messages, and weekly check-in
4. Submits weekly check-in with adherence, energy, obstacles, and notes
5. Can leave coaching plan and become `solo`; data is preserved
6. If nutrition is not logged for 3+ days, coached progress/charts lock, but logging remains available

### Coach
1. Logs in → Coach Dashboard
2. Invites clients by email
3. Views any active client → ClientView
4. Sets client targets
5. Sends messages and reviews reactions/check-ins
6. Generates AI weekly report → edits → sends to client
7. Generates AI call prep briefing, private to coach
8. Writes private timestamped notes
9. Unlocks locked clients or offboards clients

### Coach Invite Flow
1. Coach enters client email in CoachDashboard.
2. App checks `profiles` and active `coach_clients` relationships.
3. Existing coach account: blocked.
4. Existing active client: blocked unless already this coach's client, then duplicate blocked.
5. Existing solo account: asks coach to confirm sending invite; data is preserved.
6. Duplicate pending invite from same coach: blocked.
7. New email or confirmed solo email: creates `invitations` row and returns `/join?token=...`.
8. Invitee opens `/join?token=...`.
9. Existing account: password-only login flow, then accept.
10. New user: name + password signup, profile role set directly to `client`.
11. Accepting invite creates/reactivates `coach_clients`, clears offboard/lock timestamps, marks invitation accepted, refreshes session, and navigates home.

---

## Architecture

### Frontend

- **React 19 + Vite** (JSX, no TypeScript)
- **react-router-dom** for routing
- **Chart.js** via `react-chartjs-2`
- **Tailwind is not used** — styling is inline styles plus CSS variables in `index.css`
- Deployed on **Vercel**; push to `main` auto-deploys

### Backend

- **Supabase** (Postgres + Auth + Edge Functions + Storage)
- Auth: **email/password only** for now
- Edge Functions: Deno runtime, deployed via Supabase CLI
- Email: Resend

### Key File Structure

```txt
src/
  App.jsx              — root routes, session/profile gate, RolePicker safety gate
  supabase.js          — Supabase client init
  index.css            — CSS variables, global styles, dark scrollbar, landing styles
  pages/
    Landing.jsx        — logged-out marketing landing page
    Dashboard.jsx      — solo + client dashboard, lock UI, self-offboard
    Log.jsx            — daily logging, barcode scanner, copy food from prior day
    Profile.jsx        — account settings, password change, data export, delete account
    Login.jsx          — email/password login/signup, role set during signup
    CoachDashboard.jsx — coach home, client list, compliance pills, invites, lock badges
    ClientView.jsx     — coach view of individual client, unlock/offboard/reporting
    RolePicker.jsx     — fallback role selection for null-role profiles
    Join.jsx           — invite acceptance flow
    ResetPassword.jsx  — password reset handler
  components/
    NavBar.jsx
    Button.jsx         — variants: primary/ghost/danger/danger-solid/outline/muted/ai
    StatCard.jsx
    Skeleton.jsx
    Toast.jsx
    EmptyState.jsx
    BarcodeScanner.jsx
  utils/
    passwordValidation.js
supabase/
  functions/
    call-prep/
    delete-account/
    notify-checkin/
    notify-report/
    nutrition-coach/
    offboard-client/
    offboard-self/
    weekly-report/
```

---

## Database Schema

### Tables

**profiles**
- `id` uuid PK, references auth.users
- `email` text
- `full_name` text
- `role` text: null | `solo` | `coach` | `client`
- `created_at` timestamptz
- Important: `role` has **no default**

**nutrition_log**
- `id`, `user_id`, `food`, `calories`, `protein`, `carbs`, `fat`, `serving_size`, `serving_unit`, `logged_date`, `created_at`

**weight_log**
- `id`, `user_id`, `weight`, `unit` (`lbs` | `kg`), `logged_date`, `weighed_at` (`time`, HH:MM:SS), `created_at`

**cardio_log**
- `id`, `user_id`, `exercise_type`, `duration`, `calories_burned`, `avg_heart_rate`, `logged_date`, `created_at`

**steps_log**
- `id`, `user_id`, `steps`, `distance`, `logged_date`, `created_at`

**targets**
- `id`, `user_id` unique, `calories`, `protein`, `carbs`, `fat`, `cardio_minutes`, `steps`, `weight_goal`, `weight_goal_unit`, `updated_at`

**coach_clients**
- `id`, `coach_id`, `client_id`, `status`, `created_at`
- `status`: `pending` | `active` | `offboarded`
- `lock_cleared_at` timestamptz — coach unlock timestamp for computed lock mechanic
- `offboarded_at` timestamptz — offboarding timestamp
- Unique relationship expected on `coach_id, client_id` for invite reactivation/upsert

**invitations**
- `id`, `coach_id`, `client_email`, `token`, `status`, `created_at`
- `status`: pending/accepted style flow
- Used by CoachDashboard invite creation and Join invite acceptance

**messages**
- Unified table replacing old split message tables
- `id`, `coach_id`, `client_id`, `sender_id`, `content`, `reaction`, `read_at`, `created_at`
- RLS: `coach_id = auth.uid() OR client_id = auth.uid()` with same `WITH CHECK`
- Grant required: `GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;`

**reports**
- `id`, `coach_id`, `client_id`, `content`, `week_of` date, `read_at`, `archived`, `created_at`
- `week_of` is Sunday-based

**check_ins**
- `id`, `client_id`, `coach_id`, `week_of` date, `adherence_rating`, `energy_level`, `obstacles`, `notes`, `created_at`
- Unique constraint: `client_id, week_of`

**coach_notes**
- `id`, `coach_id`, `client_id`, `content`, `updated_at`
- Unique constraint: `coach_id, client_id`
- Content is a timestamped append log, prepended on each save

### Triggers

- `on_auth_user_created` → `handle_new_user()`
- Inserts `id` + `email` into `profiles` only
- Does not assign default role

### Important RLS / Grants

```sql
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;

ALTER TABLE public.coach_clients ADD COLUMN IF NOT EXISTS lock_cleared_at TIMESTAMPTZ;
ALTER TABLE public.coach_clients ADD COLUMN IF NOT EXISTS offboarded_at TIMESTAMPTZ;

ALTER TABLE public.coach_clients DROP CONSTRAINT coach_clients_status_check;
ALTER TABLE public.coach_clients ADD CONSTRAINT coach_clients_status_check
  CHECK (status IN ('pending', 'active', 'offboarded'));

CREATE POLICY coach_clients_update_by_coach ON public.coach_clients
  FOR UPDATE USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

CREATE POLICY coach_clients_insert_by_client ON public.coach_clients
  FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, UPDATE ON public.coach_clients TO service_role;
GRANT SELECT, UPDATE ON public.profiles TO service_role;
```

---

## Key Business Logic

### Week Calculation

All week-based logic uses Sunday as week start. Use local date construction to avoid `toISOString()` UTC shifts.

```js
function getCurrentWeekSunday() {
  const now = new Date()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - now.getDay())
  return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
}
```

Used for reports, check-ins, and dashboard check-in/compliance state.

### Weekly Report Date Range

Reports cover the previous Sunday through Saturday.

```js
const start = addDays(currentWeekStart, -7)
const end = addDays(currentWeekStart, -1)
```

`weekRange` is passed to the `weekly-report` Edge Function, and the Edge Function prepends a deterministic date-range header.

### Lock Mechanic

Computed lock, no stored `locked_at` state.

- Applies only to coached clients, never solo users
- Baseline is latest nutrition log date or `coach_clients.created_at`
- Lock engages when `daysSinceLastNutritionLog >= 3`
- Auto-unlocks at 10 days total (3 days to engage + 7 day backstop)
- Coach unlock sets `coach_clients.lock_cleared_at = now()`
- Coach unlock suppresses the current lapse for 48 hours
- Client can always log data; lock hides "Today vs target" and all charts
- Coach sees red "Locked" badge on CoachDashboard client card
- Coach can unlock from ClientView

Helper exists in `Dashboard.jsx`, `ClientView.jsx`, and `CoachDashboard.jsx`:

```js
function resolveLockState({ lastNutritionDate, connectionCreatedAt, lockClearedAt }) {
  const LOCK_AFTER = 3
  const AUTO_UNLOCK_AFTER = 7
  const COACH_GRACE_HOURS = 48
  // returns { locked, days, reason: 'active' | 'locked' | 'auto-unlocked' | 'coach-unlocked' }
}
```

### 7-Day Compliance Pills

CoachDashboard counts days in the last 7 where each logged value is at least 90% of target.

- Metrics: calories, protein, cardio, steps
- Green: 5+ compliant days
- Yellow: 3–4 compliant days
- Red: fewer than 3 compliant days

### Weekly Check-ins

- Client-side Dashboard shows red "To do" badge when missing
- All fields required: adherence, energy, obstacles, notes
- Saved by `client_id, week_of` upsert
- Coach-side ClientView always shows check-in section
- Empty state: "No check-in submitted this week."
- Supabase Realtime subscription in ClientView refreshes coach view when client submits

### Messaging

One unified `messages` table. `sender_id` identifies the author. Both coach and client see the same chronological thread.

- Current-user bubbles: blue, right-aligned
- Other-user bubbles: bordered, left-aligned
- Thread auto-scrolls to bottom
- Max height 400px with dark scrollbar styling

Known stale issue: `CoachDashboard.jsx` and `ClientView.jsx` still reference old `coach_messages` for reaction/consistency lookups. The main message thread has moved to `messages`, but these legacy lookups can produce 404/runtime errors if `coach_messages` is dropped.

### Reports

- Coach generates AI report → edits textarea → sends to client
- Stored in `reports` with Sunday-based `week_of`
- Client sees reports grouped by week, collapsible, with accent-border cards
- Client can archive individual reports
- Coach sees sent reports grouped by week with read/unread status

### Private Notes

Single text field per coach-client pair. New notes are prepended with timestamp.

```txt
── Jun 1, 2026, 12:20 AM ──
Note content here

── May 25, 2026 ──
Earlier note here
```

History textarea is read-only by default. "Edit history" enables editing.

### Copy Food from Another Day

In `Log.jsx`.

- Inline panel with date picker
- Selectable nutrition entries with checkboxes
- Select all support
- "Add X items to today"
- Nutrition only; weight/steps/cardio are not copied because they are measurements

### Barcode Serving Size

Open Food Facts barcode scan supports two modes:

- **Serving-based mode:** if `_serving` nutrients exist, use product label serving as base. `servingSize = 1`, `servingUnit = 'serving'`, and UI shows `1 serving = <label>`.
- **100g mode:** if serving nutrient data does not exist, use existing 100g-based behavior.

Scaling:

- Serving mode multiplier = number of servings (`parseFloat(servingSize)`)
- 100g mode multiplier = serving amount converted against 100g/ml baseline

### Weight Time Display

`weighed_at` is stored as PostgreSQL `time` (HH:MM:SS). Display helper converts to 12-hour time in Log and ClientView.

```js
function formatTime(timeStr) {
  const [hours, minutes] = timeStr.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${minutes} ${ampm}`
}
```

### Password Policy

Supabase and frontend enforce:

- Minimum 8 characters
- Lowercase + uppercase
- Digit
- Symbol

Frontend validation is in `Login.jsx`, `Join.jsx`, and `Profile.jsx` via `utils/passwordValidation.js`. Profile password change requires current password because Supabase "Require current password when updating" is enabled.

---

## Authentication

Current state:

- Email/password only
- Google OAuth button and handler removed from Login and Join
- Email signup collects full name, email, password, and role (`solo` or `coach`)
- Email signup blocks duplicate profile emails before calling Supabase Auth signup
- Email signup upserts profile immediately with selected role, so RolePicker should not show
- Invite signup creates user as `client` directly
- RolePicker remains as a fallback for null-role profiles and has a Back button that signs out and returns to landing

Deferred:

- Google OAuth production verification
- OAuth invite-flow architecture
- Account linking in settings (add password to OAuth account, add OAuth to email account)

Historical OAuth config notes if re-enabled:

- Supabase callback: `https://mlqaurxefttbqsrllbyj.supabase.co/auth/v1/callback`
- Site URL: `https://fitlog-sepia.vercel.app`
- Redirect allowlist included localhost and production reset-password URLs
- Prior fix: `redirectTo: window.location.origin` with no trailing slash

---

## Edge Functions

Base URL: `https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/`

| Function | Purpose |
|---|---|
| `delete-account` | Deletes user data rows and auth user via service role key |
| `nutrition-coach` | AI nutrition advice |
| `weekly-report` | Generates AI weekly coaching report using 7-day data + check-in |
| `notify-report` | Sends email to client when coach sends a report |
| `notify-checkin` | Sends email to coach when client submits check-in |
| `call-prep` | Generates private AI call briefing for coach |
| `offboard-client` | Coach offboards a client; sets relationship offboarded and profile role `solo` |
| `offboard-self` | Client leaves coaching plan; sets own relationship offboarded and profile role `solo` |

Email is via **Resend**. Currently only delivers to the Resend account owner email until domain is verified.

---

## Landing Page

`src/pages/Landing.jsx` is the logged-out `/` route.

- Sections: hero, problem, features, how it works, pricing teaser, footer
- Fixed parallax background: `.landing-hero-media` is `position: fixed`
- Content sections use translucent dark backgrounds and slight blur
- Fixed nav; `.landing-page` has `padding-top: 64px`
- Four background UI cards: compliance pills, message thread, weight trend SVG, weekly report preview
- CTA "Start free" → `/login?mode=signup&role=coach`
- CTA "Book a demo" → mailto
- `App.jsx` uses conditional main style so landing is full-width with no app container max-width

---

## Offboarding

### Coach-Initiated

- Button in ClientView header
- Inline confirmation panel before action
- Calls `offboard-client` Edge Function
- Function verifies coach owns active relationship
- Updates `coach_clients.status = 'offboarded'`
- Sets `coach_clients.offboarded_at = now`
- Updates `profiles.role = 'solo'`
- On success, coach navigates back to CoachDashboard

### Client-Initiated

- "Leave coaching plan" section at bottom of client Dashboard
- Visible only for `profile.role === 'client'`
- Inline confirmation before action
- Calls `offboard-self`
- Stores localStorage marker `offboard_by_${userId} = 'client'`
- Refreshes session then reloads after 800ms

### Offboard Notice

Solo users see a dismissible notice after offboarding.

- Coach-initiated copy: "Your coach has ended the coaching relationship. Your data is preserved and you can continue tracking on your own."
- Client-initiated copy: "You've left your coaching plan. Your data is preserved and you can continue tracking on your own."
- Dismissal persisted in `offboard_notice_${userId}`
- Known cosmetic issue from prior session: notice may briefly show twice because of React fetch/render timing

---

## Important Decisions & Rationale

| Decision | Rationale |
|---|---|
| No TypeScript | Speed of development and learning curve |
| Inline styles over Tailwind/classes | Pragmatic for current component-level styling approach |
| Email/password only for now | OAuth caused invite/session/role timing edge cases and was deferred |
| `profiles.role` has no default | Prevents accidental access path when role is unknown |
| Email signup sets role immediately | Avoids RolePicker for normal email users |
| Invite signup sets role to `client` directly | Avoids invite users becoming solo/coach by mistake |
| Single `messages` table | Unified coach-client thread model |
| Reports separate from messages | Formal, structured, archivable coach communication |
| Copy food only | Weight/steps/cardio are measurements; copying would falsify data |
| Sunday-to-Saturday reporting | Consistent with `week_of` and check-in logic |
| Computed lock instead of stored lock flag | Avoids drift; only coach unlock timestamp must persist |
| Lock never blocks logging | Accountability feature should not prevent recovery |
| Offboarding preserves data | Solo/client conversion should not destroy historical logs |
| Scrollable message thread | Prevents long conversations from stretching cards |

---

## Current State (June 2, 2026)

**Commits:** 98 at local `HEAD`  
**Build:** Passing (`npm run build`, June 2, 2026)  
**Lint:** Failing (`npm run lint`, June 2, 2026) with 4 errors and 9 warnings  
**Deployed:** Yes, auto-deploy on push to `main` via Vercel

### What Works End-to-End

- Logged-out landing page at `/`
- Email/password login and signup
- Role selection during email signup
- RolePicker safety net for null-role profiles
- Full solo tracking: nutrition, weight, cardio, steps, charts
- Full coach-client workflow: invite, accept, targets, compliance, reports, messaging, check-ins
- Existing solo → client conversion through invite flow with data preserved
- Client → solo offboarding from either coach or client side
- Computed lock mechanic with coach unlock and 48-hour grace window
- AI weekly report and AI call prep briefing
- Copy food from another day
- Barcode scan serving-size handling
- Data export and delete account
- Mobile responsive dark UI
- Strong password policy
- Private notes with timestamped append

### Lint Details

Current lint errors:

- `src/pages/Log.jsx`: unused `session` prop
- `src/pages/Log.jsx`: React hook `set-state-in-effect` errors around `setFeedback` and macro recalculation effect
- `src/pages/Profile.jsx`: React hook/compiler error for `fetchTargets` accessed before declaration

Current lint warnings:

- Hook dependency warnings in `BarcodeScanner.jsx`, `Toast.jsx`, `ClientView.jsx`, `CoachDashboard.jsx`, `Dashboard.jsx`, `Log.jsx`, and `Profile.jsx`

### Build Warning

Vite build passes but reports one large JS chunk over 500 kB. This is not currently blocking.

---

## Open Issues / Known Bugs

| Issue | Status |
|---|---|
| `coach_messages` stale references in CoachDashboard/ClientView | Needs migration to unified `messages` table or removal |
| `npm run lint` fails | Needs cleanup in Log/Profile plus hook dependency warnings |
| Offboard notice may show twice | Cosmetic; deferred |
| Chart.js Filler plugin warning | Cosmetic; deferred |
| Resend email only delivers to account owner | Needs domain verification |
| Google OAuth removed | Deferred; needs re-architecture before re-enabling |
| Account linking | Deferred to settings page |

---

## Roadmap (Priority Order)

### Immediate / Revenue-Blocking

1. **Stripe integration** — coaches cannot be charged yet
2. **Email domain verification (Resend)** — notifications currently limited
3. **Terms of Service + Privacy Policy** — required before charging money

### Near-Term

4. Fix stale `coach_messages` references
5. Fix lint errors
6. Beta coach outreach with 2–3 free coaches
7. Google OAuth re-architecture and production verification
8. Account linking in settings

### Later

9. Apple OAuth
10. Workout programming, only after nutrition coaching is validated
11. Branded mobile app

---

## Development Environment

- **Local:** Mac arm64, Node v22
- **Dev server:** `localhost:5173`
- **LAN access:** `npm run dev` with `server: { host: true }` in `vite.config.js`
- **Deploy:** `git push` to `main` → Vercel auto-deploys
- **Edge Functions:** `supabase functions deploy <function-name>`; Docker not required
- **SQL migrations:** Run directly in Supabase SQL Editor

### Key Commands

```bash
npm run dev
npm run build
npm run lint
git add . && git commit -m "..." && git push
supabase functions deploy <name>
```

---

## Supabase Config Notes

- `profiles.role` must have no default
- `messages` needs authenticated SELECT/INSERT/UPDATE/DELETE grant
- `messages` RLS insert/update needs `WITH CHECK`
- `profiles` anon SELECT is required for invite email lookup
- `coach_clients` supports `pending`, `active`, and `offboarded`
- `coach_clients.lock_cleared_at` powers coach unlock grace window
- `coach_clients.offboarded_at` powers offboard notice and history
- `reports.week_of` is a `date`, not text
- `weight_log.weighed_at` is a `time`

---

## Design System

All app colors use CSS variables in `index.css`:

- `--color-bg`
- `--color-surface`
- `--color-border`
- `--color-text`
- `--color-muted`
- `--color-primary` = `#4f8ef7`
- `--radius`

Dark theme throughout. No light mode.

Chart colors:

- Weight / primary blue: `#4f8ef7`
- Cardio purple: `#a78bfa`
- Steps green: `#34d399`
- Calories yellow: `#fbbf24`

---

## Session Update — June 1–2, 2026 (~commits 79–85)

### Completed

**Landing Page**
- Built full marketing page for logged-out `/`
- Added parallax fixed background UI cards
- Added sections for hero, problem, features, how it works, pricing teaser, footer
- Wired logged-out `/` to Landing instead of redirecting to `/login`

**Messaging Refactor**
- Replaced main coach/client thread with unified `messages` table
- Added chronological shared thread, sender-based bubbles, auto-scroll, 400px max height
- Old `coach_messages` and `client_messages` were dropped in Supabase, but stale lookups remain for reactions/consistency

**Weekly Date / Check-in Fixes**
- Added local-date `getCurrentWeekSunday()`
- Fixed weekly report range to previous Sunday through Saturday
- Passed explicit `weekRange` to `weekly-report`
- Added red client check-in "To do" badge
- Required all weekly check-in fields
- Added coach-side Realtime subscription for check-ins

**Log Improvements**
- Added copy-food-from-another-day panel
- Added selectable entries and select-all support
- Clarified steps distance placeholder as miles
- Added 12-hour display for `weighed_at`

---

## Session Update — June 2, 2026 (~commits 86–98 local HEAD)

### Completed

**Lock Mechanic**
- Implemented computed lock in Dashboard, ClientView, and CoachDashboard
- Lock engages after 3 days without nutrition logging
- Auto-unlocks after 10 days total
- Coach unlock writes `lock_cleared_at`
- Coach unlock creates 48-hour grace window
- Lock hides client target progress and charts but never blocks logging
- CoachDashboard shows locked badge
- ClientView shows unlock button when locked

**Barcode Serving Size Fix**
- Added serving-based mode for Open Food Facts products with `_serving` nutrients
- Preserves label serving like `1 serving = 30g`
- Allows fractional servings like `1.5`
- Keeps 100g fallback for products without serving nutrient data

**Solo ↔ Client Conversion**
- Coach invite flow now checks existing profile and relationship state before sending
- Existing solo accounts can be invited with confirmation
- Existing coach/client conflicts are blocked
- Duplicate pending invites are blocked
- Join flow supports existing session, existing account login, and new client signup
- Accepting invite sets profile role to `client`, upserts relationship, and marks invite accepted

**Offboarding**
- Added `offboard-client` Edge Function
- Added `offboard-self` Edge Function
- Coach can offboard from ClientView
- Client can leave coaching plan from Dashboard
- Offboarded users become `solo`; historical data is preserved
- Added localStorage-driven offboard notice banner

**Onboarding Cleanup**
- Login signup blocks duplicate profile emails
- Email signup writes profile with selected role immediately
- App only shows RolePicker when `profile.role` is null
- Removed Google OAuth UI/handlers for now
- Simplified RolePicker and added Back button

### Schema Changes

- Added `coach_clients.lock_cleared_at`
- Added `coach_clients.offboarded_at`
- Updated `coach_clients.status` constraint to include `offboarded`
- Added/required policies and grants for coach update, client insert, service role offboarding, and anon profile email lookup

---

*Update this document after each significant development session.*
