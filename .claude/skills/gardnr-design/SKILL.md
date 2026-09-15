---
name: gardnr-design
description: Gardnr's design system — tokens, type ramp, UI primitives, and the specific patterns that have been rejected before. Load this BEFORE writing or changing any UI in this repo (JSX styles, CSS, a new component, a new screen, a card, a banner, a badge, an icon, a chart). Also load it when asked to "polish", "clean up", "make it look better", or when a change adds any color, font size, spacing, border, or icon.
---

# Gardnr design system

Gardnr is a dark-first fitness tracker for coaches and their clients. The design
system is real and enforced — `eslint.config.js` fails the build on raw hex
colors and raw font sizes in `src/`. Treat this file as the reasoning behind
those rules.

## The first rule: find the existing pattern, don't invent one

Before adding **any** new UI element, find how the app already presents that kind
of thing and copy that exact treatment. This is the single most repeated piece of
feedback on this repo. Invented or default-looking patterns read as "AI design"
and get rejected.

Concretely: grep for a sibling — another status pill, another notice card,
another empty state — and mirror it. `git log -p` on the component that already
does it is usually faster than reasoning from scratch.

## Rejected patterns — do not produce these

0. **The em dash in UI copy.** In a two-clause UI string it is a full stop
   wearing a costume ("Something went wrong — try again." → "Something went
   wrong. Try again."); introducing a list, it's a colon. Long-form legal prose
   keeps them. Demo/seed fixtures must read like real records — clients are
   named "Hugo Bennett", never "Hugo — 5 days quiet".


These have each been sent back more than once. They are not stylistic
preferences; treat them as broken output.

1. **The colored left-edge accent bar.** `borderLeft: '4px solid <color>'` or
   `borderLeftWidth: '4px'` on a card, banner, or notice. This is the #1 rejected
   tell — described as "that AI-generated look with the one side colored edge."
   Rejected on the ClientView status card, the Dashboard first-run welcome card,
   and the coach-nudge card. **Never use it.**

   Instead: a clean card (uniform `--color-border`, no edge), with the brand
   color carried by a monochrome SVG icon and the CTA button.

2. **Flat left-border info banners for status.** Status, triage, and
   "needs attention" are a **tinted pill**, never a banner. The pattern, from the
   CoachDashboard roster and the ClientView "Locked" pill:

   ```js
   display: 'inline-flex', gap: 7, padding: '4px 12px', borderRadius: 999,
   background: 'color-mix(in srgb, <tone> 15%, transparent)', // or var(--color-bg) for green
   border: '1px solid <tone>', color: '<tone>',
   // plus a 7px dot
   ```
   `<tone>` is `--color-error` / `--color-warning` / `--color-success` by level.

3. **Emoji as icons.** 🧮 🔖 ✅ have all been rejected. Icons are **monochrome
   feather/line SVG with `stroke="currentColor"`**, matching the nav rail and
   save-icon glyph style. (Emoji already in the streak card are a pre-existing
   decorative exception, not a precedent.)

4. **Bespoke one-off styling** where a primitive exists. See below.

## What IS wanted

- **A uniform tint on a notification / action card** — `background:
  var(--color-primary-dim)` (12% green). "Slightly green" is right; just never
  via an edge.
- **Amber, not red, for a recoverable "paused / needs attention" state** — clean
  card + `var(--color-warning-dim)` + an amber-stroked SVG glyph. Red
  (`--color-error`) is too alarming for something the user fixes by acting.
- **Gradients only on streak and milestone cards.**
- **The growth motif** (leaf, laurel) on milestones, streaks, empty states and
  celebrations — not on every screen.

## The layout layer — six rules

The token layer (color, type) was never the problem; the layout layer was. These
six rules are what stop screens reading as "assembled". Measured before the rule:
71% of every bordered container on the roster sat inside another bordered
container, and ClientView carried 8 distinct paddings.

### 1. Three surfaces. A Panel never contains a Panel.
- **page** — no border, no background. Sections separated by space + a heading.
  A page-level headline (the roster's triage line) is NOT a card.
- **panel** (`ui/Panel`) — the ONLY element that draws a border. One per logical
  group.
- **row** (`ui/Row`) — a record inside a Panel. No border, no background, no
  radius; a hairline divider between rows and none after the last.

Maximum nesting depth is **1**. Form controls (input/button/select) carry their
own borders and don't count — they are controls, not surfaces.

### 2. Two densities, and no third.
`Panel density="compact"` → `12px 16px`, for repeating surfaces (rosters, stat
rows, lists). `density="comfortable"` → `20px 24px`, for things people type into
or read (forms, settings, prose). Every panel declares one.

### 3. Spacing carries grouping; borders are the fallback.
`--space-*` only. **≤12px within a group, ≥24px between groups.** Evenly spaced
layouts read flat, randomly spaced ones read sloppy — the contrast is what makes
structure visible without drawing it. Every border is an admission you couldn't
group it with space.

### 4. Three status shapes. "Pill" stops meaning everything.
- **Status text** — the DEFAULT for row status. Plain coloured text, weight 700
  for red/amber and muted 500 for green. No container, no dot. It aligns down a
  column, which a pill never does, and the label ("5 days no log", "Logged
  today") already carries the meaning, so colour only reinforces it.
- **`Badge`** — ONE fact, two words max, and only where a container earns its
  keep. `tone="strong"` for a primary signal, `soft` for supporting evidence,
  `solid` for counts.
- **`StatCell` strip** — several facts about one subject: mono uppercase label
  over a tabular value, hairline divider between cells. A pill holding four
  dot-separated facts is a table in a costume.
- **`Tracker`** — anything over time. Seven cells, oldest left.

**If it carries more than one fact, it is not a Badge.**

**NEVER a coloured pill with a dot inside it.** Rejected outright — it is the
single most recognisable AI-dashboard tell, and the dot never says anything the
label hasn't. `Badge` has no `dot` prop; don't add one back, and don't hand-roll
the shape. The same goes for legend dots beside a number: colour the number.

### 5. Color lives in the data; chrome stays neutral.
Borders, dividers, panel backgrounds, resting icons and labels take neutral
tokens ONLY. Metric tokens go on the number; semantic tokens go in the status
cell; green is the only action color. **Never color an entire card border to
signal state** — state belongs in the row's status cell, at a consistent
x-position where it scans in one pass.

### 5b. Grid columns are declared ONCE, never per row.
Every `<Row>` is its own CSS grid, so an `auto` or content-sized column resolves
against THAT row's content. A roster where some rows have an extra button will
silently misalign every column to its left. **Give every column a fixed width**
(or define one grid on the container) so the layout is identical on every row.
This is the bug that made the first roster's status column jump around.

### 5d. A column header names what the column HOLDS — and a sort must show its key.
**If the reader can re-sort by a value, that value has to be on screen.** The
roster once let a coach sort by Compliance while the column kept showing
attention reasons: ordering by a number that was never visible, so the order
looked arbitrary.

The fix generalises. The chips are **lenses**, not sort orders: picking one
re-sorts the roster AND retargets the status column, so the column always
reports the key the rows are ordered by, and the header renames itself
(`LENS_HEADERS`). Logic lives in `src/utils/rosterStatus.js`, not the view.

| Lens | Column shows | Grey when |
|---|---|---|
| Attention | the client's WORST dimension, named | no targets set |
| Compliance | `11/14 days on target` | no targets, or nothing logged |
| Last logged | `Logged today` / `3 days ago` | — |
| Check-in | `Not submitted` / `Awaiting your review` / `Reviewed` | — |

**Attention is the roll-up lens**, not a fourth peer. It is built out of the
other three: `gradeLogging`, `gradeCompliance` and `gradeCheckin` each return
`{ text, tone }`, the lenses render one of them, and Attention renders the
WORST. It therefore cannot drift from the lens a coach switches to. Every
dimension grades red/yellow/green:

| Dimension | red | yellow | green |
|---|---|---|---|
| Logging | never, or 4+ days, or locked | 2–3 days | today / yesterday |
| Compliance | < 3/7 of target days | < 5/7 | 5/7+ (grey with no targets) |
| Check-in | not submitted | submitted, unreviewed | reviewed |

Reasons are ordered worst-tone-first, so `reasons[0]` — what the badge shows —
is always the client's worst dimension, and a grey setup gap never outranks a
client who is actually slipping.

**Sorting uses the grade the column renders** (`TONE_RANK`), never a parallel
calculation. They had drifted: compliance sorted by descending score and Last
logged by ascending days, so both put the HEALTHIEST client on top while the
header said worst-first. One `TONE_RANK` comparison with a magnitude tiebreak
makes the order and the colours agree by construction.

Direction is a **semantic** toggle — worst-first / best-first, not asc/desc,
because "ascending" is meaningless for a column reading "Never logged". The
column header is the control (a real button, feather chevron: down = worst
first, up = best first) and switching lens resets to worst-first, since a new
lens is a new question. The other three each
report one dimension for every client; Attention reports the WORST dimension
per client and names it, so it never just echoes Last logged. Any dimension can
reach red — a client who logs faithfully and hits 0/14 targets outranks one who
has been quiet three days, which the old logging-only red got backwards.
Compliance is reported in aggregate there ("4/14 days on target"), never
per-metric: a column showing a different metric for every client cannot be read.

The column holds different kinds of fact under this lens, so it is labelled
**Needs attention** rather than "Status": a header must not promise a uniform
dimension it doesn't have. Under every other lens each cell answers the
same question, and the column is comparable top to bottom.

### 5d-bis. A generic column label papers over a real problem.
"Status" implies one uniform dimension the reader can compare down the page. The
roster's column holds `reasons[0]` — the single most pressing fact about a
client, of whatever kind: logging recency, a missed check-in, weak compliance,
or a setup gap. Four different questions in one column, which is right for
triage and wrong for a header that promises a metric. It is called **Needs
attention**, which is what it is.

The test: if two cells in a column answer different questions, the header must
say so — or the column should be split. Don't let a generic label paper over it.

Reason strings must also name their own unit. "Calories 0/7" never said 0 of 7
WHAT; it is "Calories 0/7 days".

### 5a. Colour is a grade. Grey is the absence of one.
The rule that keeps the roster from becoming a rainbow: **colour encodes a
graded state; grey encodes that no grade exists.**

| Tone | Means | Example |
|---|---|---|
| red | graded, intervene now | `Never logged`, `4 days no log` |
| amber | graded, watch this client | `2 days no log`, `No check-in` |
| green | graded, fine | `Logged today` |
| **grey** | **nothing to grade against** | `No targets set` |

`No targets set` is grey because there IS no target — no scale, no performance
to colour. Painting it amber would put "the coach hasn't finished onboarding"
on the same visual footing as "this client is slipping", and would leave amber
meaning three different things at once.

This is why `attentionLevel` returns BOTH `level` and `tone`. They differ on
purpose: `level` is severity (drives sorting and the roster counts, so a setup
gap still ranks for attention instead of sinking to the bottom with the greens),
`tone` is how it is painted. Severity and grade-ability are different questions.
Setup reasons live in `SETUP_REASONS`.

Green must NOT share grey. They collided once: `green` and `setup` were both
`--color-muted`, so a healthy client and an unconfigured one looked identical
and the whole distinction existed only in the code.

**The roster deliberately has no 7-day tracker.** It was tried and removed:
seven cells needed an axis label, then per-cell tooltips, then arithmetic, to
say something the status text already says in a phrase. A tracker is the right
shape when the SHAPE of a series is the point (ClientView's compliance grid);
on a triage row, where the question is "who needs me now", it cost more reading
than it gave. If you add one anywhere, it needs an axis — a strip where the
reader cannot tell which end is now is decoration.

### 5a. Semantic colour has a rule, or it is decoration.
Never introduce a colour on a control without stating what governs it. For a
banner CTA (a headline count that names work the coach owes), tone answers one
question: **what happens if this is ignored?**

| Tone | Meaning | Example |
|---|---|---|
| `primary` green | Routine. It piles up; nothing breaks. | check-ins to review |
| `warning` amber | Blocked. Cannot be measured or acted on until fixed. | a client with no targets |

**There is no red banner CTA, deliberately.** Red means a CLIENT is in trouble.
A coach's own to-do list must never shout louder than a person who has stopped
eating — otherwise "4 clients need targets" out-ranks "Hugo, 5 days no log" on
the same screen. Red belongs to roster rows.

**Tone does not escalate with count.** Ten missing targets is the same KIND of
problem as one, so it stays amber and the number does the work. Two channels,
no overlap: **the number carries volume, the tone carries kind.** Escalating by
count would let a pile of admin outrank one failing client.

**Order is fixed** (routine, then gaps), not sorted by count — a bar you read
daily should not move. **Zero renders nothing**; a CTA never says "0". Plurals
are written per call site ("1 client needs" / "3 clients need").

### 5b-ii. No native `title` tooltips on designed surfaces.
The browser's `title` renders an OS-styled grey box in the system font, after a
fixed delay, unthemeable — the one element on screen that is not yours. It
breaks a dark UI completely.

- If the state is already visible (a chevron showing sort direction), the hint
  is redundant. **Delete it.** Keep `aria-label` for screen readers; it renders
  nothing.
- If the hint carries information nothing else shows, use the app's own portaled
  bubble (`InfoTip` / `.info-tip-bubble`), which is token-styled.

Also: a control inside a grid stretches to its cell. Give it `justify-self:
start; width: fit-content` or its hover fill runs the full column width and
reads as a stray block.

### 5c. Controls sit on a raised surface. They are never flat outlines.
A transparent button with a 1px border is the "dead" look. The recipe every
serious dashboard uses — and what `--control-*` in `src/index.css` encodes — is
three things that are invisible alone and read as a physical surface together:
a barely-perceptible vertical gradient, a hairline highlight on the top edge,
and a 1px drop shadow.

- `--control-bg` / `--control-bg-hover` — the surface and its hover
- `--control-bd` / `--control-bd-hover` — hairline border
- `--control-shadow` / `--control-shadow-active` / `--control-shadow-accent`

**Every interactive control needs a visible hover AND a pressed state.** The old
`Button` used one `filter: brightness(1.12)` hover for all variants, which is a
literal no-op on a transparent background — every secondary button in the app
had no hover feedback at all. Pressed sinks the surface
(`--control-shadow-active` + `translateY(0.5px)`); one frame of physics is what
makes a control feel like a control.

Navigable rows get a direction cue (a chevron), not just a label.

**The elevation ladder — elevation encodes INVITATION**, i.e. how much a control
wants to be pressed, which is its rank in the action hierarchy:

| Rank | Treatment | Use | Variant |
|---|---|---|---|
| 1 | accent fill + accent shadow | the one action. **Max one per view.** | `primary`, `danger-solid` |
| 2 | raised neutral surface + hairline + shadow | expected actions | `muted`, `outline`, `danger`, `ai` |
| 3 | **still a button**: flat fill, soft border, no shadow, no gradient | present but not inviting (Cancel, Remove, Nudge) | `ghost` |
| 4 | no chrome until hover | icon-only affordances | `ui/IconButton` |

**Rank inflation is the failure mode.** When three controls in a row are all
elevated, none reads as the answer. Pick the rank by what you want pressed.

**Rank 3 is not chrome-less.** Deleting the boundary turns a button into a link:
the affordance vanishes until hover, which is a bug rather than restraint. Rank
is expressed INSIDE the boundary — fill weight, border strength, text colour.
Only rank 4 (icon-only) has no chrome. In the reference dashboards "Learn more"
sits beside "Get tickets" and both are plainly buttons; only the emphasis
differs.

**Hover must not stick.** Never set hover state from `onFocus` — a clicked
button keeps focus, so the hover never leaves. `:focus-visible` in index.css
already gives keyboard users the green ring; that is the correct affordance.
And hover should light the SURFACE, not flash the border to near-white.

### 6. Type does hierarchy, so boxes don't have to.
Page title `--text-title` · panel heading `--text-body`/600 · eyebrow
`--text-xs` uppercase · row primary `--text-base`/600 · row secondary
`--text-sm` muted · data numeral `--text-lg`/700 with `.tnum`.

**Migrated so far:** Profile (was already compliant), CoachDashboard roster
(2266px → 1100px, 51 surfaces → 12, depth 2 → 1). Still to do: Log, Dashboard,
ClientView (4693px, 38 surfaces, 23 nested).

## Color tokens

Defined in `src/index.css` `:root`, with a `:root[data-theme="light"]` override
block. **Never hardcode a hex** — ESLint blocks it.

| Purpose | Token |
|---|---|
| Brand / all CTAs, active nav, focus rings | `--color-primary` (#22c55e) |
| 12% green tint for nudge/welcome cards | `--color-primary-dim` |
| Text/icons **on** a filled accent | `--color-on-accent` |
| Surfaces | `--color-bg`, `--color-surface`, `--color-surface-2` |
| Borders | `--color-border`, `--color-border-strong`, `--color-control-border` |
| Text ramp | `--color-text`, `--color-text-dim`, `--color-muted`, `--color-faint` |
| Status | `--color-success`, `--color-warning`, `--color-warning-dim`, `--color-error` |
| Compliance "over target" | `--color-over` |

**`--color-on-accent` is not white.** In dark mode it is `#06240f` — dark text on
a bright accent, because white on #22c55e is ~2.3:1 and fails WCAG AA. Light mode
flips it to `#fff`. If you write `color: '#fff'` on a green button you have
introduced a contrast bug.

### Metric data colors — one per tracked dimension

`--color-calories` (green) · `--color-protein` (red) · `--color-carbs` (tan) ·
`--color-fat` (orange) · `--color-weight` (light green) · `--color-cardio`
(blue) · `--color-steps` (violet) · `--color-ai` (purple, AI features only).

Rules:
- **Green is the only primary action color.** Every CTA, active nav state, badge
  and focus ring is green.
- **Blue is cardio data only** — never a CTA or UI chrome. It was demoted from
  primary precisely because blue-primary reads as generic SaaS.
- Every display of a metric — stat card, progress bar, chart series, compliance
  pill — uses that metric's token, so the color language stays learnable.
- The compliance scale lives in `src/utils/complianceScale.js`. Import it; don't
  restate the buckets.

## Type ramp

Ten steps in `src/index.css`. **These are the only allowed font sizes** — ESLint
blocks raw `fontSize` literals.

```
--text-xs       11px   floor — labels, captions
--text-sm       13px   secondary / meta
--text-base     14px   body default
--text-md       15px   emphasised body
--text-body     16px   comfortable reading / primary controls
--text-subhead  18px   modal + dialog titles, macro totals, nav brand
--text-lg       20px   section headings, stat values
--text-title    24px   page titles
--text-xl       28px   hero headings
--text-display  32px   display numerals, celebration counts
```

Two traps:
- **The names are not size-ordered.** `--text-base` (14px) is *smaller* than
  `--text-body` (16px). The list above is the source of truth, not the name.
- **`--text-xs` is a floor.** 11px is Apple HIG's minimum legible size (Material
  says 12sp). Never ship text below it. If a size genuinely doesn't exist on the
  ramp, **extend the ramp** — don't one-off it.

## Fonts

- **App UI: Inter** (`src/index.css`). Drawn for interface text at small sizes —
  tall x-height, disambiguated `1/l/I`, real tabular figures.
- **Brand / landing: DM Sans** (`src/pages/landing.css`). A geometric display
  face that carries the brand on marketing surfaces.

**The split is deliberate**, matching how Apple (SF Pro/SF Display), Atlassian
(Charlie Text/Display) and GitHub (system-ui/Mona Sans) separate UI from display
type. Don't "unify" them without re-deciding it explicitly.

Numbers that sit in a column, update in place, or are compared against a sibling
— stat values, macro rows, tables, timers — get the `.tnum` class
(`font-variant-numeric: tabular-nums`) so digits don't jitter. Prose keeps
proportional figures.

## Spacing and radius

`--space-xs` 8 · `--space-sm` 12 · `--space-md`/`--space` 16 · `--space-lg` 24 ·
`--space-xl` 32. Radius `--radius` 8px; pills are `999px`. Card shadow is
`--shadow-card` (tokenized, because light mode needs a softer, cooler one).

## Primitives — reuse, don't redefine

Barrel import: `import { Card, Pill, Badge, IconButton, Field } from '../components/ui'`

- `src/components/ui/`: `Card`, `Pill`, `Badge`, `IconButton`, `Field` /
  `Textarea` / `Select`
- Alongside: `Button`, `Modal`, `ConfirmDialog`, `StatCard`, `SectionHeader`,
  `Toast`, `EmptyState`, `Skeleton`, `Avatar`, `InfoTip`

If you catch yourself writing a local `pillBtnStyle`, `iconBtnStyle` or
`inputStyle`, stop — the primitive already exists.

## Theming

- `src/utils/theme.js` owns it. Preference `gardnr-theme` in localStorage is
  `auto` | `light` | `dark` (default `auto`, following the OS). The resolved
  value is written to `<html data-theme="…">`.
- An inline script in `index.html` `<head>` applies it before first paint to
  avoid a flash. **It must stay in sync with `theme.js`.**
- Toggle UI: `src/components/ThemeToggle.jsx`, on Profile → Appearance.

Test both themes. A token that only looks right in dark is not done.

## Charts

**chart.js cannot read CSS variables from a canvas.** Chart chrome — ticks,
grid, tooltips, target lines — uses theme-agnostic literals in
`src/utils/chartTheme.js` (`CHART`), chosen to be readable on both themes.
**Never put `var(--…)` in chart.js options.** Dataset colors
(`borderColor`, `backgroundColor`, `pointBackgroundColor`) are literals for the
same reason; keep them matched to the metric tokens by hand.

## Deliberate literals — do not "fix" these

Each carries an `eslint-disable` with a reason. Leave them alone:

- **`Toast`** — an always-dark surface. Its background stays a deep tint on both
  themes, so its foreground must stay the *bright* dark-mode accent. Tokenizing
  it would flip the text to the darkened light-mode value on a still-dark
  background and destroy contrast.
- **`BarcodeScanner`** — white on a 92%-black scrim over live camera video, not
  a themed surface.
- **The streak-card gradient palette** (`#86efac`, `#6ee7b7`) and the
  **decorative check-in badge** in ClientView (`#1e3a5f`/`#93c5fd`).
- **The 9px "i" glyph** in `.info-tip-mark` — iconography centred in a 14px
  circle, not text. The 11px floor governs text.
- **The landing page** (`.lp` in `src/pages/landing.css`) is intentionally
  always-dark, full-bleed, and excluded from tokenization. `data-theme` does not
  affect it.
- **SVG `stroke=`/`fill=` attributes** and `--gw-accent` custom properties.

## Enforcement

`npm run lint` fails on:
- a raw hex as a `color:` value anywhere in `src/`
- a raw `fontSize` literal anywhere in `src/`

The escape hatch is `eslint-disable-next-line no-restricted-syntax -- <reason>`.
**A literal with a stated reason is a decision; a literal without one is a
regression.** If you add a disable, add the reason.

## Verifying your work

`scripts/shoot.mjs` (Playwright) screenshots real pages via throwaway accounts —
use it to check a change in both themes rather than guessing. For a populated
coach view, `./scripts/seed-walkthrough.sh` seeds a local demo.

Opinionated visual polish — density, uniform pills, anything that moves pixels
across many screens — should be reviewed by the user with screenshots, not
landed silently.
