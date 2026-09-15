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

2. **The status pill — and above all the pill with a dot in it.** Status,
   triage and "needs attention" are **plain coloured text** (C1). No container,
   no border, no dot.

   This entry used to say the opposite. It carried a working recipe for a tinted
   `999px` pill with a `1px solid <tone>` border "plus a 7px dot", sourced to
   "the CoachDashboard roster" — and it sat nine rules above C1, which calls the
   dot the single most recognisable AI-dashboard tell. The roster stopped
   rendering it when the rows were rebuilt; the rule was never updated. For as
   long as both lines stood, the system's own reference told a reader to build
   the one pattern it bans hardest. **A rule that outlives the code it describes
   does more damage than no rule.**

3. **Two glyphs for one action.** There is ONE forward mark — the chevron
   (`<Icon name="right" />`) — used for navigation, CTAs and "go to this thing"
   alike. A line-and-arrowhead `arrowRight` existed alongside it and the two
   appeared on the same screen (the roster's "Open ›" beside the banner's
   "check-ins to review →"), which reads as carelessness. It has been deleted
   from the set so it cannot come back. Same rule for any glyph pair: if two
   marks mean the same thing, keep one.

4. **Emoji as icons.** 🧮 🔖 ✅ have all been rejected. Icons are **monochrome
   feather/line SVG with `stroke="currentColor"`**, matching the nav rail and
   save-icon glyph style. (Emoji already in the streak card are a pre-existing
   decorative exception, not a precedent.)

5. **Bespoke one-off styling** where a primitive exists. See below.

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

## The layout system

The token layer (colour, type) was never what made screens read as "assembled";
the layout layer was. Everything below was derived by rebuilding the coach
roster and measuring the result: **2266px → 1100px, 51 bordered surfaces → 12,
nesting depth 2 → 1, 7 distinct paddings → 3.** Apply it to every other screen.

---

### A. Structure

