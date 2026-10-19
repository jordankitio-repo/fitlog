# Settings & account surface — roadmap

Came out of a structural read of the ChatGPT settings UI (Oct 19 2026) against
what Gardnr has today. Everything here was checked against the code, not
assumed; where something is uncertain it says so.

Ordered by **recommended sequence**, not by size. The first item loses money
every month it is open.

---

## 1. Revenue

### 1.1 Stripe Billing Portal — payment method, invoices, receipts
**Status:** not started · **Effort:** ~1 day · **Priority:** highest

A coach can do exactly two things with their subscription today: **cancel** and
**resume** (`SubscriptionManager.jsx`). There is no way to view or change a
payment method, and no customer-portal link anywhere in the app.

Meanwhile `supabase/functions/stripe-webhook/index.ts` handles
`invoice.payment_failed`. So we *detect* the failure and offer the coach no way
to fix it — their card expires, payment fails, and the only self-serve button on
the page says "Cancel subscription". That is involuntary churn, and it is the
single most expensive gap on this list.

One `billingPortal.sessions.create` redirect covers payment methods, invoices
and receipts together. Receipts matter on their own: coaches are businesses who
need invoices at tax time.

*Keep what is already good:* the cancel flow's "You'll keep access until
[date]" is the same reassurance ChatGPT uses. Do not lose it in the move.

### 1.2 Backup payment method
**Status:** not started · **Effort:** small, after 1.1 · **Priority:** high

ChatGPT has a toggle for exactly this. Same churn problem, second layer: when
the default card fails, try another before the subscription lapses. Mostly
Stripe configuration once the portal exists.

---

## 2. Security

### 2.1 Log out everywhere
**Status:** not started · **Effort:** ~1 hour · **Priority:** high (cheapest win)

`supabase.auth.signOut()` is called in five places and every one is local to the
device. There is no way to revoke a session on a phone you no longer have. For
an app holding health data that is a reasonable expectation, and Supabase does
it in one argument: `signOut({ scope: 'global' })`.

### 2.2 Active sessions list
**Status:** not started · **Effort:** unknown — needs research · **Priority:** medium

ChatGPT lists devices with last-used and lets you remove them individually.
**Unverified:** whether Supabase exposes per-session metadata well enough to
build this. Do 2.1 first regardless — it delivers most of the value and does not
depend on the answer.

### 2.3 MFA
**Status:** not started · **Priority:** low for now

ChatGPT offers authenticator and SMS. Gardnr is password-optional with emailed
codes. Named for completeness; not worth it before launch.

---

## 3. Notifications

### 3.1 Notification preferences
**Status:** not started · **Effort:** ~2 days · **Priority:** high

The biggest non-billing gap. We send notifications (the bell, plus email via
Resend) and the user has **zero control** — there is no preference table,
column, or screen anywhere in the codebase. A client cannot say "email me
reports but not messages".

ChatGPT's model is the right one: per-category rows, each with a channel choice
(Push / Email / both).

Two reasons this is more than a nicety:
- **CAN-SPAM** needs a working opt-out for anything marketing-flavoured, and the
  line between transactional and marketing has to be drawn somewhere visible.
- It pairs with the **MHMDA consent-withdrawal** story already drafted in the
  Consumer Health Data Policy.

Shape: a preferences table (or JSONB on `profiles`), checked before each send.
Note the new cadence-change notification (`notify_cadence_change` trigger) is a
*transactional* notice about an obligation — probably not opt-out-able, which is
itself a decision to make deliberately rather than by omission.

---

## 4. Accessibility (Appearance)

### 4.1 Reduce motion override
**Status:** not started · **Effort:** ~2 hours · **Priority:** medium

`index.css` honours `@media (prefers-reduced-motion: reduce)`, but the user has
no override. ChatGPT exposes System / On / Off. Cheap, and it aligns with the
WCAG 2.1 AA work already in the compliance program.

### 4.2 Text size control
**Status:** not started · **Effort:** ~half a day · **Priority:** medium

ChatGPT has UI and code font-size inputs. Gardnr has neither. Coaching skews
older than ChatGPT's user base, so this is a real need rather than a nicety.

Careful: the type ramp is tokenised and lint-enforced. A size control should
scale the root, not add per-component overrides.

### 4.3 Contrast slider
**Status:** not started · **Priority:** low

ChatGPT has one. Gardnr's tokens are fixed pairs tuned per theme, so this is a
bigger change than it looks. Named, not recommended yet.

---

## 5. Data controls

### 5.1 Communication / consent preferences
**Status:** not started · **Priority:** medium — overlaps 3.1

ChatGPT's Data controls page carries marketing privacy and cookie preferences.
Gardnr's "Data" section is Export + Delete only. The consent half ties directly
to the MHMDA work; build it with 3.1 rather than separately.

