# Per-weekday targets — design and implementation plan

Status: **implemented on `feat/day-targets` (Nov 1 2026); seven review passes in §9.** Build-now item 2 in `Ai-context/feature.md`
(Cronometer review). It builds on target history (`docs/target-history-design.md`):
same table, same trigger, same resolver.

## 1. The problem

Coaches prescribe different numbers on different days, most commonly training
days vs rest days, sometimes a weekly refeed. Gardnr has one set of targets per
client, so a client eating to a 2,400 training-day plan on Monday is graded as
120% "over" a 2,000 target. Every Tier 1 compliance number is wrong for any
client on a split plan, and those clients are exactly the engaged ones.

The market convention (Cronometer's Macro Scheduler, MacroFactor's per-day
targets, and the training/rest split coaching apps sell) is **named day types
assigned to weekdays**. We borrow that for familiarity. The deciding question is
the product lens: does it help a coach see who is slipping? Yes. Without it the
grade is wrong for split-plan clients, so the coach can't trust it.

## 2. Decisions (recommendation first)

1. **Base plan + up to 2 day types.** The existing targets are the base
   ("Other days"). A day type has a name (e.g. "Training"), the weekdays it
   covers, and any targets that differ. Three plans in total covers
   training/rest/refeed. More is a spreadsheet, not a plan.
2. **A blank field in a day type means "same as other days"**, not "not
   tracked". Only the numbers that differ need entering, which is how coaches
   think about it ("+400 carbs on training days").
3. **Each weekday belongs to at most one day type.** A day already in the
   other type can't be picked until it is removed there (pass 7; it used to
   move).
4. **Weekly, by calendar weekday.** No rotating cycles (A/B weeks) and no
   one-off dates. Those are separate features if coaches ask.
5. **Versioned with the targets.** Changing a day type is a plan change, so it
   is recorded in `target_versions` from that day like any other change.
   History stays honest.

## 3. Data model — migration `20261102000000_target_day_plans.sql`

```sql
alter table public.targets         add column if not exists day_plans jsonb not null default '[]';
alter table public.target_versions add column if not exists day_plans jsonb not null default '[]';
```

Shape (array, 0–2 items):

```json
[{ "name": "Training", "days": [1, 3, 5],
   "calories": 2400, "protein": 160, "carbs": 280, "fat": null,
   "cardio_minutes": null, "steps": null }]
```

`days` uses 0 = Sunday, the same as JS `getDay()`.

- **Check constraint** `targets_day_plans_valid` (and the same on
  `target_versions`) through an immutable SQL function `valid_day_plans(jsonb)`:
  it must be an array of ≤ 2 objects; `name` a non-empty string ≤ 24 chars;
  `days` a non-empty array of distinct integers 0–6; no weekday in two plans.
  Numeric bounds stay app-side (`checkTargets`), the same as the base columns.
  The resolver ignores anything non-numeric, so a hand-crafted row can only
  confuse its own owner's grades.
- **Trigger** `targets_record_version()` is replaced: `day_plans` joins the
  "did a graded field change" comparison and is copied into the version.
  Everything else in the trigger (clamp, first-version-reaches-back, same-day
  collapse) is unchanged.
- No RLS change. These are columns on tables whose policies already hold, and a
  coached client still can't write their targets.

## 4. The resolver: one place applies the weekday

`src/utils/targetHistory.js` gains:

```js
export const weekdayOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay()

// The plan for one calendar day: the base targets with that weekday's day type
// laid over them (blank fields inherit). Adds `day_type`: the name, or null.
export function resolveDay(plan, dateStr) { ... }
```

`makeTargetLookup` and `constantLookup` return `resolveDay(version, date)`, so
**every grader that already takes a lookup gets weekday targets with no change**:
heatmap, summary, breakdown rings, roster, check-in strip, charts, correlated
chart. `_shared/targetHistory.ts` gets the same function for the weekly digest,
and the parity test covers it.

New helpers in the same file:

- `weeklyAverage(plan, key)` = the mean over the 7 weekdays. Used where a
  single number must stand for the week: the energy-balance read ("logged avg
  vs target") and meeting prep's signal line, which reads from it.
- `targetRange(plan, key)` → `{ min, max }` over the week, for labels.

## 5. Every reader, decided

| Reader | Today | Change |
|---|---|---|
| Graders (heatmap, summary, rings, roster, check-in strip, charts, digest) | lookup | none. The resolver does it |
| Log / TodayPanel (client's day) | `targets` row | `resolveDay(targets, selectedDate)`: a training day shows training targets. Stepping to a past day uses that day's version (the lookup) |
| ClientView "Today's stats" (coach, any day via the stepper) | `clientTargets` form state | `targetOn(viewDate)` |
| ComplianceBreakdown "Target" row | today's number | range when it varies: `2,000–2,400 cal` |
| ClientView rail foot "Daily targets" | base values | base values plus one muted line, "Varies by day", that opens Targets |
| Energy-balance read + meeting prep | `clientTargets.calories` | `weeklyAverage(…, 'calories')` |
| Roster "x/7 on target" | lookup | which metrics are graded = set on the base OR on any day type (a cardio target only on training days was invisible) |
| Weekly digest | lookup | the same "which metrics" rule |
| Log page heading | "Today" / date | a muted line under it with the day type ("Training day") when the day has one |
| ClientView collapsed Targets summary | `2,000 cal` | the range when it varies |
| Profile, coached client (read-only "Set by your coach") | base list | base list + each day type: name, days, and the values that differ |
| Notifications, export, erasure | — | none (`select *` and row deletes already cover the column) |
| `compliance/data-map.md` | — | add day plans to the targets row |

## 6. The editor

One component, `components/DayPlansEditor.jsx`, used by both the coach's form
(ClientView › Targets) and the solo user's own (Profile › Daily targets). The
two forms have diverged before, and the design system's rule is one component,
both sides.

Placement: directly under the base nutrition and activity fields, above weight
goal. Built only from existing primitives (`Field`, `Pill`, `Button`,
`Switch`-row pattern) and the form's existing spacing:

- **Off (no day types):** a ghost `Button` "Different targets on some days".
  This is the same treatment as "Calculate from stats" above it.
- **On:** the base fields get a heading, "Other days". Each day type is a
  group separated by ≥24px of space (A3, no border, no nested panel):
  - `Field` "Name", placeholder `e.g. Training`.
  - Weekday chips `M T W T F S S` (Monday first, as the rings and `ds-chipstrip`
    already are), `Pill` active = in this type. A day held by the other type
    shows that type's name in its `aria-label` and moves on click.
  - The same six `Field`s, placeholder = the base value ("2,000"), so blank
    reads as "same as other days".
  - The macro note ("Macros add up to …") computed on the merged values.
  - Ghost `Button` "Remove".
- "Add another day type" while fewer than 2.
- Footnote under the coach's version: "{First name} sees these but can't change
  them." (the existing sentence pattern).

Validation (`utils/targetChecks.js` → `checkDayPlans(base, plans)`): per type,
`checkTargets` on the merged values; name required; at least one day. Errors
block Save, as the base fields' do. Dirty state compares plans by value.

Size budget: an extra ~360px per day type at 390px wide, nothing when off. No
new tokens, no new colours.

## 7. Implementation order

1. Migration + trigger + check (local DB for the RLS tests).
2. `resolveDay` / `weekdayOf` / `weeklyAverage` / `targetRange` + TS twin + tests.
3. Readers in §5.
4. `checkDayPlans` + `DayPlansEditor` + wire into ClientView and Profile.
5. Tests: unit (resolver, checks, editor helpers), RLS (constraint rejects bad
   shapes, versioning on a day-plan change, a locked client can't write day
   plans), parity.
6. Verification: lint/build/tests; visual check of the editor and the graded
   screens across widths and themes **only with the user's go-ahead** (it needs
   a running app); simulator rebuild.

## 8. Deploy order

Migration first (the user runs `supabase db push --linked --yes`). The editor
always sends `day_plans`, so a save would fail on a database without the
column. Then the `weekly-digest` deploy (it imports `_shared/targetHistory.ts`),
then merge.

## 9. Review log

- **Pass 1:** (a) Roster and digest decided which metrics to grade from the
  base targets only, so a target set just on a day type was never graded. Both
  now take the base or any day type. (b) The collapsed Targets summary showed a
  single number; it shows the range. (c) A client on a training day had no
  reason shown for different targets, so the Log heading gets the day-type
  name. (d) Considered hiding calories inside day types for hide-calories
  clients on Profile; the base display there doesn't hide them either
  (pre-existing, reported separately), so day types match the base display.
- **Pass 2:** Log reads targets once and grades `selectedDate`, so it takes the
  lookup for the selected day; TodayPanel needs no change. AI payloads carry no
  targets except meeting prep's energy line, which uses the weekly average.
  No further issues.
- **Pass 3 (during implementation):** (a) The roster scored every metric out
  of 7 days, so a cardio target set only on training days could never score
  above 3/7. Each metric now carries `days`, the number of the last 7 days that
  had a target for it; `gradeCompliance` and the coach's "targets hit" card use
  that. (b) `valid_day_plans` used AND/OR chains, which SQL doesn't promise to
  short-circuit, so a non-array could raise instead of answering false. It's
  rewritten with CASE guards. (c) "Rest day" would read "Rest day day";
  `dayTypeLabel` leaves a name that already ends in "day" alone. (d) The
  coach's day stepper shows the day type beside it, as the client's Log does.
- **Pass 4 (after a walkthrough):** (a) The client's read-only page listed only
  the numbers a day type changes, so "Rest" looked like a two-target day. It is
  now `components/PlanTable`: one column per kind of day (Other days, then each
  type with its weekdays), all six targets in every column, inherited values
  muted, and a line saying what muted means. The weight goal stays a list,
  since it doesn't vary by day. (b) Blank inherits, so "no target on these
  days" is 0, which the Today screen ("No target") and every grader already
  read that way. The editor says so, the table shows it as "None", and
  `setsAnyDay` no longer counts a 0 as "this metric is graded" (else a 0-only
  metric scored "0/0"). The roster also skips a metric with no target on any
  of the seven days. (c) That page now respects "Hide calories from client",
  matching Today; it didn't before, with or without day types.
- **Pass 5 (editor, from the user's walkthrough):** the stacked editor grew
  ~360px per day type, so it is now one chip strip ("Other days · 2,000",
  "Training · 2,400", "Rest · 1,800", "+ Add day type") with the selected
  day's targets below. The base fields are passed in as the "Other days"
  panel, with "Applies on Tue, Thu" under them. Errors on a type that is not
  selected are named under the strip. "Calculate from stats" moved inside the
  Other days panel, because it fills the regular targets and sat above the
  strip while a day type was selected. Per-target "+" variants were considered
  and rejected: one day would be split across six fields with no single place
  that shows what a Monday is.
- **Pass 6 (from a recorded walkthrough):** (a) A new day type didn't take
  focus: React reused the previous type's Name input, and autofocus only fires
  on mount. Each type's form is keyed to its type now. (b) A just-added type
  showed red "Name this day type" / "Pick at least one day" before the coach
  had done anything. Each prompt now waits until it is the next step. (c)
  `ui/Field` put `borderColor`/`paddingRight` over `controlStyle`'s
  shorthands; React re-applies a shorthand on update and drops the longhand
  ("conflicting property" warning), so the error border could stick or vanish.
  Both are whole shorthands now. This affects every Field in the app.
- **Pass 7 (user decision):** a weekday already in one day type can no longer
  be picked by the other; it used to move there silently, which could empty
  the other type's schedule without the coach looking at it. Taken days are
  disabled chips (labelled "Monday, in Training"), with a line naming them and
  where to free them. Decision 3 in §2 changes from "moves" to "blocked until
  removed from the other type".