**A1. Three surfaces. A Panel never contains a Panel.**
- **page** — no border, no background. Sections separated by space and a
  heading. A page-level headline (the roster's triage line) is NOT a card.
- **panel** (`ui/Panel`) — the ONLY element that draws a border. One per logical
  group. `title` renders a header bar with a divider.
- **row** (`ui/Row`) — a record inside a Panel. No border, no background, no
  radius; a hairline divider between rows and none after the last.

Maximum nesting depth is **1**. Form controls carry their own borders and do not
count — they are controls, not surfaces.

**A2. Two densities, and no third.**
`density="compact"` → `12px 16px` for repeating surfaces (rosters, stat rows,
lists). `density="comfortable"` → `20px 24px` for things people type into or
read. Every Panel declares one. Compact `Row` padding is `16px`; 12px around a
30px avatar leaves no air and the rows read as stacked.

**A3. Spacing carries grouping; borders are the fallback.**
`--space-*` only. **≤12px within a group, ≥24px between groups.** Evenly spaced
layouts read flat, randomly spaced ones read sloppy — the contrast is what makes
structure visible without drawing it. Every border you draw is an admission you
could not group it with space.

**A4. Grid columns are declared ONCE, never per row.**
Every `<Row>` is its own CSS grid, so an `auto` or content-sized column resolves
against THAT row's content. A roster where some rows carry an extra button will
silently misalign every column to its left, and it looks like sloppy design
rather than a layout bug. **Give every column a fixed width**, or define one
grid on the container.

Related: a control inside a grid stretches to its cell. `justify-self: start;
width: fit-content`, or its hover fill runs the full column and reads as a stray
block.

**A5. Type does hierarchy, so boxes don't have to.**
Three axes carry hierarchy, in this order of strength: **size, then colour,
then weight**. Reach for weight last. It is the weakest signal and the one that
drifts, because until the roster pass it was the only axis with no tokens and
no lint rule — which is how one page ended up with four weights at 13px, two
letter-spacings for the same uppercase label, and 700 as its most common style.

| Role | Size | Weight |
|---|---|---|
| page title | `--text-xl` | `--weight-semibold` |
| panel heading | `--text-body` | `--weight-medium` |
| eyebrow / column head | `--text-xs` upper, `ls:0.08em` | `--weight-medium` |
| row primary (names) | `--text-base` | `--weight-medium` |
| row secondary / labels | `--text-sm` muted | `--weight-normal` |
| urgent status | `--text-sm` toned | `--weight-semibold` |
| data numeral | `--text-lg` + `.tnum` | `--weight-semibold` |

**The weight ramp is four steps, and `--weight-bold` (700) is not UI text.**
`--weight-normal` 400 · `--weight-medium` 500 (the workhorse) ·
`--weight-semibold` 600 (emphasis) · `--weight-bold` 700 (display numerals only).

Calibrated against `dash.cloudflare.com`, which runs its entire dashboard on
400 and 500 and spends 600 exactly once, on the page title — nothing there is
700. Both products use the same typeface (Inter), so everything that made that
UI read as calmer and more deliberate was the *setting*, not the face. If a
screen here feels heavier than a reference you admire, check the weights before
reaching for a new font.

Two documented size exceptions, both iconography rather than text, both allowed
because they scale with a circle instead of sitting on the ramp: the 9px `i`
glyph in its 14px badge, and the `Avatar` monogram at `size * 0.4`.

---

### B. Colour

**B1. Colour is a grade. Grey is the absence of one.**
The rule that keeps a screen from becoming a rainbow.

| Tone | Means | Example |
|---|---|---|
| red | graded, intervene now | `Never logged`, `4 days no log` |
| amber | graded, watch | `2 days no log`, `No check-in` |
| green | graded, fine | `Logged today` |
| **grey** | **nothing to grade against** | `No targets set` |

Painting a setup gap amber would put "the coach hasn't finished onboarding" on
the same footing as "this client is slipping", and leave amber meaning three
things at once. **Green must never share grey** — they collided once (both
`--color-muted`) and a healthy client looked identical to an unconfigured one.

Grey needs no extra decoration. An engraved/recessed treatment was tried and
removed: the muted colour already says "no grade here", and the effect could not
render on a light surface at all.

**B2. Colour lives in the data; chrome stays neutral.**
Borders, dividers, panel backgrounds, resting icons and labels take neutral
tokens ONLY. Metric tokens go on the number; semantic tokens go in the status
cell; green is the only action colour. **Never colour an entire card border to
signal state** — state belongs in the row's status cell, at a consistent
x-position where it scans in one pass.

**B3. Semantic colour needs a stated rule, or it is decoration.**
Never introduce a colour without saying what governs it. For a banner CTA (a
headline count naming work the user owes), tone answers one question: **what
happens if this is ignored?** — `primary` green = routine, it piles up;
`warning` amber = blocked until fixed.

*Currently single-tone in code:* the amber "N clients need targets" CTA was
deleted once triage began ranking those clients to the top of the roster by
name, so the `tone` prop went with it rather than sitting unused. The rule
stands and comes back with the second CTA.

**No red CTA, deliberately.** Red means a CLIENT is in trouble; an admin to-do
must never shout louder than a person who has stopped eating.

**Tone does not escalate with count.** Ten of a thing is the same KIND of
problem as one. **The number carries volume, the tone carries kind** — two
channels, no overlap. Order is fixed, not sorted by count: a bar read daily
should not move. Zero renders nothing. Plurals are written per call site.

---

### C. Status and data display

**C1. Status is text by default.**
- **Status text** — plain coloured text, `--weight-semibold` for red/amber,
  `--weight-normal` muted for green/grey (the A5 ramp; it was 700/500 before the
  weight ramp existed). No container, no dot. It aligns down a column, which a pill never
  does, and the label already carries the meaning so colour only reinforces it —
  which is also why it survives without colour vision.
- **`Badge`** — ONE fact, two words max, only where a container earns its keep.
- **`StatCell` strip** — several facts about one subject: mono uppercase label
  over a tabular value, hairline divider between cells.
- **`Tracker`** — a time series, where the SHAPE is the point.

**If it carries more than one fact, it is not a Badge.** A pill holding four
dot-separated facts is a table in a costume.

**NEVER a coloured pill with a dot inside it.** The single most recognisable
AI-dashboard tell, and the dot never says anything the label hasn't. `Badge` has
no `dot` prop. Same for legend dots beside a number: colour the number.

**A pill you can press is fine; a pill you cannot press is decoration.** Sort
chips and CTAs keep the shape because the shape is the affordance. Status does
not, because it is not a control.

**C2. A column header names what the column HOLDS.**
"Status" promises one uniform dimension the reader can compare down the page. If
two cells answer different questions, the header must say so — the roster's is
**Needs attention** — or the column should be split. A generic label papering
over it is how a table stops being readable.

Reason strings name their own unit: "Calories 0/7" never said 0 of 7 WHAT.

**C3. If a reader can re-sort by a value, that value must be on screen.**
The roster once sorted by Compliance while the column showed attention reasons:
ordering by a number that was never visible, so the order looked arbitrary.

The general pattern — **lenses**. A chip re-sorts AND retargets the column, the
header renames itself, and the sort uses the grade the column renders
(`TONE_RANK`), never a parallel calculation. Keep the logic in a util
(`rosterStatus.js`), not the view.

Direction is a **semantic** toggle — worst-first / best-first, not asc/desc,
since "ascending" is meaningless for a column reading "Never logged". The header
is the control (feather chevron: down = worst first). Switching lens resets to
worst-first: a new lens is a new question.

**C4. A tracker without an axis is decoration.**
If the reader cannot tell which end is *now*, the data is not being
communicated. The roster deliberately has none: seven cells needed an axis
label, then tooltips, then arithmetic, to say what the status text says in a
phrase. Use one where the shape of the series is the point, and label its axis.

---

### D. Controls

**D0. The surface ramp: page < panel < control.**
A raised control must be lighter than whatever it sits on, on EVERY surface.
Light panels were pure `#ffffff`, which left nowhere lighter to go — so the same
button read as darker-than-backdrop inside a panel and lighter-than-backdrop on
the page. It lifted in one place and sank in the other, and the identical hover
tint looked like two different greens because one was surrounded by white and
the other by grey.

| | page | panel | control |
|---|---|---|---|
| light | `#f4f5f4` | `#fbfcfb` | `#ffffff` |
| dark | `#0a0a0a` | `#141414` | `#161616` |

Measured lift is now the same direction in both themes: control +3 over a panel,
+10 over the page in light; +2 / +12 in dark. **If a control ever needs to be
darker than its backdrop to be visible, the ramp is wrong — fix the ramp, not
the control.**

**D1. Controls sit on a raised surface. Never flat outlines.**
A transparent button with a 1px border is the "dead" look. `--control-*`
encodes the recipe — three things invisible alone that read as a physical
surface together: a barely-perceptible vertical gradient, a hairline highlight
on the top edge, a 1px drop shadow.

`--control-bg` / `-bg-hover` · `--control-bd` / `-bd-hover` ·
`--control-shadow` / `-shadow-active` / `-shadow-accent`

**D2. Every control needs a visible hover AND a pressed state — that ANIMATE.**

**A gap the reader can close should be an action, not a label.** "No targets
set" was a dead end naming a job the coach can finish in seconds; it navigates
to that client's targets now. The GRADE carries the hint (`fix: 'targets'`) so
the view never matches on text, and grades with no user-fixable cause — "Nothing
logged", which only the client can resolve — carry none and stay plain.

**A control is a `Button`. Do not hand-roll one.** `Pill` is a Button too —
`muted` inactive, `primary` selected, with a radius and type-scale override.
Both it and the banner CTA were hand-rolled copies, and both drifted the same
way: they kept brightening their border on hover long after that was removed
from every other control, because a parallel copy has to be kept in step by
hand. The banner CTA was a bespoke
component for no reason other than its pill shape, and it drifted from the rest
of the app three separate times — wrong hover strength, an animated chevron
nothing else had, a state-driven hover that stuttered on leave. Each was fixed
in isolation and the next one appeared. It is `<Button variant="action">` with a
`borderRadius` override now, so it is identical to Nudge by construction rather
than by maintenance. **If a control needs a different shape, override the shape
— never rebuild the control.**

Two more instances, both found by measuring the rendered page rather than
reading the source, because both were invisible until something else moved:

- **`Pill` overrode padding as well as type.** Its own comment said the type
  scale was "the only thing held back from Button", but the code also set
  `padding: '5px 12px'`, leaving chips 26px tall against the rows' 30px. The
  override that is wanted is the lighter type; the height now comes from a
  `minHeight` floor so the chip matches Button `sm` by construction.
- **The roster banner's fourth segment was hand-built.** Three counts went
  through a local `seg()` helper; `6/9 checked in` was assembled inline and so
  inherited `--text-sm` instead. It had been wrong since before the type pass
  (15px vs 13px) and nobody saw it — until `seg()` moved to 20px and the gap
  became 7px. **A hand-rolled copy is not wrong on the day it is written; it is
  wrong on the day the original changes.** It now goes through `seg()`, which
  takes a node, so the ratio's muted denominator is a colour decision rather
  than a second implementation.

**Prefer CSS `:hover` over React state.** State-driven hover puts a re-render
between the pointer moving and the style changing, which shows up worst on
LEAVE — the transition cannot start until the render lands, and a pill's
rounded corners make it easy to cross the boundary twice on the way out,
restarting it. That reads as a stutter. `.ds-sortbtn` and `.ds-fixbtn` are pure
CSS and have none of it. `Button` still uses state for
its variant map; it is acceptable at 8px radius but is the known exception.

**Type-only controls share ONE progression: `--color-faint` → `--color-text-dim`
on hover → `--color-text` while held.** Matching only the destination is not
enough — start from the same place too, or one travels half as far and reads as
a weaker response. `.ds-sortbtn` and `.ds-fixbtn` are byte-identical on this:
Δ −80 in light, Δ +122 in dark.

Starting at `--color-faint` also separates type a reader can act on from the
static greys around it.

**A label that is also a control responds with its TYPE, not a fill.** A
sortable column header is a label first: a box appearing behind it on hover
drags the eye away from the rows it describes. The text and its chevron go
`--color-faint` → `--color-text-dim` on hover → `--color-text` while held, and
back on release. Reserve surface fills for things that are buttons first.


**Never put a gradient on a property you intend to transition.**
`background-image` is a DISCRETE property: it snaps to its final value the
instant a hover begins while `color` interpolates over 140ms, so the box
changes first and the label arrives 125ms later. That desync reads as a flash.
Measured, before the fix:

```
t+  0ms  bg=rgb(215,243,226)  label=rgb(59,63,69)   box already green
t+125ms  bg=rgb(215,243,226)  label=rgb(10,48,24)   text finally catches up
```

Control surfaces are therefore **solid colours** (`--control-bg`,
`-bg-hover`, `-bg-accent-hover`) transitioned as `background-color`, with the
vertical gradient moved to **`--control-sheen`** — a constant overlay that never
changes and so never needs to animate. Surface and label now arrive together.

Pressed sinks the surface (`--control-shadow-active` + `translateY(0.5px)`); one
frame of physics is what makes a control feel like a control.

**Hover must not stick.** Never set hover from `onFocus` — a clicked button
keeps focus, so the hover never leaves. `:focus-visible` already gives keyboard
users the ring. Hover lights the SURFACE; it does not flash the border.

**D3. Two axes: elevation encodes INVITATION, hue encodes CONSEQUENCE.**

Elevation says how much a control wants to be pressed. Hue says what happens
when you do:

| Variant | At rest | On hover / press |
|---|---|---|
| `muted` | neutral raised | neutral, brighter |
| `action` | **identical to `muted`** | **green**: surface, border and label |

`action` is for a control that **acts on a client** — sends a nudge, sends an
invite, opens work ending in a message to a real person. `muted` only
navigates.

**The green is revealed, not advertised.** At rest the two are the same, because
nine rows of standing colour say nothing and a roster full of green buttons is
noise. The hue arrives on hover and press — the moment you are about to commit,
which is when "this reaches someone" is worth saying. Filled green stays
reserved for rank 1, the one action on a view.

**Same lift, different cast — and that means the LABEL too, not just the
surface.** Measure both, in both themes:

| | surface Δ | label Δ |
|---|---|---|
| dark: `muted` / `action` | +9.0 / +9.9 | +33 / +26 |
| light: `muted` / `action` | −7.6 / −8.8 | −39 / −24 |

The first attempt matched the surface and left the label at full-saturation
`--color-primary`. That was worse than mismatched: the neutral label BRIGHTENS
by 33 while the brand green DARKENED it by 52 and jumped to 83% chroma —
opposite directions. `--control-fg-accent-hover` is a tint of the brand green
that travels the same way as `--color-text` does.

Exact parity is not reachable: a green matched precisely to the neutral label's
luminance stops looking green (near-white in dark, near-black in light). Land
close, same direction, and say where the gap is rather than claiming a match.

**Where they conflict, chroma wins.** Tuning the LIGHT hover surface to the
neutral's exact lightness produced a 2.8%-saturated green — no green at all, and
the signal simply vanished. It now carries ~11.5% and so darkens about twice as
far as the neutral hover (lum 236 vs 247). That is the right trade: a rule that
makes its own signal invisible has failed. The constraint only binds on
near-white surfaces, where there is no headroom above the page.

Measure rather than eyeball. Green's G channel dominates luminance, so a green
chosen to *look* equivalent comes out noticeably stronger.

**Hover changes the surface and the label. Never the border.** This is the rule
from D2 and it holds for `action` too.

**The elevation ladder.**

| Rank | Treatment | Use | Variant |
|---|---|---|---|
| 1 | accent fill + accent shadow | the one action. **Max one per view** | `primary`, `danger-solid` |
| 2 | raised neutral + hairline + shadow | expected actions | `muted`, `outline`, `danger`, `ai` |
| 3 | **still a button**: flat fill, soft border, no shadow | present but not inviting | `ghost` |
| 4 | no chrome until hover | icon-only | `ui/IconButton` |

**Rank inflation is the failure mode.** Three elevated controls in a row and
none reads as the answer. Rank 1 means *the one action on this VIEW*, not on
this panel: "Send invite" was filled green at the foot of the roster, making an
occasional setup task the loudest thing on a screen whose job is scanning. It is
rank 2. The only rank 1 left is the empty-state CTA, which renders only when
there is nothing else to do. **Rank 3 is not chrome-less** — deleting the boundary
turns a button into a link and the affordance vanishes until hover. Rank is
expressed INSIDE the boundary: fill weight, border strength, text colour.

Navigable rows get a direction cue (chevron), not just a label.

**D4. One glyph per meaning.**
There is ONE forward mark — `<Icon name="right" />` — for navigation, CTAs and
"go to this thing" alike. Two marks for one action read as carelessness, and it
only shows once both are on screen together.

**D5. No native `title` tooltips on designed surfaces.**
`title` renders an OS-styled grey box in the system font — the one element on
screen that is not yours. If the state is already visible, delete the hint and
keep `aria-label`. If it carries information nothing else shows, use the app's
portaled bubble (`InfoTip` / `.info-tip-bubble`).

**D6. A single destination is not navigation.**
Nav pills render only when there is more than one place to go. In an account
menu, the one action you cannot undo takes `--color-error` below a rule
(`.gnav-menu-item.danger` + `.gnav-menu-sep`).

---

### E. Copy

**E1. Name pages from the reader's side, and make the nav agree.**
"Coach Dashboard" named the page from the SYSTEM's side — "Coach" only ever
distinguished it from `Dashboard.jsx`. It is **Clients**, which is what the nav
says. A heading that disagrees with its nav label makes the reader check they
are in the right place. "Dashboard" is a placeholder word: name the thing.

*Outstanding:* the client side navigates to "Dashboard" and lands on "My
Progress".

**E2. Demo and seed data must read like real records.**
Clients named "Hugo — 5 days quiet" made the whole screen look generated. They
are people: Hugo Bennett. Seed dates must use LOCAL formatting, never
`toISOString()`, which rolls the day forward in the evening west of Greenwich
and silently desynced every seeded check-in.

---

### Applied so far

Surface counts below mean **bordered non-control elements** — form controls carry
their own borders and are excluded, or the number measures the control library
rather than the layout. Stated because the original "7 paddings -> 3" could not
be reproduced without knowing that.

| Screen | Before | After |
|---|---|---|
| CoachDashboard | 2266px · 51 surfaces · 36 nested · depth 2 · 7 paddings | **1100px · 11 · 0 · depth 1** |
| CoachDashboard type | 16 styles · 4 weights at 13px · 3 letter-spacings at 11px | **14 styles · weights 400/500/600 · one spacing per role** |
| CoachDashboard spacing | 11 distinct gaps, 7 off-ramp | **8 gaps, all scale steps** |
| CoachDashboard controls | 30px ×13 + 26px ×4 | **30px ×17** |
| Profile | already compliant (8 surfaces, depth 1, 2 paddings) | Panel-migrated |
| NotificationCenter | severity as a dot, grey reason text, 700 weights, hardcoded shadow, 9 off-scale spacings | **status text graded like the roster's column; ramp weights; `--shadow-dropdown`** |

**Still to do:** Dashboard (6518px · 74 surfaces · 60 nested · depth 3 · 17
paddings — the worst screen in the app), Log, ClientView (4693px · 38 · 23 ·
depth 2 · 8).

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
- Every display of a metric — progress bar, chart series, compliance fill — uses
  that metric's token, so the color language stays learnable.
- **But metric tokens are FILL colours, not text colours.** They are dark-first
  data hues, and the light theme flips only the neutral ramp and primary — the
  accents carry over unchanged. On a light card every one of them fails WCAG AA
  as text: calories 1.62:1, weight 1.87:1, fat 2.20:1, protein 2.69:1, carbs
  2.85:1, against a 4.5:1 floor. In dark they all clear it (6.7–12.6:1), which
  is exactly why this is easy to ship without noticing.
  A 7px legend dot had no contrast requirement because a shape is not text; a
  numeral does. So when C1 says "colour the number" it means the STATUS tones
  (red/amber/green), which are legible on both grounds — never a metric token.
  `StatCard` therefore drops the dot AND keeps its numeral neutral: the label
  already names the metric, so the colour carried nothing the reader needed.
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
--text-title    24px   large stat numerals, plan prices
--text-xl       28px   page titles (h1), hero headings
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

**The scale is numeric, because the value IS the name:** `--space-2` `-4` `-6`
`-8` `-10` `-12` `-16` `-20` `-24` `-32`. The t-shirt names (`--space-xs` …
`-xl`) remain as aliases for ~23 legacy call sites; new code uses the numbers.
The type ramp is the argument for this — its t-shirt names are not size-ordered
(`--text-base` 14px is *smaller* than `--text-body` 16px) and need a standing
warning to be used safely. A number cannot drift from what it means.

The sub-8px steps are not decoration: 2px stacks a name over its email, 4px
sets a glyph against a label inside a control, 6px sets a numeral against its
label, 10px is control interior. They were measured off the roster, not
invented.

Spacing was the LAST ungoverned axis, and it failed the same way weight did —
tokens existed, A3 said "`--space-*` only", nothing enforced it, and the five
tokens had 23 uses in the whole app while the roster alone rendered 11 distinct
gaps. After the sweep the roster renders 8, all of them scale steps.

Radius is exactly three values, each with one job: `--radius` 8px for surfaces
and controls, `50%` for avatars, `999px` for pills.

Shadows are tokenized for the same reason colours are — a shadow tuned for a
near-black ground is far too heavy on a light one. `--shadow-card` for resting
surfaces; **`--shadow-dropdown`** for floating panels (the account menu and the
notification centre). Both of those dropdowns had independently hardcoded
`0 12px 32px rgba(0,0,0,0.5)`, which is correct on dark and a smear on light.

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

**The hex rule was widened (Sep 15 2026)** from `Property[key.name='color']` to
any hex bound to a property OR a const, whatever the key is called. The old
shape is how `const LEVEL_COLOR = { red: '#f87171', yellow: '#fbbf24' }` lived
in `NotificationCenter` unflagged while every page around it was clean. JSX
attributes stay unmatched — SVG `fill=`/`stroke=` are their own category.

Widening it found a **theming bug**, not just untidy code: `ComplianceBreakdown`
and `EnergyBalanceRead` each defined `GOOD = '#34d399'` / `WEAK = '#fbbf24'` —
the DARK-mode values of `--color-success` / `--color-warning`, which flip to
`#16a34a` / `#b45309` in light. Both components had been painting dark-theme
colours on a white ground. The `MUTED` const sitting directly beneath them was
already a token, so the conversion had simply stopped halfway.

**Weight and spacing still have no rule.** Measured, not estimated: turning them
on today fails **135** call sites for weight and **510** for spacing, across
Dashboard, Log and ClientView. Those three pages are queued for the layout
migration, which will rewrite most of those call sites anyway — tokenizing them
first is work done twice. Add both rules as the CLOSING step of that migration.

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