### 5.2 "Who we share data with"
**Status:** not started · **Effort:** small · **Priority:** low

ChatGPT has "Information shared with apps". The subprocessor register is already
written in `compliance/` — this is mostly surfacing what exists.

### 5.3 `reports.archived` — wire it up or delete the column
**Status:** open since Oct 15 · **Effort:** small either way · **Priority:** medium

Every report query filters `archived = false`. **Nothing anywhere sets it.** The
escape hatch exists in the schema, is honoured on read, and is unreachable.
ChatGPT's "Archived chats" is the pattern it was presumably built for. Either
finish it or drop the column — leaving it is the worst of the three.

---

## 6. Identity & motivation

### 6.1 Stats strip
**Status:** not started · **Effort:** ~1 day · **Priority:** medium

ChatGPT's profile leads with a compact strip — lifetime, peak, longest task,
longest streak, current streak — then an activity heatmap with Daily/Weekly/
Cumulative, then "Insights".

Gardnr already has every equivalent: streaks, milestones, the 90-day consistency
heatmap, the weekday/weekend split. They are scattered across My Progress. The
borrowable idea is *compacting them into one identity surface*. In a fitness app
that is retention, not vanity.

### 6.2 Shareable progress
**Status:** flagged, not recommended yet · **Priority:** deferred

ChatGPT's profile has Edit / Private / Share. A shareable streak or progress card
is a genuine growth lever given distribution is the stated constraint — but this
is health data in a US-regulated product. Needs a real decision about what a
public card may leak before any of it is built.

---

## 7. Structure

These are presentation changes, not features. Worth doing as one pass rather
than piecemeal.

### 7.1 Make the settings rail navigate, not scroll
**Status:** not started · **Effort:** ~2 days · **Priority:** medium
**Blocked by:** the ClientView divergence (see 8.1)

ChatGPT's rail turns each entry into its own **page**, which is why their screens
stay short while carrying 17 of them. Gardnr's Profile is one long page with
10–11 anchored sections that the rail scrolls to, and three of those sections
("Your details", "Daily targets", "Check-in questions") are full forms.

The pattern is already proven in this codebase: the coach's client record uses
sections-as-routes on mobile (`/client/:id/:section`). Settings never got it.

### 7.2 Group the rail
**Status:** not started · **Effort:** small

ChatGPT groups "Personal" / "Integrations". Gardnr's rail is flat and
role-dependent. Something like You / Coaching / Account would help, and costs
almost nothing once 7.1 is done.

### 7.3 One row pattern
**Status:** not started · **Effort:** medium

ChatGPT uses a single shape everywhere: label (+ description sub-line) on the
left, control on the right. That uniformity is what makes a long list scannable.
Gardnr alternates between forms and rows. Converging on one row primitive is
what makes 7.1 pay off.

---

## 8. Known debt that will get in the way

Not from the ChatGPT comparison — surfaced while working, and listed because
these items will be hit while doing the above.

### 8.1 `ClientView.jsx` is diverging between `main` and `feat/device-sync`
`main` does not have the 10 progress-chart commits that live on the branch. This
already caused a cherry-pick conflict (Oct 19) that had to be ported by hand, and
every further change to that file will need the same. Decide what happens to
those commits before starting 7.1.

### 8.2 Coach-only controls are UI-only, not enforced
RLS policy `coach_clients_update_by_client` lets a **client** update their own
`coach_clients` row, so a client can change their own `checkin_interval_weeks`
through the API. Same shape for `primary_goal` via `profiles_update_self`. Both
are coach-only in the UI and unrestricted in the database. The cadence
notification already guards against announcing a self-change as the coach's
doing, so nothing lies — but the restriction is not real.

### 8.3 "Due" badge colour — decision pending
Open question from Oct 19. B1 lists `No check-in` as amber by name, and "Due"
appears from day one of the period, so always-red would fire on day one and
collide with the roster's at-risk signal. Proposed instead: escalate amber → red
once the period enters its final 3 days (`dueWindow` already exists and already
drives the nudge). Awaiting a call.

---

## Suggested order

1. **1.1 Stripe portal** — stops losing subscribers
2. **2.1 Log out everywhere** — an hour, closes a real gap
3. **3.1 Notification preferences** (+ 5.1 consent) — the gap a user would notice
4. **5.3 `reports.archived`** — finish or delete, stop carrying it
5. **4.1 / 4.2 accessibility** — cheap, supports the AA commitment
6. **8.1 branch divergence** — must be resolved before 7.x
7. **7.1–7.3 structure pass** — one pass, not piecemeal
8. **6.1 stats strip** — once the surfaces above are stable
