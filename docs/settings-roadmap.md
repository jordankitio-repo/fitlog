# Settings & account surface — roadmap

Came out of a structural read of the ChatGPT settings UI (Oct 19 2026) against
what Gardnr has today. Everything here was checked against the code, not
assumed; where something is uncertain it says so.

Ordered by **recommended sequence**, not by size. The first item loses money
every month it is open.

---

## 1. Revenue

### 1.1 Stripe Billing Portal — payment method, invoices, receipts
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`) · **Priority:** was highest

`create-portal-session` opens Stripe's hosted portal for a verified coach or
legacy solo subscriber. The caller sends an `intent` LABEL only (`portal` or
`payment_method`), validated against an allow-list the same way checkout
validates `cadence`; the return URL is built server-side from `APP_URL`, never
from the request, so there is no open redirect behind the billing endpoint.
Guards run caller → role → rate limit → subscription → config → Stripe, which
is why `tests/rls/portalFn.test.js` can prove the authorization half with no
Stripe credentials at all.

On the page, `past_due` now leads the Billing card with an amber `Notice` and an
"Update card" button that goes straight into Stripe's payment-method flow. The
portal link outlives the subscription, because invoices do: a cancelled coach
still reaches theirs.

**Still needed before this works in production** (neither is code):
1. Deploy the function and, if the sandbox should return to itself, set `APP_URL`.
2. Stripe Dashboard → Billing → Customer portal: turn ON payment methods and
   invoice history, leave cancellation and plan switching OFF. The function
   header says why. With no saved configuration Stripe refuses every session.

*Three things found while building it, all pre-existing:*
- `billing_interval` was written by the webhook and selected by nobody, so the
  plan-price line in `SubscriptionManager` had never rendered for a single user
  since the column shipped in August.
- The card printed "Renews <date>" for every status that was not `trialing`,
  which put a renewal date under **Canceled** and directly above the new
  payment-failed notice. The date was real and the verb was a lie. Status → verb
  is an allow-list now, so an unhandled status renders no line at all.
- `textTransform: capitalize` rendered `past_due` as "Past_due".

*Why it was first on the list:* a coach could do exactly two things with their
subscription — cancel and resume. Meanwhile `stripe-webhook` already handled
`invoice.payment_failed`, so the app DETECTED a dead card and offered no way to
fix it: the only self-serve button on the page said "Cancel subscription". That
is involuntary churn, and it was the single most expensive gap on this list.

The cancel flow's "You'll keep access until [date]" reassurance was kept, and is
the reason cancellation stays in the app rather than moving into the portal.

### 1.3 Change billing cadence (upgrade / downgrade)
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`) · **Priority:** was unlisted

Surfaced by a question about Stripe's portal config: *do we allow plan
switching?* No, and worse, there was no way to switch at all. The three-cadence
ladder was selectable exactly once, at first checkout — `create-checkout-session`
refuses a second checkout while a subscription is live, and CoachPaywall (the
only picker) renders only when there isn't one. **A coach on monthly had no
route to annual anywhere in the product**, which is the cadence the business
most wants people on.

`change-cadence` moves them, both directions, from the Billing card. The caller
sends a cadence LABEL and the Stripe Price is resolved server-side, same as
checkout — but unlike checkout an unknown label is REJECTED rather than
defaulted, because defaulting at checkout costs nobody anything while
defaulting here would silently move a paying coach down the ladder.

**Proration: `always_invoice`, both ways, immediately.** Up the ladder charges
the difference today less unused time; down hands the unused remainder back as
credit against future invoices, not cash. Stripe's default `create_prorations`
was wrong in a quiet way: it parks the adjustment on the NEXT invoice, and
switching to annual makes the next invoice a year away, so a coach would have
had twelve months of access before being billed the difference.

*The bug this depended on fixing first:* `billing_interval` was written from
`subscription.metadata.cadence`, which is stamped at checkout and never again.
The moment a price could change without a new checkout, that metadata became a
record of what the coach first bought rather than what they pay now — a coach
who moved monthly to annual would have kept "$49/month." on their Billing card
while Stripe charged $490/year. The webhook derives the interval from the PRICE
now. **A field that records an intention will disagree with the system that
records the fact, and the screen will show the intention.**

Keep "Customers can switch plans" OFF in the Stripe portal. It is no longer
dangerous, but the app owns this flow and its wording; two paths to one outcome
is how copy drifts.

### 1.2 Backup payment method
**Status:** not started · **Effort:** small, after 1.1 · **Priority:** high

