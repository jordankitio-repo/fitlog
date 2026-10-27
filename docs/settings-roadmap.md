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

### 1.4 Billing hardening: dunning, idempotency, event de-duplication
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`) · **Priority:** was unlisted

Three gaps found by auditing the billing path against normal practice. All
three live in the "what happens when something goes wrong" layer, which is
where billing bugs live.

**1. Nobody told the coach their payment failed.** `invoice.payment_failed` set
the row to `past_due` and stopped there, so the only signal was a notice on a
page the coach had to think to open. Stripe retries for about two weeks and
then the subscription dies, taking every client's access with it — reachable in
total silence. The webhook emails now, on every attempt, because each retry is
a different message: the early ones say when the next attempt is,
`next_payment_attempt: null` marks the last one and is the only moment "your
subscription will end" is true. Not gated on notification preferences: billing
is always-on.

**2. A lost response could charge twice.** Stripe does the work and then
answers; if the ANSWER is what goes missing, the coach taps again and is
invoiced twice for one decision — both requests valid, both successful, the
only trace on a card statement. The money-moving calls now carry an
`Idempotency-Key`. The key is generated in the BROWSER per confirmed intention,
because it must be stable across a retry and different across a new decision,
and only the caller knows which it is looking at: a key derived server-side
from the request contents would make a coach who switches annual → monthly →
annual in one day have the third switch silently replay the first.

**3. Duplicate webhook deliveries re-ran real work.** Stripe delivers at least
once by design. Most handlers survived that by luck (setting a status twice is
harmless), but `customer.subscription.deleted` offboards a coach's whole
roster, flips their roles and emails all of them, and
`checkout.session.completed` burns a free trial. Events are CLAIMED now, not
merely recorded: the naive "insert the id, skip on conflict" turns a crash
halfway through into permanent silence, since the id is stored before the work
and the retry then skips it. An unfinished claim becomes reclaimable after five
minutes; a completed one never does.

**Deploy note:** `STRIPE_COACH_PRICE_6MO` is absent from the local function
env. If it is also absent in production, the 6-month cadence fails closed with
"That plan is not available right now" — correct behaviour, but check it is set.

### 1.5 Pause a subscription
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`) · **Priority:** was unlisted

The only way to stop paying was to cancel, and cancelling offboards every
client: roles flip to solo, relationships end, everyone is emailed. So a coach
on parental leave, injured, or in a quiet season chose between paying for
months they would not work and dismantling the thing they would come back to.
Most pick the second and never come back. **This is a retention feature wearing
a billing feature's clothes.**

Billing stops (`pause_collection`, `behavior: void`, so the gap is voided
rather than accrued) and **nothing else changes**: clients keep logging, keep
their history, keep their coach. That is a deliberate departure from how most
subscriptions treat non-payment, and the reason is that here the person who
would lose access is not the person who stopped paying. A client agreed to
nothing; ending their streak because their coach took leave punishes the wrong
person. It also needs no access-gate changes at all, because `pause_collection`
leaves the Stripe status `active`.

Two limits make the above something other than a free account:

- **Three months**, and Stripe resumes it itself on the date. A pause that
  needs a human to end it ends when someone remembers.
- **Once per twelve months**, measured from the START of the last pause, so
  resuming cannot reset it. Without this, pause-resume-pause is an indefinite
  free subscription assembled entirely out of legal moves.

**The placement is the point.** A standing "Pause subscription" link is only
found by someone already looking for it. The one that earns its keep is the
offer inside the CANCEL flow — "Need a break rather than an ending?" — because
that is the moment a coach who needs time off is about to dismantle their
roster instead, cancelling having been the only thing available. That cancel
step also now says out loud that clients will be offboarded, which it never
did.

*Pausing is refused on a trial (already free), on `past_due` (voiding future
invoices would look like settling a debt that stays exactly where it is), and
while a cancellation is scheduled.*

**Not built:** the reminder email a few days before billing restarts. The
resume date is chosen by the coach and shown on the card, but three months is
long enough to forget. It needs a daily `pg_cron` job calling a new function,
following `weekly-coach-digest`'s pattern including its one-shot auth helper.

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
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`) · **Priority:** was medium

System / Reduced / Full, in Profile → Appearance.

**The entry above was wrong about the premise, and the correction was most of
the work.** `index.css` "honoured" `prefers-reduced-motion` in exactly one
rule — `.brand-loader-mark { animation: none }` — while every control hover,
toggle knob, splash fade and toast kept animating. A preference observed by one
element is not observed, and a switch layered on top of that would have been a
switch that mostly did nothing. Motion is damped globally now, keyed off the
media query AND the override, in that order, so the OS setting still works with
no JavaScript.

Two details worth keeping:

- Damped to `0.01ms`, never `animation: none`. `none` on something that
  animates IN from `opacity: 0` leaves it invisible forever, so the accessible
  setting would hide content.
- `scrollIntoView({ behavior: 'smooth' })` names its behaviour in the call, so
  CSS never sees it. Four call sites (Profile, Dashboard, ClientView,
  CoachDashboard) went through `scrollBehavior()`. A settings page that
  smooth-scrolls to a section is exactly the animation someone turns this on to
  avoid.

`Full` exists so the OS setting is a default rather than a ceiling.

### 4.2 Text size control
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`) · **Priority:** was medium

