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

## Session Update — June 3, 2026 (~commits 99–140)

### Completed

---

#### Design Sprint

**Inter Font + Type Scale**
- Added Inter from Google Fonts to `index.css`
- Added CSS type scale variables: `--text-xl`, `--text-lg`, `--text-md`, `--text-sm`, `--text-xs`
- Updated `h1` and `h2` global rules to use variables
- Added `letter-spacing: -0.01em` to `h2`
- Body font stack updated to use Inter first

**Stat Cards — Metric Color System**
- Updated `StatCard.jsx` with left accent border using `color` prop
- Value size increased to `2rem`, label tightened to `0.65rem` uppercase
- Added `minHeight: '80px'` for consistent card height
- Metric color assignments:
  - Calories: `#fbbf24`
  - Protein: `#f87171`
  - Carbs: `#e2d5b0`
  - Fat: `#fb923c`
  - Weight: `#34d399`
  - Cardio: `#4f8ef7`
  - Steps: `#a78bfa`
- Colors applied in `Dashboard.jsx` and `ClientView.jsx`
- Steps card spans full width (`gridColumn: '1 / -1'`)

**Chart Color + Opacity System**
- Bar charts (Calories, Cardio, Steps): `backgroundColor` at `0.7` opacity, solid `borderColor`
- Line charts (Weight): `backgroundColor` at `0.15` opacity, solid `borderColor`
- All chart colors updated to match stat card metric colors

**Surface Depth**
- Extracted shared `cardStyle` to `src/utils/styles.js`
- Added `boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)'` to all cards
- Updated CSS variables: `--color-bg: #0a0a0a`, `--color-surface: #141414`, `--color-border: #242424`
- Applied shared `cardStyle` across Dashboard, ClientView, CoachDashboard, Log, Profile, Join, Login, RolePicker

**NavBar**
- Active link detection via `useLocation`
- Active link: `color-text`, `fontWeight: 600`
- Inactive links: `color-muted`, `fontWeight: 400`
- FitLog logo converted from `span` to `Link to="/"`
- Gap increased from `16px` to `24px`
- Logo gets `letterSpacing: -0.02em`

**Compliance Pills — CoachDashboard**
- Pills now use metric identity colors instead of generic red/yellow/green
- Opacity signals compliance level: `1.0` high, `0.75` medium, `0.55` low
- Low compliance pills get subtle colored background fill (`${color}26`) as pre-attentive signal
- Pills suppress entirely when `logged === 0` (no data, not a compliance failure)
- Section only renders when at least one metric has logged data or client is locked

**Log Page Restructure**
- Progressive disclosure: Weight, Nutrition, Cardio+Steps as collapsible sections
- Order: Weight → Nutrition → Cardio+Steps → Entries
- Weight: collapsed when logged (shows summary + edit button), expanded when not logged
- Nutrition: always expanded by default, toggleable
- Cardio + Steps: combined card with separate toggles, both expanded by default
- Cardio sessions always visible regardless of expanded state
- Steps summary always visible regardless of expanded state
- Form collapses after saving; summary persists
- Repeat button (`↻`) on each nutrition entry pre-fills form for new entry
- Serving size prefill removed (starts empty)
- Barcode buttons changed to ghost variant
- Copy + Add entry row right-aligned; Add entry is `size="sm"`
- All primary action buttons right-aligned consistently

**SectionHeader Component**
- Extracted `SectionHeader` from `Dashboard.jsx` into `src/components/SectionHeader.jsx`
- Imported in Dashboard, ClientView, and Log
- Consistent `▶`/`▼` toggle with animated grid-row collapse

**Profile Page Restructure**
- Renamed "Change password" to "Security"
- Merged Export + Delete into one "Data" card with divider
- Account info labels use uppercase muted style
- Dangerous actions (delete) stay red but share card with export

**CoachDashboard Polish**
- Summary stat cards use uppercase muted labels, `2rem` bold numbers
- Removed "Your clients" section heading
- Client cards: `gap: 16px`, name `fontWeight: 700`, email `--text-xs`
- "View data →" changed to `variant="ghost"`
- Obstacles section has its own label + separated block
- EmptyState emoji removed

**Button Hover**
- Added `filter: brightness(1.12)` on hover in `Button.jsx`
- CSS `.btn:hover` updated to match

**Emoji Cleanup**
- Removed emojis from exercise types, empty states, barcode buttons, export button, role picker
- Kept message reaction emojis (user-generated), checkmarks, streak milestone emojis
- Exercise type emojis removed entirely (no accurate icons available; clean text preferred)

**Spacing Rhythm**
- Added spacing variables: `--space-xs`, `--space-sm`, `--space-md`, `--space-lg`, `--space-xl`
- All page-level wrappers confirmed at `gap: 24px`
- Internal card gaps standardized: `16px` between sections, `12px` between form fields, `8px` tight groupings

---

#### Features