ChatGPT has a toggle for exactly this. Same churn problem, second layer: when
the default card fails, try another before the subscription lapses. Mostly
Stripe configuration once the portal exists.

---

## 2. Security

### 2.1 Log out everywhere
**Status:** ALREADY SHIPPED — this entry was wrong

`Profile.jsx` has `signOutEverywhere()` calling `signOut({ scope: 'global' })`,
with its own control and copy in the Security card ("Ends your session on every
device, including ones you no longer have"). It landed in `56624cc` with the
passwordless-auth work, which is before this roadmap was written: the entry was
drafted from the five LOCAL `signOut()` call sites without checking whether a
global one existed beside them. Verified on `main` Oct 19 2026.

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
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`) · **Priority:** was high

`notification_preferences` (one row per user, one JSONB map) plus
`wants_email_notification`, the single SQL function every sender asks before it
sends. Profile → Notifications renders the categories for the reader's role;
solo users see no panel, because every category needs a coach on one end.

**Two scope decisions**, both deliberate:

- **Email only.** The in-app bell stays on. Email is the channel that intrudes
  and the one CAN-SPAM governs; the bell is pull-not-push and derives most of
  its entries live from `messages`/`check_ins`/`reports`, so silencing it means
  filtering those reads for no gain the reader asked for.
- **Six switchable categories**, all of them ACTIVITY within a coaching
  relationship: `report`, `checkin_review`, `nudge` (client) and
  `client_checkin`, `milestone`, `weekly_digest` (coach). Everything that
  announces a change to the relationship ITSELF stays always-on and has no
  category at all: an invite, a coaching connection ending either way, and the
  cadence-change notice the entry below used to raise as an open question. So
  does every account, security and billing notice. The table is an allow-list of
  what is switchable, so an email nobody thought about is not silenceable by
  accident.

`absent key = send`, so a user who never opens the screen has no row and
receives everything. The gate fails OPEN on a lookup error, which is right for
relationship mail and would be wrong for marketing — stated in the helper, so
the first marketing email cannot quietly inherit it.

*Found while building it:* `revoke all on function ... from public` does NOT
make a function service_role-only on Supabase. Platform default privileges grant
EXECUTE to `anon` and `authenticated` directly, and revoking from PUBLIC leaves
those standing — so the gate, a SECURITY DEFINER function over a table nobody
else can read, was callable by any signed-in user, one category at a time,
against anyone's id. Caught by a test asserting the refusal. Same fix and same
cause as `20260625000000_rate_limit_lockdown`, which means this trap has now
been hit twice: **any new SECURITY DEFINER function in this codebase must
revoke from `public, anon, authenticated`.**

Key drift between the three places the category names live (the screen, the
sender type, the check constraint) is a silent failure in both directions, so
`notificationCategories.test.js` asserts all three against each other.

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
**Status:** not started · **Priority:** medium — 3.1 built the surface for it

ChatGPT's Data controls page carries marketing privacy and cookie preferences.
Gardnr's "Data" section is Export + Delete only. The consent half ties directly
to the MHMDA work.

3.1 shipped without it, so the remaining piece is specifically CONSENT rather
than delivery preference: the MHMDA withdrawal story, and the first category
that is marketing rather than relationship mail. That one cannot reuse
`wants_email_notification` as written — it fails open, and marketing has to fail
closed. A sibling helper, not an extra argument.

### 5.2 "Who we share data with"
**Status:** not started · **Effort:** small · **Priority:** low

ChatGPT has "Information shared with apps". The subprocessor register is already
written in `compliance/` — this is mostly surfacing what exists.

### 5.3 `reports.archived` — wire it up or delete the column
**Status:** DELETED (Oct 19 2026, `feat/settings-account`) · **Priority:** was medium

Dropped, and this was not a fresh call: the decision was made in September and
left half-done. `451d7db` (May) shipped a working client-side archive;
`a070598` (Sep) deleted it on purpose — "Archive is gone from the client: a
filing chore for a handful of letters" — but removed only the WRITERS. The
column, four `.eq('archived', false)` filters, an "Archived" badge in the
coach's sent list and the `archive` glyph all survived the feature they
existed for. So the column was read on every report load and written by nothing
for thirteen months.

**Before deploying:** `select count(*) from public.reports where archived;` on
production. Any report a client archived before September is currently hidden
from them, and dropping the column puts it back in their list. That is the
behaviour September chose, but it is visible to those clients. Expected to be
zero.

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

### 8.2a FIXED: a client could rewrite their coach's report

Found Oct 19 2026 while doing 5.3, on the same table, and fixed in
`20261019120000`. The policy `"Clients can update their report read status"`
restricts the ROW and not the COLUMN, so a client could UPDATE any field on
their own report row — `content` included. Demonstrated before the fix: a
client UPDATE replaced a coach's assessment with their own text, no error, and
the coach's sent list then showed the altered version back to them, because
both sides read the same row.

**The policy name was the whole bug.** It states an intent RLS cannot express —
RLS filters rows and has no opinion about columns — and it reads as correct in
every review. Column privileges express it: UPDATE on `reports` is now granted
only on `read_at`. Verified against every writer first (coaches INSERT and
never UPDATE; clients write `read_at` only), so nothing legitimate lost a
capability. `reportIntegrity.test.js` asserts both halves.

**Worth sweeping for:** this is a class, not an instance. Any policy whose NAME
names a column is making a promise `USING`/`WITH CHECK` cannot keep. See 8.2
directly below, which is the same failure with the enforcement missing
entirely rather than mis-expressed.

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

## 9. Navigation & identity (from the app, not the settings screens)

Added after a second look. Three of the reference screenshots were not settings
at all — the main sidebar, the public profile page, and the account menu — and
the first pass only pulled the stats strip out of them.

Verified against `CoachDashboard.jsx`: the roster has the four lens chips and a
sort direction, and **no search, no pinning, no grouping**. (A "search field"
mention in that file is a button-sizing analogy to Cloudflare's UI, not a
rejected feature.)

### 9.1 Roster search
**Status:** not started · **Effort:** small · **Priority:** high

The sidebar carries a search field. The roster has none. At 13 clients you
scan; the stated goal is "run 100 clients with the attention of 20", and at
100 scanning is not a strategy. Cheapest item in this section and the one that
scales worst if left.

### 9.2 Pin a client
**Status:** not started · **Effort:** small · **Priority:** high

ChatGPT pins an item above Projects and Recents. A coach is actively working
two or three clients in any given week and currently has to re-find them
against a triage sort that keeps moving. A boolean on `coach_clients` plus a
sort key, which composes with the existing lenses rather than replacing them.

### 9.3 Client groups
**Status:** not started · **Effort:** medium · **Priority:** medium

"Projects" are named folders holding chats. The coach equivalent is named
groups holding clients — prep team, online, paused, new intake. This is the
difference between a list and a workspace, and it is what makes 100 clients
tractable in a way sorting alone does not.

Do 9.1 and 9.2 first: both are cheap, and they may absorb enough of the need
to change what this should look like.

### 9.4 Profile is not Settings
**Status:** not started · **Effort:** part of the 7.x pass · **Priority:** medium

ChatGPT separates them, and its settings rail even marks Profile with an
external-link arrow because choosing it leaves settings. Profile is public
identity — avatar, handle, stats, showcase, and an Edit / Private / Share
control. Settings is configuration.

Gardnr folds both into `/profile`. Worth splitting during 7.1 rather than
after, since it is the same navigation decision.

### 9.5 A coach's public profile
**Status:** flagged · **Priority:** deferred, but think about it

For ChatGPT a public profile is self-expression. For a coach it is **client
acquisition** — credentials, results, a way to be found and to send prospects
somewhere. Distribution is the stated constraint on this product, and this is
the only item on this list that addresses it directly.

Not scoped here because it is a product decision rather than a settings one,
and because anything public touching client outcomes is health data with
consent questions attached (see 6.2). Named so it is not forgotten.

---

## Suggested order

1. ~~**1.1 Stripe portal**~~ — SHIPPED. Needs the Dashboard portal config before
   it works in production; see 1.1.
2. ~~**2.1 Log out everywhere**~~ — was already shipped when this list was written.
3. ~~**3.1 Notification preferences**~~ — SHIPPED. 5.1 (consent preferences) is
   still open and now has a panel to live in.
4. ~~**5.3 `reports.archived`**~~ — DELETED, the September removal finished.
5. **4.1 / 4.2 accessibility** — cheap, supports the AA commitment. **Next up.**
6. **8.1 branch divergence** — must be resolved before 7.x
7. **7.1–7.3 structure pass** (+ 9.4, same decision) — one pass, not piecemeal
8. **6.1 stats strip** — once the surfaces above are stable

Slot **9.1 roster search** and **9.2 pin a client** in wherever there is a gap —
both are small, neither blocks anything, and they are the two items a coach
would feel immediately. **9.3 client groups** after those two, once it is clear
how much of the need they already absorbed.