Default / Large / Largest, in Profile → Appearance.

Cheaper than estimated, because the ramp was **already in `rem`** — `--text-xs`
is `0.6875rem`, not `11px`. One root font-size therefore scales all ten steps,
and the per-component overrides this entry warned about never had to exist.

`font-size: calc(100% * var(--text-scale))`, and the `100%` is the part that
matters: a pixel value would discard the reader's own browser font-size
setting and make this the one site that ignores it. Someone running their
browser at 20px who picks Large gets 22.5px, not 18px. It also means the app
respected that setting before this control existed.

Verified for horizontal overflow at Largest on the roster and the full Profile
page: none.

**A trap found while shipping it.** The pre-paint script in `index.html` is
pinned by a CSP hash in `vercel.json`. Editing one character of it — which this
had to, to apply text size before the page renders — invalidates that hash, and
the browser then silently refuses to run the script in production: no theme, no
motion, no text size, and a flash of the wrong one of each. Nothing errors, the
build passes, and the dev server has no CSP, so it only appears on the deployed
site. `tests/cspHashes.test.js` recomputes both hashes and fails on drift, in
both directions.

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
**Status:** SHIPPED (Oct 19 2026, `feat/stats-strip`, branched from
`feat/device-sync`) · **Priority:** was medium

**Current streak · Longest streak · Days logged**, as a StatCell strip at the
head of My Progress.

Two of those three did not exist. The page computed the current streak in the
browser from a 60-day pull, which could answer neither "longest ever" nor "days
logged" without shipping a user's whole history to be counted there.
`logging_identity(p_today)` answers all three in one round trip, over the whole
history, with ONE definition of the word streak — two definitions on one screen
is worse than no streak at all.

*The bug that was hiding in the old version:* the loop was capped at 60 by its
own query window, and `MILESTONES` on that page lists 90. **A 90-day streak
could not be reported, so that celebration and its email were unreachable.**
Asserted now by a test that logs 95 consecutive days.

`p_today` is the caller's LOCAL date, not `current_date`. Postgres answers in
UTC, so west of Greenwich an evening counts as tomorrow and every streak reads
as broken for the last hours of each day — the same trap E2 records for seed
data.

**What it replaced.** The standing gradient streak card is gone: it stated the
current streak in a surface of its own, directly above a page that now states
it in the strip (C6). The celebration is not lost — the milestone card is the
earned, transient one, and that is the half the design system's gradient
exception was always for. The nudge moved into the sub-line under the number it
is about. Six sanctioned literals went with the card, and the design-system
entry naming them is struck through rather than deleted, because it is now the
example of its own rule.

**Branch note:** built on `feat/device-sync`, not `main`, because that branch
rebuilds this exact page (+353/−192 in `Dashboard.jsx`). Building it on main
would have put a third version of that file in play — 8.1 again, one day later.
It therefore lands when device-sync does.

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
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`)

Each section is a route (`/profile/:section`), the shape the client record
already used. The rail navigates; the screen is only ever as long as the thing
you came for. One `isVisible` switch, sections left inline — eleven wrappers or
eleven files would both have been worse.

**The phone was the real gap, and the entry above missed it.** The rail is
desktop-only, so below 900px this was one scrolling page thousands of pixels
long with no map at all. It gets the client record's `.cv-dest` list: eight
destinations, grouped, on one screen, and a back link that names its
destination.

`?focus=<key>` is kept **permanently**, not migrated off. Stripe's
billing-portal return URL and the payment-failed email both point at
`/profile?focus=billing`, and those URLs exist outside this codebase — in mail
already sent and in a dashboard someone configured. They redirect to the route
with `replace`, so Back goes where the reader came from. An unknown section
falls back to the first real one rather than rendering nothing.

*The trap worth recording:* `SectionPanel` is declared at module scope. Defined
inside `Profile()` it would be a new component type every render, so React
would remount the whole subtree and every field would lose its value and its
focus on each keystroke — invisible in a diff, obvious the first time someone
types their name.

### 7.2 Group the rail
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`)

**You / Coaching / Account.** The split answers "what is this about?": how the
app behaves for you, how you work with the people in it, your relationship with
Gardnr. `SectionRail` already took `groups` (ClientView used them), so this
cost almost nothing, exactly as predicted. An empty group does not render, so
no role sees a heading with nothing under it.

