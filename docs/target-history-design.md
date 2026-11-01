# Target history — design and implementation plan

Status: **approved Oct 31 2026 after two review passes (revisions in §7); implementing on `feat/target-history`.** Build-now item 1 in
`Ai-context/feature.md` (Tier 0 of the compliance backlog).

## 1. The problem, verified

`targets` is one mutable row per user (`user_id` unique). Every grader reads that
row and applies it to every past day:

| Grader | File | Window |
|---|---|---|
| Consistency card | `utils/complianceSummary.js` | 90 d |
| Weekday/weekend breakdown | `utils/complianceBreakdown.js` (+ `calorieDayOnTarget`) | 90 d |
| Heatmap cells + tooltips | `components/ComplianceHeatmap.jsx` | 13 wk |
| Roster "x/7 days on target" (calories, protein, cardio, steps) | `utils/clientStats.js` | 7 d |
| Check-in week strip "% of target" | `hooks/useCheckinWeekCells.js` | 1–8 wk |
| Bar colours + dashed target line | `utils/metricBarChart.js` | chart range (up to 1 yr) |
| Coach weekly digest email | `supabase/functions/weekly-digest` | 7 d |

So when a coach moves a client from 2,100 to 1,800 cal, the last 90 days get
regraded against 1,800, and a client who was on target all quarter becomes "over"
retroactively. The record changes when a field changes, which means it isn't a record.

## 2. Decisions to confirm (my recommendation first)

1. **A change applies from the day it's made, forward.** No backdating in v1, so
   "the plan changed Monday, I'm typing it Wednesday" grades Mon–Tue on the old plan.
   That's honest, because the client was eating against the old plan on those days.
2. **Several edits on the same day collapse into one version.** Today is still in
   progress, so regrading it is fine. The last edit of the day wins.
3. **Legacy rows cover all past days.** At deploy, each existing `targets` row
   becomes a version effective from `1970-01-01`. Grades don't visibly change on
   ship day; history only starts diverging at the first edit after deploy.
   (The alternative, leaving pre-deploy days ungraded, would blank every
   existing heatmap.)
4. **A user's FIRST version reaches back to the beginning** (`effective_date = 1970-01-01`).
   Days before any plan existed are graded against the first plan, which is what
   happens today, and the backfill is the same rule rather than a special case.
   (Revised in pass 1, see §7.)
5. **Only graded fields are versioned:** calories, protein, carbs, fat,
   cardio_minutes, steps. `weight_goal` is a destination, not a daily grade, and
   stays current-only. An edit that touches only the weight goal creates no version.

## 3. Architecture

```
 writers (unchanged call sites + one new field)        readers
 ─────────────────────────────────────────────        ────────────────────────────
 Profile.jsx  ─┐                                       Log / TodayPanel / editors
 ClientView.jsx├─ upsert targets {..., effective_date} ──► targets   (today = current row,
 Onboarding.jsx┘            │                                          untouched)
                            │ AFTER INSERT/UPDATE/DELETE trigger
                            ▼ (security definer, the only writer)
                     target_versions ───────────────────► targetHistory.js
                     (user_id, effective_date) unique       makeTargetLookup(versions)
                                                            → (dateStr) => targets | null
                                                          graders take target | (date)=>target
```

`targets` stays the current plan, so the 15 read sites that only want "today"
don't change. History is a side table that only a trigger can write.

### 3.1 Schema — migration `20261101000000_target_versions.sql`

```sql
alter table public.targets add column if not exists effective_date date;

create table public.target_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_date date not null,
  calories int, protein int, carbs int, fat int,
  cardio_minutes int, steps int,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, effective_date)
);
create index on public.target_versions (user_id, effective_date desc);
```

The extension point for build-now #2 (per-weekday targets) is a later
`day_overrides jsonb` column on both `targets` and `target_versions`, which the
same resolver applies after it picks the version. Nothing in this design has to
be undone to add it.

### 3.2 The trigger is the only writer

`targets_record_version()`, `security definer`, `set search_path = public`:

- **On INSERT/UPDATE:** if `TG_OP = 'UPDATE'` and none of the six graded columns
  changed (`IS NOT DISTINCT FROM`), do nothing. Otherwise upsert into
  `target_versions` on `(user_id, effective_date)` with the six values and
  `set_by = coalesce(auth.uid(), new.updated_by)`.
- **The effective date** is `new.effective_date`, clamped to `utc_today` when it is
  null or outside `utc_today − 1 … utc_today + 1`. If the user has no version yet,
  it is `1970-01-01` (decision 4).
  Writers send their *local* today (`toLocalDateString()`), because
  `logged_date` is client-local and the server has no user timezone (the same
  trap `20261019150000_logging_identity` documents).