**Hide Calories Toggle (Coach per Client)**
- Added `hide_calories BOOLEAN DEFAULT false` to `coach_clients`
- Toggle in ClientView targets section
- When enabled: hides calories StatCard, progress bar, chart, and entry calorie display on client Dashboard and Log
- Logging form still shows calories input (coach needs data even when client doesn't see it)
- `fetchLockState` in Dashboard also fetches `hide_calories`
- `Log.jsx` fetches `hide_calories` independently for entry row display

**Nudge Mechanic**
- Added `last_nudged_at TIMESTAMPTZ` to `coach_clients`
- New edge function `nudge-client`:
  - Verifies coach owns active relationship
  - Enforces 48-hour cooldown via `last_nudged_at`
  - Sends Resend email: subject "Your coach is thinking of you"
  - Updates `last_nudged_at` on success
- Nudge button on CoachDashboard client card (only when `daysSinceLog >= 2`)
- Nudge button on ClientView header (gated by computed `daysSinceLog`)
- In-app nudge banner on client Dashboard (dismissible, localStorage key per nudge timestamp)
- Cooldown feedback shown to coach if nudged within 48 hours

**notify-checkin Edge Function**
- Replaced starter function with full Resend email handler
- Sends email to coach when client submits weekly check-in
- Payload: `coachEmail`, `coachName`, `clientName`, `adherence`, `energy`, `obstacles`, `notes`
- Deployed and tested end-to-end

**coach_messages → messages Migration**
- Fixed stale `coach_messages` reference in `ClientView.jsx` line 650
- Changed to unified `messages` table

**Offboard Card Redesign**
- Moved "Offboard client" from ClientView header to bottom card
- Renamed section to "Coaching" (neutral, matching client-side)
- Red styling only on the button, not the card border
- Matches client-side "Leave coaching plan" card pattern

**Domain Setup**
- Purchased `tryfitlog.com` on Namecheap
- Connected to Vercel (A record + CNAME)
- SSL provisioned automatically
- Live at `https://www.tryfitlog.com`
- Supabase redirect URLs updated
- Resend domain verified with DKIM + SPF + DMARC records
- `notify-report` updated: sender changed from `onboarding@resend.dev` to `noreply@tryfitlog.com`
- `notify-report` CTA link updated from `fitlog-sepia.vercel.app` to `https://www.tryfitlog.com/login`

---

#### New Edge Functions

| Function | Purpose |
|---|---|
| `nudge-client` | Coach nudges inactive client; enforces 48hr cooldown; sends Resend email; updates `last_nudged_at` |
| `notify-checkin` | Sends email to coach when client submits weekly check-in |

---

#### Schema Changes (June 3, 2026)

```sql
ALTER TABLE public.coach_clients ADD COLUMN IF NOT EXISTS hide_calories BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.coach_clients ADD COLUMN IF NOT EXISTS last_nudged_at TIMESTAMPTZ;
```

---

#### New Utilities

| File | Purpose |
|---|---|
| `src/utils/styles.js` | Shared `cardStyle` object with surface, border, radius, shadow |
| `src/utils/lockState.js` | Extracted `resolveLockState` pure function, shared across Dashboard/ClientView/CoachDashboard |
| `src/utils/dateHelpers.js` | Extracted all date helpers from component files |
| `src/utils/inviteValidation.js` | Extracted `getInviteBlockReason` pure function |
| `src/components/SectionHeader.jsx` | Extracted collapsible section header with animated toggle |

---

#### Unit Tests

48 tests passing across 4 test files:

| File | Tests | Coverage |
|---|---|---|
| `lockState.test.js` | 15 | Active, locked, auto-unlock, coach-unlock, grace expiry, never logged |
| `passwordValidation.test.js` | 7 | Length, uppercase, lowercase, digit, symbol rules |
| `dateHelpers.test.js` | 19 | Formatting, week calc, range, boundary crossing |
| `inviteValidation.test.js` | 7 | All block reasons |

---

#### Known Issues Added

| Issue | Status |
|---|---|
| Large Vite JS chunk warning (>500kB) | Deferred |
| Offboard notice may show twice | Cosmetic, deferred |
| `npm run lint` 4 errors / 9 warnings | Pre-existing, deferred |

---

### Current Commit Count
~140 commits

### Updated Roadmap Priority
1. ToS + Privacy Policy (required before charging)
2. Stripe integration (revenue gate, implement with `BILLING_ENABLED = false` flag for beta)
3. Beta coach outreach (3–5 free coaches, founding rate offer)
4. Weekly coach digest email (feature #12 from master doc)
5. Client compliance heatmap (feature #11)
6. Fix lint errors
7. Google OAuth re-architecture
8. Account linking in settings

### New DB Columns Summary (June 3)
- `coach_clients.hide_calories` — boolean, coach toggle per client
- `coach_clients.last_nudged_at` — timestamptz, nudge cooldown tracking

### Design System Updates
- Inter font added
- Type scale variables: `--text-xl` through `--text-xs`
- Spacing variables: `--space-xs` through `--space-xl`
- Metric color system established and used consistently across stat cards and charts
- Shared `cardStyle` in `src/utils/styles.js`