### 7.3 One row pattern
**Status:** SHIPPED (Oct 19 2026, `feat/settings-account`)

`ui/SettingRow`: label (+ description sub-line) on the left, control on the
right. Five call sites had written that shape independently — Toggle's switch
rows, "Sign out everywhere", "Export", "Delete account", and the Appearance
choices — and **they had already drifted on the one thing a reader notices.**
Toggle labelled at `--text-base`, the hand-written ones at `--text-sm` with a
raw `fontWeight: 600`. None was wrong alone; they were only wrong together,
which is the failure a primitive prevents. A5 settles it: `--text-base` /
`--weight-medium`, with `--text-sm` muted beneath.

`stacked` puts the control under the text, for a control too wide to sit beside
it (three Pills). The header treatment is what is being standardised; where a
control physically sits is a width question, and pretending otherwise is how a
primitive starts fighting its call sites.

### 9.4 Profile is not Settings — DEFERRED, deliberately

Named in the suggested order as part of this pass; held back after looking at
it. The split is between PUBLIC identity and configuration, and there is no
public identity to separate: 9.5 (a coach's public profile) is deferred, so
renaming `/profile` to `/settings` today would move every section to a new URL,
break the Stripe return URL and the already-sent payment-failed emails, and
leave a redirect to maintain — in exchange for a page called Settings that
contains exactly what it contains now. **Do it when 9.5 creates the thing it
would be split from**, and do it in the same change, so the rename and the page
that justifies it arrive together.


---

## 8. Known debt that will get in the way

Not from the ChatGPT comparison — surfaced while working, and listed because
these items will be hit while doing the above.

### 8.1 `ClientView.jsx` divergence — RESOLVED (Oct 19 2026)

**This entry was wrong about the cause, and the real one was more tractable.**
It said main lacked the progress-chart commits. Main has them (`02e4f8a`); what
was stranded was a later, different batch.

Measured rather than assumed: `feat/device-sync` was 26 commits ahead of main,
and **15 of those were already on main under different hashes** — cherry-picked
across at some point. Those duplicates were the whole reason the branch kept
conflicting: git sees the same change twice and cannot tell which is which.
Of the 11 genuinely unique commits, only ONE was device-sync work. The other 10
were finished UI work stranded on a branch named for something else: the My
Progress rebuild (Today panel + Trends card), W/M/Y windows on both the client's
and the coach's charts, the tips refactor, a rangepicker fix.

Rebased onto main. Git dropped 14 duplicates by patch-id on its own; one more
(`eb8c568`) had to be skipped by hand after confirming its diff was byte-identical
to `c94e5ea` on main. One real conflict, in the check-in cadence row: the
incoming patch closed a `<div>` because it was written when that row held four
chips, and main had since made it a `<Select>`. Resolved to the structure main
needs, keeping the incoming change — the "applies to every client" caveat had
already moved onto the SectionHeader's `info`, so dropping the inline InfoTip
lost nothing. Verified on screen, not just compiled.

**26 commits → 11.** The branch no longer carries anything main already has, so
it will stop conflicting. `backup/device-sync-pre-rebase` holds the pre-rebase
state; delete it once the branch is pushed and confirmed good.

**History was rewritten**, so if that branch was ever pushed it needs a
force-push (`--force-with-lease`).

*The lesson worth keeping:* a branch that keeps conflicting is usually carrying
duplicates, not disagreements. Count what is genuinely unique before planning
around the conflict.

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

## 10. Page-by-page review (Oct 26 2026)

Each settings page checked against the market and the design system, one at
a time. A page is marked done when nothing in it still needs changing; what is
left goes here, so the next pass starts from a list rather than a re-review.

### 10.1 Apple Health — design done, four checks open
**Status:** design, copy and behaviour shipped (`89b471c`, `0ff54ca`). Open:

1. **A real-iPhone connection.** Everything was tested in the simulator, on
   hand-typed data. The true test is a phone with Apple Watch history: the
   year-long backfill, Watch step counts merging with the phone's, real
   workout names. Needs `device-sync` deployed to production and the app
   signed onto a device (HealthKit capability on the App ID).
2. **Deploy `device-sync` to production.** Nothing on the web depends on it,
   but Connect in the iPhone app fails until it is live, and it is also what
   records the exact consent sentence (`consent_text`).
3. **A VoiceOver pass.** `ui/Checkbox` and the switch are built on real
   controls and should read correctly; nobody has listened to them yet.
4. **Counsel review of the two consent sentences.** They follow the law's
   shape (separate, unticked, withdrawable, recorded word for word) but are
   drafts, like the Consumer Health Data Policy changes.

Already verified, not to redo: light and dark, the failed and importing
states, the "Health app > profile picture > Apps" path on a real iPhone, and
Apple's rules for the Health icon.

### 10.2 Account — done (Oct 26 2026)
Rebuilt as settings rows: tappable photo, name editing on request, email
change (confirmed from both addresses — Supabase's default, verified on the
local stack), and the client's coach in place of "Account type". Open, on the
production dashboard only: the "Change email" template is likely still
Supabase's default wording, and confirm "Secure email change" is on (the copy
says both addresses are asked).