- **Anti-backdating guard = the clamp.** The ±1-day window covers every real
  timezone. Without it, any writer could pass `effective_date = '2026-01-01'` and
  rewrite history, which is exactly what this table exists to prevent. Clamping,
  not raising, because a stale stored value (onboarding's weight-goal-only update
  doesn't send one) must not fail a save. Seeds that want a past plan change
  insert `target_versions` directly as `service_role`.
- **No DELETE trigger.** Nothing in the app deletes a `targets` row except erasure
  and seed scripts.
- The trigger is `AFTER`, so a write rejected by the `targets` RLS policies
  (`client_plan_locked`) never reaches it.

### 3.3 RLS and grants

- `alter table target_versions enable row level security`.
- SELECT for the owner (`auth.uid() = user_id`), and for the **active** coach
  (same `coach_clients … status = 'active'` predicate as the targets coach
  policy from `20260615000100`).
- **No INSERT/UPDATE/DELETE policy for `authenticated`.** Only the definer
  trigger and `service_role` write.
- `grant select on target_versions to authenticated; grant all … to service_role`.
  Explicit grants are required: per the roadmap gotcha, pooler-created tables
  don't get default privileges, and the erasure loop silently no-ops without
  `service_role` DML.
- Backfill in the same migration:
  `insert … select user_id, '1970-01-01', calories, … from targets where user_id is not null on conflict do nothing`.

### 3.4 The resolver — `src/utils/targetHistory.js` (pure, tested)

```js
// versions: rows for ONE user, any order. Returns (dateStr) => version | null.
export function makeTargetLookup(versions) { /* sort asc by effective_date;
  return the last version with effective_date <= dateStr, else null */ }

// Graders accept either a number (legacy/current) or a lookup.
export function targetFn(target, key = 'calories') {
  if (typeof target === 'function') return (d) => Number(target(d)?.[key]) || 0
  const n = Number(target) || 0
  return () => n
}

export async function fetchTargetVersions(supabase, userIds) { /* select user_id,
  effective_date, calories, protein, carbs, fat, cardio_minutes, steps
  .in('user_id', userIds) — tiny: one row per change-day */ }
```

A `targetFn` that accepts a plain number keeps every existing caller and test
valid while each one migrates, so the change can land grader by grader.

### 3.5 The graders

| File | Change |
|---|---|
| `complianceSummary.js` | `target` → `t = targetFn(calorieTarget)`; per-day `t(dateStr)`. A day with no target counts as logged-but-ungraded (today's `!target` branch, per day). |
| `complianceBreakdown.js` | Same. **Also fix `avgCal`**: it's computed as `target + avg deviation`, which only holds for a constant target. Compute it as `sum(cal) / logged`. |
| `ComplianceHeatmap.jsx` | Per-cell target; weekly-grain tooltip averages each day's own target. |
| `clientStats.js` | Roster 7-day loop resolves the target per date (all four metrics) from versions fetched alongside `targets`. |
| `useCheckinWeekCells.js` | "% of target" = Σ logged calories / Σ that day's targets, over logged days. |
| `chartRange.js` `bucketHistory` | Optional `targetFor`: each row gets `target` (daily = that day's; Y view = mean of the logged days' targets in the month). |
| `metricBarChart.js` + ClientView `calorieChartData` | Use `row.target ?? target`. Bar colour per row, and the dashed line becomes **stepped** with `spanGaps`, so the coach sees when the plan changed. No new UI. |
| `weekly-digest` (Deno) | Fetch versions; same tiny resolver duplicated in `_shared/targetHistory.ts` (functions can't import `src/`), and that file gets its own unit test. |
| Untouched | `todayCells`, Log, TodayPanel, editors, `energyBalanceRead` (compares the *current* plan with empirical maintenance, so current is the right input), NotificationCenter. |

Call sites (`ClientView`, `Dashboard`, `CoachDashboard`) fetch versions next to
`targets` and pass `makeTargetLookup(versions)` in place of `targets.calories`.
After a successful target save in ClientView/Profile, they refetch versions.
**Fail soft:** if the versions fetch errors (for example, migration not yet
applied), fall back to the current number and `console.error`, so a missing
table degrades to today's behaviour instead of a blank page.

### 3.6 Writers

`Profile.jsx` (save), `ClientView.jsx` (`saveClientTargets`) and `Onboarding.jsx`
(both upserts) add `effective_date: toLocalDateString(new Date())`. That's four
lines.

### 3.7 The rest of the data lifecycle

- **Erasure:** add `target_versions?user_id=eq.${uid}` to the `delete-account`
  loop (cascade covers it too, but the architecture rule is explicit deletion).
- **Export:** add `target_versions` to the Profile data export (portability is a
  compliance promise). Update `compliance/data-map.md`.
- **Demo data:** `seed-demo-roster.mjs` and `seed-hero-roster.mjs` seed one plan
  change ~3 weeks back for 2–3 clients, so the stepped line and the regrading
  are visible. **`sandbox-fill.sql` must date-shift `target_versions.effective_date`**,
  or seeded history stays parked on the frozen anchor (the known walkthrough trap).

## 4. Verification plan

1. **Unit** (`vitest`): `targetHistory.test.js` (before first version → null,
   exact date, between versions, unsorted input, number passthrough); extend the
   summary/breakdown/clientStats/metricBarChart tests with a mid-window change,
   including the `avgCal` fix.
2. **RLS/integration** (`npm run test:rls`, new `tests/rls/target_versions.test.js`):
   upsert creates a version; same-day edits collapse; weight-goal-only edit creates
   none; backdated `effective_date` is rejected; client cannot insert/update/delete
   `target_versions`; active coach reads, offboarded coach doesn't; a locked
   client's rejected targets write leaves no version; delete writes a null version;
   erasure removes rows.
3. **Visual** (local stack + `seed-demo-roster`, `scripts/shoot.mjs`): ClientView
   heatmap, breakdown, roster and calorie chart for a client with a mid-window
   change, desktop and 390px, both themes. Then rebuild the iOS sim (standing rule)
   and take the stack down.
4. `npm run lint` must not rise; `npm run build` must pass.

## 5. Deploy order

1. Apply the migration to prod via the session pooler. **First move the untracked
   `device_*` migrations aside**, since `supabase db push` applies everything in the
   folder. Then `notify pgrst, 'reload schema'` and poll REST until
   `target_versions` answers.
2. Deploy `weekly-digest` and `delete-account`.
3. Merge the frontend (push to main → Vercel). The fail-soft fetch makes an
   out-of-order deploy degrade instead of break, but the order above is the plan.
4. Hosted demo sandbox: only when asked.

## 6. Size and risk

About one session: migration + trigger + tests are the core, and the grader
changes are mechanical. Risks:

- (a) A grader missed. The table in §3.5 comes from a grep of every `targets`
  consumer, re-run before merge.
- (b) Timezone edge at midnight. Bounded by the ±1-day window, and at worst one
  day is graded against the neighbouring version.
- (c) The `avgCal` fix. With a constant target, `target + avg(cal − target)`
  equals `avg(cal)` exactly, so clients with no plan change see no difference.
  Only clients whose plan changed see different numbers, and theirs are the ones
  that were wrong. Tests pin both cases.

## 7. Review log

- **Pass 1:** (a) Seeds insert targets "today" with history behind them, so the
  original decision 4 (ungraded before the first target) would have blanked every
  seeded heatmap. Changed to *first version reaches back*. (b) Raising on an
  out-of-range `effective_date` would fail onboarding's weight-goal-only update,
  where the stored date is stale. Changed to a clamp. (c) The Y chart plots monthly
  averages, so a target looked up on the 1st of the month is wrong. Moved
  per-row targets into `bucketHistory`. (d) Dropped the DELETE trigger, since no
  app path deletes `targets`.
- **Pass 2:** ClientView's own `calorieChartData` duplicates the colour logic and
  takes the same per-row target. Coach switching is fine: history set by coach A
  stays, and B sees what the client was actually graded on. No further issues.
- **Pass 3 (during implementation):** (a) A grader the §3.5 table missed: ClientView's
  correlated "compliance" chart plots calories and cardio as % of target. It now
  reads the lookup per day. (b) `padToWindow` empty slots had no target, so the
  line fell back to today's flat target on empty days. Empty slots now carry
  their day's plan, and a series with per-row targets never falls back.
  (c) `seed-model-client.mjs` deletes and re-inserts targets, so it now clears
  `target_versions` first. (d) Verified on local: Ava's plan cut 2,300 → 2,000
  on Oct 10. The heatmap grades pre-change days amber against 2,300, the calorie
  line steps at Oct 10, and the weekday ring reads 94% (2,057 against an average
  plan of about 2,190) where it read 103% before.

## 8. Not done here (known, out of scope)

- `weekly-digest` counts a calorie day as hit at ≥90% with no upper bound,
  while the app uses the 90–110% band (`calorieDayOnTarget`). That predates this
  work. It's now per-day, but the floor-vs-band mismatch remains.
- Deno type-check of `weekly-digest` wasn't run (no local Deno). The
  `_shared/targetHistory.ts` logic is covered by a parity test against the app's
  resolver.