### 10.3 Appearance — done (Oct 26 2026)
"System" for all three "follow the device" options; one-line descriptions.
Text size now follows the iPhone's own setting (Dynamic Type) in the app,
clamped at 1.35x, with Large/Largest on top. Checked at the largest
accessibility size: headers wrap, stat labels wrap only when text is grown,
tab labels hold their size as iOS's do.

### 10.4 Notifications — page done; the product gap is push and messages
The page (email preferences) is right for what it controls. What it cannot
fix is the bigger gap against every coaching app on the market (Trainerize,
TrueCoach, Everfit):

1. **No push notifications at all.** Needs an APNs key from the Apple
   developer account, `@capacitor/push-notifications`, the iOS permission
   prompt at a sensible moment (not first launch), a device-token table, and
   a sender. The panel is already grouped under "EMAIL" so a "PUSH" group can
   sit beside it.
2. **A new message alerts nobody.** No email, no push: a client learns their
   coach wrote only by opening the app. Needs a sender that waits a few
   minutes and only alerts if the message is still unread, so a quick
   back-and-forth is not ten emails. Push is the natural channel; email is the
   fallback.

### 10.5 Your details — done (Oct 26 2026)
Fixed a real layout bug: on iOS the date-of-birth field ran past the card's
right edge (WebKit's date input will not shrink below its own editor). Also
on Onboarding, same class. Height states its unit in the label; "Sex · for
metabolism" as onboarding says it; Save is muted until something changes.

### 10.6 Daily targets — done (Oct 26 2026)
A client now sees coach-set targets as read-out rows (Nutrition / Activity /
Body, "Not set" for a blank) with a link to message the coach, instead of the
solo form greyed out and read-only. The solo form's Save is muted until an
edit, like Your details.

### 10.7 Security — page done; two features missing (Oct 26 2026)
Password is a row that opens on request (it stood open with a filled button
for something optional), rules stated up front, an em dash removed, and
"Sign out everywhere" a compact row. "Edit", not "Set"/"Change": Supabase does
not expose whether an account has a password.

Missing against the market, both larger than this page:
1. **Two-factor authentication.** Supabase supports TOTP MFA (authenticator
   app). Worth it at least for coaches, who can see every client's health data.
2. **Signed-in devices.** A list with last-used and per-device sign-out
   (Google, ChatGPT). Supabase does not expose sessions to the client, so this
   needs a server function over `auth.sessions`.

### 10.8 Data — done (Oct 26 2026)
**Fixed a real bug: Export did nothing in the iPhone app.** A blob download
link has nowhere to go in a WKWebView; it now opens the iOS share sheet
(Save to Files, AirDrop, Mail) via the Web Share API, with the old download
kept for the web. Copy says what the file holds (the whole account, not four
logs; no "JSON"), no em dashes. Delete account is a plain row whose red
arrives on confirm; the confirm step names the email the code goes to and
offers the export first, instead of repeating "are you sure".

### 10.9 Coach tab (client) — done (Oct 26 2026)
**Fixed in the iPhone app:** the column was sized for a browser, so it ran
taller than the screen. The whole page scrolled, the composer sat half under
the tab bar (Send hidden), and the thread opened at its oldest item. Now sized
from the same safe-area terms as the bars, the composer is pinned, and the
thread opens on the newest message (scrollTop before paint, and again on tab
return). Composer is one growing field with Send beside it; an unsent draft
survives closing the app (per user, per device).

Open:
1. **Keyboard on a real iPhone.** The simulator here types with the Mac's
   keyboard, so the on-screen keyboard was never shown. Confirm the composer
   stays visible above it; if not, `@capacitor/keyboard` with resize mode.
2. **Photos in messages.** Every coaching app (Trainerize, TrueCoach, Everfit)
   lets a client send a meal or progress photo. Needs a storage bucket with
   the same RLS as messages.
3. **No alert for a new message** (see 10.4).

### 10.10 Log — done (Oct 26 2026)
Nutrition totals now carry today's targets ("2,262 of 1,850"), ungraded, so
the Log does its one comparison (today vs today's goals) for food as it
already did for steps. Each meal has its own "+ Add" (44pt target) opening the
form with that meal chosen, so adding dinner no longer means scrolling past
the day. "Mark day complete" moved after the entries; thousands separators;
sentence-case buttons ("Log weight", "Log steps" too). "Mark day complete"
is full width on a phone only; on a desktop it was a 1,200px bar.

Checked: light and dark; iPhone at the largest accessibility text size; a
client with calories hidden by the coach (three columns); an empty day; every
form (weight, steps, workout, measurements, add food), copy day, select mode,
quick add; desktop at 1280px in both themes. No console errors.

### 10.11 My Progress — done (Oct 26 2026)
- Today card labels are neutral; the metric hue stays on the bars (labels in
  the metric colours failed WCAG on the light card).
- "Leave coaching plan" moved from the foot of this page to Profile > Account,
  under Coach, with a confirm naming the coach.
- With calories hidden, the three macros are one row of three at every width
  (Fat sat alone in a 2x2; desktop left an empty fourth column).
- Trends say "logged days" from distinct days, and claim a trend only on 3+
  days a side (weight has a row per weigh-in, so rows overcounted).
- "30-day" uses a non-breaking hyphen so large text does not split it.
- Trend rows rewritten to Apple Health's brevity after the user caught the
  wording: one word ("Average", "Steady", "No data") or the change with its
  unit ("+146 cal", "−647 steps"). The W/M/Y control names the window and the
  arrow names the direction, so the row repeats neither; the explanation lives
  in the info tip. The arrow only shows when there is a trend (Cardio drew a
  down arrow beside "Average"). Welcome card cut from three sentences to one.

Checked: light/dark, phone and desktop, largest iPhone text, client / solo /
hidden-calories / empty account, a past date, an opened trend, W/M/Y, the
leave-plan confirm. No console errors. Open: the red "To do" check-in badge
is 8.3's pending colour decision.

### 10.12 Copy re-audit of every reviewed page (Oct 26 2026)
The earlier reviews (10.2–10.10) checked rendering, not wording against the
reference apps. Every user-facing string over ~45 characters on Profile, Apple
Health, Coach and Log was extracted and held against Apple Health/Fitness
brevity; 14 rewritten (export, sign-out, delete, notification and Apple Health
descriptions, Log's grouping errors, Coach empty state, an em dash in the
Solo upgrade line). Log's Select button lost its native `title` tooltip (D5).

### 10.13 Notifications (the bell) — done (Oct 26 2026)
- Phone: a bottom sheet (ActionSheet's frame, 85dvh, dimmed backdrop, Done)
  instead of a dropdown laid over the top bar with nothing dimmed and no close.
  Desktop keeps the dropdown, the norm there.
- Copy named and short: "Alex reviewed your check-in", "Alex sent a reminder /
  Log your meals today", "Progress view reopened / Log within 48 hours to keep
  it open", and the check-in alert says the client's real cadence
  ("Biweekly check-in due"), not always "Weekly".
- Group headings only when there are two groups; rows light on hover/press.

Checked: coach and client (event list, lock state), light/dark, phone and
desktop, largest iPhone text, Done, row navigation; no console errors. Open:
push notifications and new-message alerts (10.4).

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
5. ~~**4.1 / 4.2 accessibility**~~ — SHIPPED.
6. ~~**8.1 branch divergence**~~ — RESOLVED. 26 commits → 11, mostly duplicates.
   7.x is unblocked.
7. **7.1–7.3 structure pass** (+ 9.4, same decision) — one pass, not piecemeal
8. **6.1 stats strip** — once the surfaces above are stable

Slot **9.1 roster search** and **9.2 pin a client** in wherever there is a gap —
both are small, neither blocks anything, and they are the two items a coach
would feel immediately. **9.3 client groups** after those two, once it is clear
how much of the need they already absorbed.

### 10.14 Today and Progress split (Oct 26 2026)

The Today panel repeated the Log's totals one tab over. It moved to the top of
the Log (now the **Today** tab): each part opens its records below it (macros
open the meals, Cardio the workouts, Steps and Weight their editor). **Progress**
(was My Progress) is trends and history only, with no day picker. Leftovers:
- Tab order is still Progress, Today. The app opens on Progress (`/`); making
  Today the first tab and the landing screen is a routing change, not yet asked.
- With one workout, its row repeats the Cardio total in the panel; accepted,
  since the row is the session record.

### 10.15 Pushed pages and sheets (Oct 26 2026)

Rows with a chevron now push (components/PushPanel): All reports, every report
opened from the Coach tab, and every Profile section, on a phone. Sheets
(notifications, a report on a wider screen) slide back down on close
(hooks/usePresence). Needs a real phone:
- The left-edge swipe back (a simulator cannot drag in from the bezel).
- Typing in a Profile section inside the pushed page with the iOS keyboard up.

### 10.16 Client onboarding (Oct 26 2026)

Rebuilt as one question a screen (welcome from the coach, Apple Health,
about you, weight, goal, activity, targets) with back, progress and "Set up
later" on every screen. Apple Health now also reads sex, date of birth and
height (consent text, NSHealthShareUsageDescription, Consumer Health Data
Policy and HEALTH_POLICY_VERSION 2026-10-26 changed together) to fill the form.
A coach's existing targets are never overwritten. Open:
- Real phone: the full flow with a real Health profile (verified in the
  simulator with sex, date of birth, height and weight all prefilled).
- Production: the new consent text and policy version need no migration, but
  the policy page change ships with the frontend; counsel review of the policy
  wording is still outstanding (the page is marked draft).
- Clients who connected Apple Health before this are not asked for the three
  new types until they reconnect; Settings still uses the old flow.
- Unit label: done. Stored as 'lbs', shown as "lb" everywhere through
  utils/weightTarget.js unitLabel().
- Status bar and system sheets now follow the app's own theme, not the phone's
  (AppearancePlugin in SceneDelegate.swift): a light page with the phone in
  dark mode drew a white clock and battery.
- Real phone: the Apple Health connect FAILURE message (seen only in code). A
  failed final save was checked: message shown, retry works.

### 10.17 App launch (Oct 26 2026)

The launch screen (LaunchScreen.storyboard: LaunchBackground colour, 96pt
LaunchMark) and the page's splash (index.html) are now the same picture, held
by @capacitor/splash-screen until the page has painted, so the hand-over is not
seen. No minimum wait, no 1.5s zoom; a 250ms fade once the landing screen is
decided (HomeLanding holds it). The tab selector snaps, not glides, under it.
Fixed on the way: Automatic theme stayed stuck on dark after the status-bar
fix (AppearancePlugin now hands 'auto' back to the phone).
Open: the launch screen follows the PHONE's appearance (iOS gives it no other
input), so a client who chose Light in Gardnr with the phone in dark mode sees
a dark launch screen fade to a light app. Real phone: launch timing on device.

### 10.18 Coach sets client targets (Oct 26 2026)

Reviewed the coach's Client targets form end to end. Fixed:
- A coached client could PATCH their own targets and goal past the read-only
  screens. Migration 20261026010000_coach_owned_targets: once a client with an
  active coach has finished setup, targets are read-only to them and
  primary_goal is guarded by a trigger; setup can still write starting
  targets; solo users unaffected. tests/rls/coachOwnedTargets.test.js.
  MUST be applied to prod before the frontend ships (Onboarding now writes
  targets before stamping onboarded_at).
- Failed saves were silent; now a toast, edits kept.
- Negative/absurd values were saved; utils/targetChecks bounds them, and shows
  the macros' calorie total ("Use 1,340") on the coach's and the solo form.
- The client was never told; targets.updated_by feeds "Marta updated your
  targets" in the bell.
- The calculator asked for the current weight the client logs; it now takes
  the latest weigh-in and the pace the goal implies (PACE_FOR_GOAL, shared).
- Save is muted until something changes; leaving the tab with unsaved edits
  asks first.
Open: leaving by an in-app link with unsaved edits does not ask (the router
is not a data router, so there is no navigation blocker); edits survive
switching sections of the same client.

### 10.19 What a page review means (fixed Oct 26 2026)

Every page review, in this order, the same every time:
1. Market: the equivalent screen in Trainerize, TrueCoach, Everfit, Kahunas
   (coach) / MyFitnessPal, MacroFactor, Apple Health & Fitness (client); a gap
   list, must-have / nice-to-have.
2. Trend: what the page should already have or be ready for.
3. Best practices: the main tasks timed in steps, urgent first, error
   prevention, consistency, HIG / WCAG.
4. Finish line: light and dark, largest text, every role, empty / loading /
   error, every form, phone and desktop, copy at the reference apps' brevity,
   no crowding or duplication, web checked in Safari on the simulator.
Pages reviewed before this (Profile, Coach tab, Log/Today, Progress, bell,
setup) had only 3-4; they owe one market/trend catch-up pass.

### 10.19 Coach: Clients roster (Oct 26 2026), full review

**Market** (Everfit check-in dashboard, TrueCoach, Trainerize, Kahunas):
- Must-have, done: search by name/email; status counts that filter the list
  (Everfit's views with live counts); whole row opens the client; message from
  the row (TrueCoach's chat icon); invite button in the header; invites sent
  but not joined, with copy link / resend / cancel (Everfit "waiting
  activation").
- Must-have, built (20261026020000_roster_tools): groups (label, filter,
  message the group with {first name}, two minutes between sends: Everfit's
  level); pause with an end date (7 days by default) and a reason, a Paused
  count and view, no grades / nudges / check-in reminders / lock while paused,
  ends by itself with 48 hours' grace, coach reminded 2 days before, client
  told on their Coach tab (Everfit's level).
- Nice-to-have, open: saved custom views; a column picker; editing a group's
  name (delete and recreate today).
**Trend**, built: automatic nudges by rule ("quiet for N days", daily,
auto-nudge function + pg_cron, same cooldown and opt-outs as the button;
set in Profile > Coaching > Nudges, not on the roster, at the user's call).
Not confirmed at any competitor; Trainerize users have asked for it for
years. A daily AI brief at the top of the roster was built and REMOVED at
the user's call (Oct 26): do not reintroduce a prose summary above the list.
**Security fixed with them:** a client could update their own coach_clients
row (self-unlock, un-hide calories); a coach could message any user. Both
refused in the database now (tests/rls/rosterTools.test.js).
**Open:** the auto-nudge emails are untested end to end
locally (no Resend key); the auto-nudge job needs its pg_cron
entry created with the service key, as weekly-digest's was.
**Best practices, steps for the main tasks:** see who needs you 0 (as before);
open a client 1, now any part of the row; message a client 1 (was 3 or more);
see only at-risk clients 1 (was impossible); find a client by name: type (was
scroll); invite 1 from the header (was scroll to the foot); see who has not
joined 0 (was impossible).
**Fixed on the way:** "Welcome, <name>" removed; "needs review" renamed
"needs attention" (it collided with "check-ins to review"); "checked in" now
"checked in this week"; ADH/NRG spelled out; email dropped from rows (still
searchable); status sits beside the name instead of across the page; the
empty state's second invite button removed, and it says "Waiting for your
clients to join" once an invite is out.
**Leftovers:** Resend has no server-side rate limit (notify-invite); the
phone row has no message button (row opens the record, Message is one tap
there); Resend cannot be exercised locally (no email key).
**Checklist pass (Oct 26):** light, dark, largest text, phone and desktop;
empty roster; failures for pause and groups (toast, sheet stays open). Fixed
on the way: the "i" help still described an "ATTENTION column"; the check-in
stat boxes vanished on the pushed page; small sheets (Pause, Groups) filled
the phone screen (only a report sheet is tall now).
**Leftovers:** no message button on the phone row; group names cannot be
renamed (delete and recreate); a row does not show its groups.


### 10.20 Coach: client record (Oct 26 2026), full review

**Market** (Trainerize profile, TrueCoach client updates, Everfit profile,
Kahunas Progress Overlay):
- Must-have, built at the user's go (20261026030000_progress_photos):
  **progress photos**. Client: front / side / back slots for the day on
  Today (add, replace, delete with a confirm), and a Photos card on
  Progress. Coach: a Progress photos section on the record (a Trends chip on
  the phone) with a Request button (nudge email "photos"). Compare: two
  dates of one pose side by side, or a slider (Kahunas's Progress Overlay).
  Private bucket, signed URLs, readable by the owner and the ACTIVE coach
  only (not a former coach, not the coach's other clients), written by the
  owner only, re-encoded in the browser (drops EXIF/GPS), purged by
  delete-account. tests/rls/progressPhotos.test.js (8) + erasure contract.
- Must-have, built: **check-in history** (the record showed only the latest
  one; now "Earlier" lists the six before it, opening in place; a "↓ from 5"
  beside each rating was tried and removed at the user's call: the Earlier
  rows already show the run); **pause and groups on the
  record** (the roster's ⋯ menu and sheets, shared in
  components/ClientSheets.jsx); **who this is** (goal · client since ·
  groups under the name, Trainerize's profile header).
- Nice-to-have, open: custom metrics (TrueCoach); a pinned note at the top
  (Everfit users ask for it); body composition widgets (Trainerize).
**Trend:** AI meeting prep and report drafts exist (Groundwork); automatic
nudges exist (roster rule). Built: device-synced values are named on the
record's Today's stats ("Apple Health" under steps, weight, cardio), from
the same list the client's Today uses (utils/metricSources.js).
**Best practices, steps:** review a waiting check-in on a phone was two
screens of scrolling past the day's stats and adherence; it is now straight
under the header (0 scrolls). Pause a client from the record: 3 taps (was:
back to the roster, find them, 3 taps).
**Fixed on the way:** a paused client's header showed nothing and still
offered Nudge; now "Paused until Nov 2 · Holiday", muted, and no Nudge.
Opening ANY non-tab page from a scrolled page kept the scroll (a client
opened from a roster scrolled 700px down landed mid-record); pushed pages
now open at the top and Back restores (App.jsx).
**Checklist pass:** light, dark, largest text, phone and desktop; pause,
resume, groups add/delete, pause failure (toast, sheet stays open).
**Photo review (market pass, Oct 26):** added what Everfit / Azeoo / FitSW
lead with: the weigh-in nearest each photo on the photo and in the caption
(utils/progressPhotos weightNear, within 3 days, in the reader's unit), the
change between the two compared dates ("-2.7 lb · 34 days apart"), a
timeline of every date of the pose, and a full-screen viewer (tap to zoom,
arrows, keys, swipe). One name on both sides: "Progress photos". Open
(decision with the user): a ghost overlay of the last photo in the camera
(Progressly, ProgressCam), which needs our own camera screen.
**Photo leftovers:** the hosted demo sandbox has no photos table until it is
migrated (the simulator build points at it, so its Photos card says
"Couldn't load photos" until then); the Consumer Health Data Policy must
name progress photos before launch, and the Phase 2 data export must
include them; photos attached to a check-in (Trainerize, Everfit) is
nice-to-have; real iPhone: the camera / library permission prompts and a
capture from the camera; the photo picker inside the installed PWA (the
Safari tab was tested, the home-screen app was not: the simulator's home
button would not respond to automation); a tap on a sheet row never reaching
the button underneath (seen once on the simulator, not reproduced).
**Safari pass (Oct 26):** fixed the toast hiding under the chat button
("Paused until No"), photos not refreshing when you return to Progress or
Today (kept tabs), and the slider drawing in iOS blue.


**Section-by-section pass (Oct 26, phone, MacBook-size WebKit, iPhone Safari,
light/dark/largest text, a never-logged client):**
- Status said "On track" over a heatmap of 0 days on target: the roster grade
  counted calories at >=90% with no ceiling. Now one rule for every surface,
  `calorieDayOnTarget` (90-110%, complianceBreakdown.js).
- Weight read in the logged unit in places (lb card, kg Trends row): the record
  now shows every weight in its one display unit (the goal's).
- Today's stats: metric colours on the labels (B2 says labels are neutral); now
  grey labels with a metric-coloured progress bar, as the client's Today.
- Nutrition rows match the client's own Today rows ("691 kcal", serving and
  macros beneath); meal totals take thousands separators.
- Adherence: "Days logged" caption over the six logging tiles; zeros muted (no
  green 0); middle grades amber, not the primary action green; the weekday
  axis no longer prints "UNDERTARGET OVER".
- Charts: dates "Aug 27", level, thinned to fit (were "08-27" at 45 degrees);
  the Calories legend has a grade swatch (it had none); the colour switch is
  labelled "By target" (it was a bare switch).
- Notes: dated entries in the app's type (were one monospace box); a failed
  save now says so and keeps the text.
- Coaching offers Pause before Offboard; Targets says "Ava sees these on their
  Today tab" (was "dashboard") and is 720px wide at most on a laptop.
- A never-logged client: "Never logged · No check-in · Nothing logged" lost
  its repeat; six red zeros are muted.
**Private notes, one row per note (20261026040000_coach_note_entries):** the
single text field could lose a note (two open copies, the second save wrote
back a text without the first), let "Edit history" wipe everything at once,
and rendered every note on every open. Now: add is an insert, edit and delete
per note (confirm), ten at a time with "Show older notes", a long note shows
six lines with "Show more", 5,000 characters a note with a counter near the
limit. Old notes were split into rows with their dates (time not kept: the old
stamps had no zone); coach_notes is left untouched as the backup and is no
longer read. Meeting prep gets the ten newest, dated.
**Notes, market pass (Oct 26):** built what closes the gap with Trainerize:
flag a note (pinned under "Flagged" and named in the record's header, linking
to Notes), delete with Undo instead of a confirm (the same row comes back), and
search across every note (database-side, highlighted, shown once there are
more than five). Open, in order of value:
- Note templates (intake, consult; Practice Better's ADIME/SOAP-style), matters
  most if dietitians are a target.
- A note tied to a check-in or a day, shown in that context.
- Notes shared between coaches, once team accounts exist.
- AI: "summarise this client's notes", "draft a note from this check-in"
  (meeting prep already reads the flagged and the ten newest).
- Compliance: the Phase 2 data export must include coach_note_entries.

**Progress photos, market pass 2 (Oct 27, 20261027000000_photo_schedule):**
photos are an optional step in every check-in (one rhythm: a separate photo
schedule was built and removed at the user's call as two schedules for one
routine; Request asks for a set off-rhythm). The coach's check-in review
shows the period's set with "Compare to <last>" (all three poses). Today
shows one row ("Last set Oct 26") opening the slots in a sheet, not three
slots a day. Capture: last time's photo faintly in each empty slot, one tip
line, "Add all three". Compare: an "All" chip shows every pose for two dates.
Before/after image (dates, weights, every shared pose) for the client always
and for the coach only with the client's switch (profiles.
share_progress_photos, client-only; no note shown to the coach without it).
Data export includes progress photos (7-day links) and coaches' notes.
Open: a real camera screen with a live ghost overlay (needs native work);
timelapse.
