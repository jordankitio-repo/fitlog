
# Gardnr — Decisions Log

> **Purpose:** The reasoning behind every major product and technical choice. When a future decision contradicts one here, add the new decision rather than editing the old one — the history of *why* matters.
>
> **Format:** Decision / Reason / Consequences. Grouped by area.
>
> **What does NOT belong here:** how things are wired (→ `architecture.md`), live status (→ `current-state.md`), feature backlog (→ `features.md`).

---

## Product Strategy

### Nutrition is the core product, not an add-on
**Reason:** Every competing platform (Trainerize, TrueCoach, Hevy) treats nutrition as an afterthought or a paid add-on and outsources it to MyFitnessPal. Gardnr makes nutrition tracking, macro compliance, and body composition the core product.
**Consequences:** Product positioning is "the nutrition layer alongside whatever workout tool you already have," not a workout platform. Workout programming is explicitly deferred until nutrition coaching is validated. Native nutrition logging is built in, never outsourced.

### Food search uses USDA FDC; barcode stays on OpenFoodFacts
**Reason:** Two different jobs. Barcode = identify a *specific packaged product* by UPC → OpenFoodFacts is a barcode DB, its strength. Typed search = find a *generic food* by name → USDA FoodData Central's curated Foundation/SR Legacy/FNDDS data is built for that. Splitting by entry point uses each DB for what it's best at; merging both into one search would add dedup/ranking/double-call overhead for a noisier result.
**Consequences:** `food-search` queries FDC only (generic dataTypes, no Branded noise); barcode lookup stays on OFF. The FDC key lives server-side in the edge fn (auth-gated). Both sources normalize to the form's per-100g `baseNutrients` model, so the prefill UI is source-agnostic. Food search + Quick add are logging *convenience* → wall-safe, available to all roles incl. free (convenience isn't prescription).

### Coach–client layer is hard-walled from solo users
**Reason:** Protect the coach product's positioning and price. A solo user who wants accountability should need a coach, not a cheaper self-serve tier that replicates coaching.
**Consequences:** Solo Premium gets *better self-analytics only*. The interaction layer (targets-from-coach, reports, check-ins, nudges, call prep, private notes) is never available to solo regardless of tier.

### Solo self-analytics stay descriptive, never prescriptive
**Reason:** A sharper line under the hard-wall above. The dividing test for any solo-facing analytic: does it *describe the user's own past behavior* (allowed), or does it *prescribe what to change / hold them accountable / adjust a plan* (coach-only)? A descriptive stat is a mirror — and a mirror that surfaces the user's own gaps (e.g. "weekends 50% vs weekdays 86%") actually *deepens* the pull toward coaching rather than substituting for it.
**Consequences:** The Premium "Logging consistency" card (weekday/weekend split, best week, 90-day heatmap) and the milestone banner are pure reporting — no advice copy, no "do X next," no implied observer. Prescription, plan adjustment, and accountability remain coach-only. Apply this test to every future solo analytic (TDEE, rate-of-change, etc.) before shipping it un-gated to solo.

### No fabricated-confidence numbers — intelligence we can't earn yet, we don't fake
**Reason:** The coaching-intelligence vision is full of tempting outputs that *look* like ML but require data we don't have: churn-risk **percentages** ("76% chance of churn") imply a model trained on labeled outcomes we won't have for a year+; per-client **correlation coefficients** ("protein +0.81") computed over 30–60 days of one client's data are statistical noise dressed as insight. A coach who acts on a spurious number once and is wrong stops trusting the whole product — fabricated confidence is a credibility *liability*, not a feature. This is the descriptive-honesty doctrine (above) applied to coach-facing intelligence: surface what the data actually supports, nothing more.
**Consequences:** Near-term coach intelligence is **rules + observed trends with no invented numbers attached** — e.g. "logging down 40% this week, 2 check-ins missed, weekend calories +850 over target on 4 of last 5 weekends." These are factual flags, shippable now, and more trustworthy than a score. **Hard line:** no churn percentages, no per-client correlation coefficients, and no cross-client "coaches like you" benchmarks until there is enough real data to earn them (named trigger required before building, same as workout programming). AI weekly reports (architecture diff. #8) consume *structured aggregates* — trends, adherence rates, counts — never raw logs, and never emit a confidence number the underlying data can't support.

### Calorie compliance "on-target" is a BAND (90–110%), not a floor (Jun 10)
**Reason:** The original compliance logic counted any day ≥90% of target as "on-target" with no upper ceiling, so a fat-loss client eating 145% read as a solid-green heatmap and "42/42 on-target, 113% avg" — looking perfect while actively sabotaging the deficit. When the weekday/weekend bars (which *do* flag overeating) shipped beside it, the two contradicted each other. Over-eating relative to a prescribed target is a deviation, full stop.
**Consequences:** `summarizeCompliance` and `ComplianceHeatmap` now bucket: **on-target 90–110% (green), over >110% (orange #fb923c), under 60–89% (amber), well-under <60% (red)**. The coach summary shows an **Over** tile; the Progress-overview calorie bars are colored by the same buckets with a 100% target reference line. **This is shared with the solo side** — solo's heatmap shows over-days as orange and "On-track days" excludes them (still descriptive, no advice; consistent with the descriptive/prescriptive wall above). The ±10% band matches the `ComplianceBreakdown` "near target" band, so all four surfaces (heatmap, summary, bars, progress chart) agree. Cardio % bars are NOT bucketed this way — over-target cardio is good, not a deviation.

### Coach instruments state facts + provenance, never plausibility verdicts the coach can judge better (Jun 11)
**Reason:** Sharpens "tool not prescription" and "no fabricated-confidence numbers" into a build rule. The `EnergyBalanceRead` first shipped a flag — "maintenance ~1,800 is *below typical* → usually under-logged" — and it was wrong on two counts: (1) it asserted a **conclusion** without showing its work, so a coach rightly asks "says who?"; (2) the conclusion compared two *soft* numbers (our own estimate's band **and** a crude 13–16×bodyweight "typical" heuristic) and declared one "well under" the other — false confidence on both sides, unfixable by wording because the *act of asserting the comparison* is the problem. The deeper point: judging whether an estimate is physiologically plausible needs a "true maintenance" reference the **coach has** (they know the client's activity) and we were faking with bodyweight math. We were doing the coach's thinking, badly.
**Consequences:** Coach-facing intelligence surfaces **what we measured + how it was derived**, and stops. `EnergyBalanceRead` shows maintenance as a range *with its inputs visible in the adjacent rows* (logged intake, weight trend) — every number traces to something on screen — and the coach supplies the plausibility judgment from their own client knowledge. Caveats are **data-quality only** (band still settling, % of days logged), never physiological inference. The "look here" signal is recovered *honestly* by coloring the **Logged-vs-target gap** by compliance (green within ±10%, amber off-plan) — a pure fact (N off the prescribed target), not a verdict; the coach connects amber-gap + low-maintenance → under-logging themselves. **Test for any future coach instrument: does it state a fact whose provenance is visible (ship), or assert a conclusion the coach's client-knowledge could judge better (cut)?** Color may carry *plan-relative* meaning (toward/away the goal; on/off the target) but never an absolute outcome grade.

### The landing page embodies the same no-fabrication doctrine (Jun 12)
**Reason:** A landing-page review (scored 8.3/10) pushed the standard SaaS conversion levers: add testimonials, add quantified ROI ("save 2–5 hours/week"), invent before/after numbers. With ~zero real coaches, the only way to "add a testimonial" today is to fabricate one, and quantified ROI we've never measured is a made-up number. The product's whole differentiator is *facts + provenance, no fabricated confidence* (above) — a faked quote or invented metric on the marketing page contradicts the exact promise the product makes. Borrowed credibility you haven't earned is a liability, not a lever.
**Consequences:** **No testimonials, case studies, or quantified ROI claims** until real coaches generate them. Outcome framing stays **qualitative and true** ("walk into every check-in already knowing what happened"), never invented numbers. The honest substitute for social proof is **founder-led authenticity** (a founder's note + a "founding coach" angle — which also surfaces the already-decided $19 founding rate, see Pricing). The hero product preview is a **stylized interactive mock, not a real screenshot** — it demonstrates the workflow (hover a client → triage/compliance/report react) without pinning the page to churning UI or implying a polish level the app hasn't reached. Review critiques worth acting on later (not yet done): sharper category-first headline, surfacing "no app download" more prominently, a real product screenshot/loop once the UI stabilizes.

### Milestone celebrations are in-app for all loggers; the coach email is conditional
**Reason:** A streak celebration is self-motivation, not coaching — it belongs to anyone who logs (Solo Free included, per the tier matrix). Only the *coach notification* is part of the coaching layer.
**Consequences:** `fireMilestone` runs for client and solo roles; the `milestone-reached` edge fn records the streak and emails a coach **only when an active relationship exists**, so coachless solo users get the banner with zero email side effect. Coaches (who don't log) never trigger it.

### Clients are always free
**Reason:** Clients are invited by a coach, not self-serve payers. The coach pays for the platform and brings the client.
**Consequences:** No client-side billing. Clients receive the coaching layer but not solo self-analytics (those are either a coach-side view of client data or a Solo Premium upsell). Offboarded clients fall back to a solo tier.

### Web-first, no client app download
**Reason:** Removing the app-install step lowers friction for coaches onboarding clients — a key differentiator.
**Consequences:** Everything must work in-browser and be mobile responsive. A branded mobile app is far-future only.

### Solo is now free — the Solo Premium paywall is retired (Jun 13 2026)
**Reason:** With zero coaches onboarded yet, gating solo self-analytics behind a $7.99 upsell was friction with no payoff — solo users are the top of the funnel and potential word-of-mouth, not a revenue line. The business model is coach subscriptions; solo stays free to grow usage and prove the product.
**Consequences:** `SOLO_BILLING_ENABLED = false` in `App.jsx` disables the solo paywall app-wide (the SoloUpgrade CTA / Premium gates no longer block solo features). The Stripe solo price/plumbing is left intact but dormant, so it can be re-enabled by flipping the flag if the strategy changes. **Coach billing is unchanged.** Legal docs still referencing Solo Premium $7.99 terms are now stale (see `current-state.md`).

### Build out solo logging completeness as the acquisition on-ramp, despite ~1 active coach (Jun 15 2026)
**Reason:** Coaches are the customer, but the solo tracker is the **on-ramp**: solo→coached is the funnel, and because solo + clients write the same tables, a converting solo user's history carries straight into the coach's view (active-relationship RLS). A solo tracker that hits friction walls (no meal grouping, no saved meals, can't find a food) won't acquire or convert. So solo feature-completeness is distribution work, not scope creep — *provided* it stays "table-stakes," not parity with Cronometer (whose moat is a food DB + micronutrient science we explicitly won't chase; see vision).
**Consequences:** Shipped Layer 1 (meal grouping, saved meals, Complete Day, roster rollup) and started Layer 2 (check-in review queue) even at ~1 client. The guardrail still holds: the binding constraint is **distribution** (getting coaches), and competitor-feature teardowns have diminishing returns — features are pursued only where they (a) close a real table-stakes gap *and* (b) also strengthen the coach side via the shared data. Backlog + remaining Layer 2/3 in `features.md`; status in `current-state.md`.

---

## Design & UX

### Dark is the default; light mode is opt-in/auto (Jun 14 2026)
**Reason:** The brand and all prior design work is dark-first, but a light mode is table stakes for daytime/outdoor use and accessibility. Rather than fork styles, the entire neutral surface/text ramp was tokenized so a theme is just a different set of CSS-variable values.
**Consequences:** Preference (`gardnr-theme`: `auto`|`light`|`dark`, default `auto` → follows the OS via `matchMedia`) lives in `utils/theme.js`; resolved value is written to `<html data-theme>`, and `:root[data-theme="light"]` in `index.css` flips the ramp. An **inline script in `index.html` applies it before first paint** (must stay in sync with theme.js) to avoid a flash. **chart.js renders to canvas and cannot read CSS variables**, so all chart chrome (ticks/grid/tooltip/target line) uses theme-agnostic literals in `utils/chartTheme.js` (`CHART`) that read on both backgrounds — never put `var(--…)` in chart options. Interactive control outlines use a dedicated translucent `--color-control-border` (the decorative `--color-border` is too faint to read as a button edge on white). The **landing page (`.lp`) is deliberately always-dark** (hardcoded, full-bleed) and excluded from tokenization.

### A design-system layer (tokens + primitives), migrated conservatively, with charts as the exception (Jun 16 2026)
**Reason:** The styling debt (~340 ad-hoc font sizes, ~160 raw hex, 13 duplicated style-objects) caused a steady drip of small inconsistencies. The fix is consolidation, not a redesign: the token foundation already existed in `index.css` — it was just bypassed. So: finish the tokens (add `--color-success`/`--color-warning`/`--color-on-accent`/`--text-base`), extract the missing primitives (`src/components/ui/`: Card, Field, Pill, IconButton, Badge), and migrate pages onto them.
**Consequences:** Migration was done **conservatively / near-zero-shift** — raw hex mapped to its identical token value, only the cramped `0.6–0.9rem` small-text spread snapped to the `--text-xs/sm/base` ramp (≤1px). The genuinely-visible "opinionated" polish (uniform pills, density) was **deferred** because it shifts pixels and needs the seeded screenshot harness to verify — judgment-heavy work to do with the user, not blind. **Hard rule: never tokenize a value a CSS var can't reach** — chart.js dataset colors, SVG `stroke`/`fill` attributes, `--gw-accent` custom props — those stay literal (carry an inline `eslint-disable`). An ESLint `no-restricted-syntax` rule (scoped per-file, grown as pages migrate) errors on a raw hex `color:` to stop regression. This was craft/maintainability work — **explicitly NOT the binding constraint** (distribution is); timeboxed because it stops the bleed of one-off fixes.

### Section rails: a sticky in-page nav for long pages, desktop-only, mirroring live order (Jun 16 2026)
**Reason:** ClientView and Profile had grown into long single-column scrolls; the user (comparing to Vercel/Stripe) said the app felt "a little disorganised." A left **section rail** with scroll-spy + click-to-jump fixes orientation without re-architecting the pages — they stay single scroll, the rail is pure navigation over what's already there.
**Consequences:** One presentational `SectionRail.jsx`; each page supplies its sections **in live render order** (ClientView via `mergeOrder(cardOrder, …)` so the rail tracks the coach's saved `Reorderable` order; Profile via a role-filtered static list) and the rail emits `goToSection(key)` back. Reuses the existing `?focus=` deep-link channel (notifications already used it) for both the "Messages" item (`?focus=chat` → `ChatBubble`) and cross-page jumps (`/profile?focus=questionnaire`), rather than inventing a second open/scroll API. Deliberate calls: **desktop-only** (≥1024px) — on mobile the page is a short single column where a rail adds nothing and costs width; **no Dashboard rail** — the coach roster is too short to have anything to jump to (a rail there is decoration, not navigation); **"Messages" shown only where a chat bubble is mounted** (always on ClientView; Profile only for clients) so it's never a dead link; **icons on every item or none** — a glyph on just "Messages" read as inconsistent, so a shared key→icon map covers all items. These are UX/IA polish, **not the binding constraint** (distribution is).

### Notifications: events drop off, alerts persist until resolved (Jun 13–14 2026)
**Reason:** The bell carries two fundamentally different things. A message/check-in/report is a one-off **event** — seeing it is the end of it. "A client has gone quiet for 3 days" is an ongoing **condition** — it must not vanish just because you glanced at the bell; it should stay until it actually clears. Collapsing both into one "mark all read" model (the naive approach) either loses unresolved problems or, if you keep everything counted, produces a permanently-lit badge users learn to ignore. This mirrors how PagerDuty/Linear separate state from events.
**Consequences:** Events use a last-seen timestamp and drop off once seen; alerts are recomputed live and shown in a separate "Needs attention" group that persists. The red badge counts *new* alerts + unseen events and clears on open (acknowledge), but the alert stays listed; a resolved-then-reappearing alert pings again. Everything is **derived from existing tables — no notifications schema**. Alerts reuse the exact facts the dashboards compute (`utils/clientStats.js`, shared with CoachDashboard) so the bell can't disagree with the page. Coach alerts = `attentionLevel` triage; client alerts = their own action-items (lock / check-in due, gated Thu+ like the coach's Nudge / coach-nudge until they log). The bell only refreshes on mount/tab-refocus, so same-page actions (logging, check-in) fire a `gardnr-notif-refresh` event (`utils/notifyRefresh.js`) to clear the alert they resolve.

---

## Pricing & Billing

### Coach paywall OFF while pre-public (Jun 16 2026)
**Reason:** Pre-public, the paywall is a stopper, not a revenue source — it blocks building and clean end-to-end testing (a coach without a subscription can't even reach the dashboard, which also made the coach views un-screenshottable for QA). At ~1 active coach there's nothing to protect yet; the priority is shipping and dogfooding, not charging.
**Consequences:** `BILLING_ENABLED = false` in `App.jsx` no-ops both paywall gates (the `subLoading` guard + the no-subscription → `CoachPaywall` redirect), so any coach reaches the dashboard. **Subscriptions are still fetched and shown** (the Profile billing card, `SubscriptionManager`) — billing plumbing is intact and dormant, exactly like `SOLO_BILLING_ENABLED`. Stripe stays in live mode. **Flip back to `true` at public launch** to re-enable the paywall + trial gating. This mirrors the solo-billing-off pattern: gate flags, not deleted code, so it's a one-line revert.

### Founding coach rate locked forever at $19/mo
**Reason:** Reward and retain the first coaches who validate the product; create urgency for early adoption.
**Consequences:** Two live price IDs maintained (founding $19, standard $29). Founding price stays honored even after standard launches.

### Cancel at period end, not immediately
**Reason:** Fairer to the user (they keep what they paid for), avoids refund logic entirely, and the existing webhook already handles the eventual `deleted` event.
**Consequences:** Sets Stripe `cancel_at_period_end = true`; status stays `active`/`trialing` until period end so access continues correctly. For coaches, clients are NOT offboarded until the period actually ends (the `deleted` event fires then). During a trial, canceling means it cancels at trial end with no charge ever.

### `cancel-subscription` looks up the sub by current role, not an OR query
**Reason:** An `or=(coach_id,solo_id)` query could pick the wrong row if a user ever had both a coach sub and an old solo sub row.
**Consequences:** Role-based lookup is precise and naturally blocks paused/client users (role `client` → 400, no sub to manage).

### `pause-solo-subscription` sets the local marker only if the Stripe pause succeeds (active subs)
**Reason:** If Stripe failed but the local marker was set anyway, the user would lose access locally while Stripe kept billing — worst of both worlds.
**Consequences:** Active subs: marker set only on Stripe success. Trialing subs (no Stripe call): marker always set. Resume mirrors this — `paused_for_coaching` cleared only if the Stripe resume call succeeded.

### Canceled users cannot start a fresh trial
**Reason:** Prevent trial-farming by repeatedly canceling and re-subscribing.
**Consequences:** `create-checkout-session` blocks `canceled` status from re-trialing.

### ~~Trial marked used at checkout-session creation~~ — OVERRIDDEN Jun 8
**Original behavior:** `create-checkout-session` wrote the `trial_ledger` entry the moment the Stripe checkout session was created.
**Override reason:** Opening the Stripe page and then abandoning it (never paying) still burned the trial — the next attempt showed an immediate charge instead of "free then $X".
**New behavior:** Trial usage is recorded by `stripe-webhook` on `checkout.session.completed`, and only when the resulting subscription actually has `status === 'trialing'`. The webhook resolves the owner via `subscription.metadata.{solo_id,coach_id}` + `plan_type`, hashes the profile email (byte-identical to `create-checkout-session` / `check-trial-eligibility`), and upserts with `on_conflict=email_hash`.
**Consequences:** Requires a unique index on `trial_ledger.email_hash` (migration `20260608120000`) — the merge-duplicates upsert needs it as the conflict target, or it inserts duplicate rows and the `limit=1` eligibility read becomes nondeterministic. Eligibility is still computed at checkout (to decide `trial_period_days`); only the *recording* moved. The ledger still survives account deletion, so re-signup with the same email cannot earn a second free trial.

### Stored Stripe customer IDs are verified before reuse
**Reason:** A `stripe_customer_id` can be orphaned if the customer is deleted in Stripe; reusing it makes checkout fail with "No such customer."
**Consequences:** `create-checkout-session` calls `customerIsUsable()` (GET + `deleted` check) before reusing an ID, and creates a fresh customer if it's gone. The new ID is persisted by the existing subscription upsert.

### Transactional emails are awaited, not fire-and-forget
**Reason:** Supabase Edge (Deno) can tear down the isolate as soon as the response returns, killing an in-flight `fetch().catch()` before Resend receives it — silently dropping "sent" emails. The old code also never checked Resend's response, so 4xx errors were swallowed.
**Consequences:** Deletion/offboard emails are `await`ed and routed through a `sendEmail()` helper that logs non-OK Resend responses. Costs ~300ms after the user-facing work is done; worth it for delivery reliability + diagnosability.

### ~~Trial clock continues during coaching (accepted v1 limitation)~~ — OVERRIDDEN Jun 7
**Original reason:** Stripe has no true trial-clock pause.
**Override:** Trial time is now preserved. On pause: remaining days calculated from Stripe `trial_end`, Stripe trial subscription cancelled (no charge — trialing), `paused_trial_days_remaining` stored on the subscriptions row. On resume: new Stripe subscription created via API with `trial_period_days = paused_trial_days_remaining` on the same customer + saved payment method. Active (paying) subs unchanged — `pause_collection` still used for those.
**Consequences:** Write-before-delete ordering is critical: DB row must have `paused_for_coaching=true` committed before Stripe DELETE fires, because `customer.subscription.deleted` webhook reads that flag. `stripe-webhook` skips the deleted handler when `paused_for_coaching=true` to prevent double-processing.

### Data is never deleted regardless of payment status (cancellation only)
**Reason:** Trust and re-activation. A coach or solo user who lapses should not lose history.
**Consequences:** Access is restricted, not data. Canceled accounts keep all rows; resubscribing restores access to intact data.
**Exception (Jun 7):** Account deletion (explicit user action) IS a full hard delete — all rows + auth user. This is a legal right and a separate flow from cancellation. The `trial_ledger` table is the one thing that survives deletion by design (fraud prevention — see below).

### Trial eligibility is per-product granular, not blanket
**Reason:** A deleted coach who re-signs up as solo never used a solo trial. Burning both trials on one deletion is punitive and inconsistent.
**Consequences:** `trial_ledger` tracks `coach_trial_used` and `solo_trial_used` separately. Deleting as coach burns `coach_trial_used` only; solo trial remains available. `create-checkout-session` checks the relevant flag before attaching a trial period.

### `trial_ledger` stores SHA-256 peppered hash, not plaintext email
**Reason:** Minimum PII retention for fraud prevention. Plaintext email retention post-deletion creates GDPR/CCPA exposure.
**Consequences:** Hash = `SHA-256(EMAIL_HASH_PEPPER + ':' + lower(trim(email)))`. Pepper stored as Supabase secret. If pepper ever changes, old hashes can't be matched — treat as a breaking change. Legal todo: disclose fraud-prevention retention in Privacy Policy.

### On deletion, cancel Stripe subscription but keep Stripe customer
**Reason:** Cleaner re-signup (customer record preserved), Stripe-side history maintained, avoids recreating a customer on re-signup.
**Consequences:** `delete-account` calls `DELETE /v1/subscriptions/:id` but never deletes the Stripe customer. The customer's payment method history is preserved for any future re-subscription.

### Active Solo Premium resume = billing resumes where period left off
**Reason:** Standard SaaS behavior. Extending the billing period by the paused duration is more complex and not expected by users.
**Consequences:** `pause_collection` cleared on resume; Stripe resumes at the existing `current_period_end`. No period extension.

### Coach re-signup after deletion = paywalled, no trial
**Reason:** Coaches consumed their trial. Re-deletion + re-signup must not be a trial farming vector.
**Consequences:** `create-checkout-session` checks `coach_trial_used` in `trial_ledger`; if true, no `trial_period_days` is attached — coach must subscribe directly. Account can exist (hits `CoachPaywall`) but has no free access.

### Offboard notice lives on `profiles`, not `coach_clients`
**Reason:** When a coach deletes their account, the `coach_clients` row is destroyed. A notice keyed to that row dies with it.
**Consequences:** `profiles.offboarded_at` + `profiles.offboard_reason` are written at offboard time and survive coach deletion. Dashboard reads from `profiles`. Dismiss clears both fields to null server-side (cross-device, no localStorage timestamp key). Self-leave (`offboard-self`) writes no marker — the user did it themselves, no banner needed.

### Offboard reason values: `coach_offboarded` | `coach_deleted`
**Reason:** Banner copy differs by reason; the client deserves to know whether their coach chose to end the relationship or their account was closed.
**Consequences:** `offboard-client` writes `coach_offboarded`; `delete-account` coach branch writes `coach_deleted`. `offboard-self` writes nothing. Dashboard renders different copy per value.

### Access allow-list is `['trialing', 'active', 'past_due']`
**Reason:** `past_due` users should keep access during Stripe Smart Retries (~2 weeks) rather than being cut off the moment a card fails — fairer and reduces involuntary churn.
**Consequences:** A single shared `PAID_STATUSES` constant is used everywhere for access checks, keeping the rule consistent across coach and solo gating.

---

## Data Model

### Single unified `messages` table
**Reason:** Replaced split `coach_messages` + `client_messages` for a unified thread UX.
**Consequences:** Both coach and client read the same conversation stream in chronological order; `sender_id` identifies who sent each message.

### `profiles.role` has NO default
**Reason:** Ensure new users (including OAuth) see the RolePicker instead of silently defaulting to `solo`.
**Consequences:** Role is null until RolePicker runs. If a default ever reappears, drop it: `ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;`

### Reports are separate from messages
**Reason:** Different purpose — reports are formal, structured, and archivable; messages are conversational.
**Consequences:** Separate `reports` table with `week_of`, read/unread, archive state; client sees reports grouped by week, collapsible.

### Copy-food copies nutrition only, never weight/steps/cardio
**Reason:** Weight and steps are *measurements*, not re-enterable plan data. Copying them would falsify the record.
**Consequences:** The copy-food feature in Log.jsx is scoped to nutrition entries only.

### Meal containers are a grouping over `nutrition_log` rows, not a separate table (Jun 15 2026)
**Reason:** A "meal" (Breakfast combo, "meal 1 diet") is just a set of food rows the user wants to see, repeat, and move as one — not a new entity. Two nullable columns (`logged_meal_id` + `logged_meal_name`) on `nutrition_log` express that with zero new tables, zero RLS surface, and no duplication: each child stays a normal, individually-editable, in-scope food row that the coach already reads.
**Consequences:** Forming/regrouping a meal is an **in-place restamp** of `logged_meal_id` on the selected rows (the diary "Group as meal" and the per-row move never insert or duplicate); only logging a *saved* meal inserts new rows (with a shared id). Moving an item between meal slots updates `meal`; moving a whole container updates `meal` on all its rows. Rendering folds rows by `logged_meal_id` in `utils/meals.js` (`groupLoggedMeals`), so loose foods (null id) are unaffected and legacy rows keep working. Drag-and-drop and the `⠿` chip menu are two affordances over the same two updates — no new persistence.

### Check-in cadence generalizes `week_of`, anchored to a fixed epoch Sunday (Jun 15 2026)
**Reason:** The whole system already keys check-ins (and groups them) by `check_ins.week_of` (a Sunday). Configurable cadence shouldn't fork that. One pure helper `checkinPeriod(intervalWeeks)` computes the *current period start* by bucketing weeks from a fixed epoch Sunday (1970-01-04) — so all clients of a given interval share deterministic boundaries with **no per-client anchor**, and `interval=1` returns exactly the current calendar week. Cadence is therefore one column (`coach_clients.checkin_interval_weeks`, default 1) + one helper.
**Consequences:** Every `week_of` read (Dashboard submit/fetch, ClientView review, `computeClientStats`/`computeClientAlerts`, report pull) routes through `checkinPeriod`, and existing weekly data is untouched. Because `computeClientStats` resolves each client's check-in to *their* period, the roster triage, "checked-in" count, and review queue generalize with **zero changes to `attentionLevel`** (the one triage brain). The nag/due window = the period's last 3 days (generalizing the weekly Thu+ rule); `nudgeReason` takes a `checkinDue` flag with the weekly rule as fallback.

### The check-in questionnaire is per-coach and answers are snapshotted (Jun 15 2026)
**Reason:** Coaches wanted to ask their own check-in questions, not the fixed adherence/energy/obstacles/notes. Scope is **per-coach** (one set, all clients) — the table-stakes common case; per-client override is a clean future layer (a nullable `client_id`), deliberately deferred. To keep history correct when a coach later edits or archives a question, each submitted answer **snapshots** `{question_id, prompt, type, config, value}` into `check_ins.answers` (jsonb) rather than referencing the live question.
**Consequences:** New table `checkin_questions` (coach-owned) with the one tenant-wall-crossing read in the app — a client may SELECT only their **active** coach's questions (RLS `exists` against `coach_clients`, harness-tested, +8 isolation cases). Backward compatible: a coach who builds nothing → clients render the legacy 4-field form (no backfill); the renderer/review/email all branch on `answers` present vs legacy columns. The report edge functions are unchanged — a ClientView adapter folds custom answers into the existing `{adherence, energy, obstacles, notes}` contract. Pure logic (defaults/validation/snapshot/format) lives in `utils/checkinQuestions.js` so builder, form, and review can't drift.

### `weight_log` has no unique constraint; reads take the most recent
**Reason:** Multiple weigh-ins per day are legitimate (morning vs evening).
**Consequences:** `.maybeSingle()` would throw on multiple rows; reads use `order('created_at', desc).limit(1)` instead.

### `steps_log` unique on `(user_id, logged_date)`, not `logged_date`
**Reason:** Original `UNIQUE (logged_date)` was global — only one user could log steps per date across the whole platform (a real bug).
**Consequences:** Per-user-per-date uniqueness; `saveSteps` upserts on `user_id,logged_date`.

### `weighed_at` stored as 24hr `HH:MM:SS`, not a locale string
**Reason:** A locale-dependent string ("10:30 AM") doesn't match the PostgreSQL `time` column and breaks sorting/parsing.
**Consequences:** Stored as `HH:MM:SS`; `formatTime()` converts to 12hr for display.

### `notifications` table is the one exception to "derive notifications from activity tables" (Jun 14 2026)
**Reason:** The bell derives everything (messages, check-ins, reports, alerts) from tables that already exist — except a client *leaving*. The moment a relationship ends, `profiles` RLS (`is_profile_related` requires `status = 'active'`) hides the departed client's profile from the coach, so the bell can no longer read the name to render "X left your coaching." The departure leaves no coach-readable trace. So this single class of event needs a stored record whose text is snapshotted at leave time.
**Consequences:** `notifications` (`user_id, type, title, body, href, created_at, read_at`) holds server-pushed events that can't be derived under RLS. **Inserts are service-role only** — there is intentionally no authenticated INSERT policy; RLS lets recipients read/update only their own rows. `offboard-self` and `delete-account` (client branch) snapshot the client's name and insert a `client_left` row for the coach. The bell reads it role-agnostically as a Recent event. Any future server-originated notification (not derivable from activity) belongs here too — but keep deriving where the data is already readable.
**Gotcha:** a new table needs **table-level GRANTs in addition to RLS** — RLS scopes which rows a role sees, but without `GRANT … TO authenticated` (and `service_role`) the role gets `42501 permission denied for table` before RLS is even evaluated. This project grants explicitly per table (no broad default privileges), so every new table must `grant select/insert/update/delete` to the roles that use it (`20260614130000` fixed this for notifications).

### Existing-account detection on invites uses a SECURITY DEFINER RPC + a snapshot flag, not a profiles read (Jun 14 2026)
**Reason:** `profiles` RLS (self-or-active-related) is deliberately tight, so a coach can't read a profile by an arbitrary email and an anon invite visitor can't read profiles at all. Both the invite box and the Join page need to know "does this email already have an account?" — but loosening profiles RLS would reintroduce the user-enumeration hole that lockdown closed.
**Consequences:** Coach side uses `invite_email_status(email)` — a SECURITY DEFINER function returning only `{id, role}`, `grant execute` to `authenticated` only (a logged-in coach pre-checking; mild authenticated-only enumeration, acceptable). Join side reads `invitations.account_exists`, snapshotted by the coach at send time, so the anon page needs no privileged read; a sign-up "already registered" → sign-in pivot covers a stale flag. **Avoided an edge function with `--no-verify-jwt`** (that would put an open enumeration endpoint on the internet) — the auth-gated RPC + token-gated snapshot is the safer shape. General rule: to cross the RLS wall for one narrow fact, prefer a SECURITY DEFINER function scoped to exactly that fact over widening a table policy.

### Tenant isolation is verified by a local-Supabase RLS harness against a captured prod schema baseline (Jun 15 2026)
**Reason:** The base tables were dashboard-created and never added to migrations, so `supabase db reset` can't rebuild the schema and RLS could only be checked against prod by hand. In a multi-tenant coaching app, one coach seeing another's clients is the catastrophic bug class — it needs automated, repeatable proof, not trust.
**Consequences:** `supabase/schema/prod_public.sql` (a pooler dump) is the committed baseline; `tests/rls/` loads it + post-baseline migrations into a local stack and asserts isolation as real signed-in users. It immediately surfaced three live gaps (world-readable invitations, coach access to offboarded clients' data, no unique on `subscriptions.solo_id`) — all fixed. Every new table now gets an RLS test. Running the harness against prod (which would mint throwaway auth users / trial-ledger rows) was explicitly rejected in favor of the local stack.

### Coach data access is active-only; saved meals are owner-only (Jun 15 2026)
**Reason:** `profiles` already required an *active* relationship, but the per-client data tables' coach-read policies only checked a `coach_clients` row *existed* — so a coach kept reading an offboarded client's nutrition/weight/etc. Inconsistent and a privacy gap.
**Consequences:** `nutrition_log`/`weight_log`/`cardio_log`/`steps_log`/`check_ins`/`targets` coach-read now requires `status='active'` (`20260615000100`); `day_complete` follows suit. `saved_meals` is deliberately **owner-only** (a private logging convenience, never coach-visible) — but the rows it expands into carry to the coach as normal.

### One triage "brain": the roster rollup is built ON attentionLevel, never a parallel engine (Jun 15 2026)
**Reason:** A first pass added a separate `readiness` engine next to the existing `attentionLevel` triage. Two sources of "who needs attention" inevitably drift and contradict each other (the dashboard banner disagreeing with the per-client badges).
**Consequences:** `summarizeRoster` (in `attentionLevel.js`) derives its counts from `attentionLevel`, so banner and badges can't disagree; the parallel engine was deleted. Rule: extend the single triage function, don't add a second.

### Coaches review check-ins via a SECURITY DEFINER RPC + guard trigger, not a table policy (Jun 15 2026)
**Reason:** A coach should set only `reviewed_at`/`coach_comment`, not edit a client's answers — and a client shouldn't fake a review on their own row. RLS is row-level, not column-level, so a coach-UPDATE policy couldn't enforce either.
**Consequences:** `review_checkin(p_id, p_comment)` (SECURITY DEFINER, active-coach-only) is the only sanctioned path; a `guard_checkin_review` trigger raises if the review fields change and the caller isn't the active coach. **`service_role` must be exempted** (`auth.role()`) — caught when the guard first blocked admin/edge-function writes; the RPC itself passes because it runs with `auth.uid()` = the coach.

---

## Time & Dates

### Sunday is the week boundary, everywhere
**Reason:** One consistent week definition across reports, compliance, and check-ins prevents mismatches.
**Consequences:** All week calculations depend on Sunday start (`getDay()` === 0). `getCurrentWeekSunday()` is the single source; weekly reports cover Sunday→Saturday.

### All date math uses local Date components, never `new Date('YYYY-MM-DD')`
**Reason:** `new Date('YYYY-MM-DD')` parses as UTC, which shifts the date (and weekday) by one in negative-offset timezones — caused real week_of mismatches and weekday-split bugs.
**Consequences:** `toLocalDateString` and local `Date` object access are used throughout heatmap, weekday/weekend split, and week calculations.

---

## Edge Functions & Email

### Webhook and internal functions deployed `--no-verify-jwt`, verify internally
**Reason:** Stripe doesn't send a Supabase JWT (caused 401s); internal functions need to verify the caller themselves rather than rely on gateway JWT checks.
**Consequences:** `stripe-webhook` verifies the Stripe signature (HMAC-SHA256). Internal functions (`pause-solo-subscription`, `cancel-subscription`, `milestone-reached`) verify the caller via `auth/v1/user`.
**Important:** `verify_jwt = false` must be set in `supabase/config.toml` for each affected function — redeploying without this resets to the default (JWT required) and breaks Stripe. Config entries added Jun 7 for `stripe-webhook`, `pause-solo-subscription`, `cancel-subscription`, `milestone-reached`. Git push does NOT deploy edge functions — `supabase functions deploy <name>` is always a separate step.

### Client-facing AI/email functions must verify the caller and derive recipients server-side (Jun 8 2026)
**Reason:** `call-prep`, `weekly-report`, `notify-report`, `notify-checkin` ran with `verify_jwt=false` and **no in-function caller check** — they were open: anyone with the URL could burn Anthropic credits (AI proxies) or send email to arbitrary addresses from the verified `noreply@gardnr.fit` domain (email relays). `verify_jwt=false` alone is not security; it *removes* the gateway check, so the function MUST verify the caller itself.
**Consequences:** Each verifies the caller via `auth/v1/user`. Where a coach acts on a client (`call-prep`, `weekly-report`, `notify-report`), the client now passes `clientId` and the function confirms an **active** `coach_clients` row. Email recipients are **derived server-side** from the relationship (never trusted from the request body): `notify-report` looks up the client email from `clientId`; `notify-checkin` looks up the coach from the caller's active relationship. **Rule: a `verify_jwt=false` function must do its own auth; never trust a request-body email/recipient.**

### `weekly-digest` cron must authenticate as `service_role`, not anon (Jun 8 2026)
**Reason:** The `weekly-coach-digest` pg_cron job (`0 13 * * 1`) called the function with the **public anon key**, so the endpoint was effectively open — anyone could trigger a fan-out of digest emails to every coach. The anon key is shipped in the frontend bundle, so it can never be a gate.
**Consequences:** `weekly-digest` now sets `verify_jwt = true` (gateway validates the JWT signature) and additionally requires the decoded `role` claim to be `service_role`. The pg_cron job was rewritten (via a one-shot `service_role`-only RPC) to send the service role key in its `Authorization` header. The key lives only in `cron.job` (not exposed to anon/authenticated, never committed to the repo). `CRON_SECRET` was abandoned because the `supabase secrets set` CLI errored on an access-token format quirk in this environment; gating on the role claim needs no new secret.

### RLS must be ENABLED on the table, not just have policies (Jun 8 2026)
**Reason:** `profiles` had policies defined (own-read, coach-read-clients, etc.) but `relrowsecurity = false`, so they were silently ignored and any authenticated user could read every profile (email/name/role enumeration). A defined-but-unenforced policy looks identical to a working one in the dashboard policy list — there is no error.
**Consequences:** Enabled RLS on `profiles` (migration `20260608134000`) and consolidated to a single scoped SELECT policy (`is_profile_related(id)`: own row or active coach↔client) + own-row INSERT/UPDATE. **Rule: when auditing access, check `pg_class.relrowsecurity` per table (or do a live cross-account read) — don't trust the policy list alone.** All other tables were verified RLS-enabled the same day.

### CoachPaywall always exposes a "Delete account" path
**Reason:** Users who sign up, pick coach role, and reach the paywall but never subscribe are stuck — no Profile page is accessible from the paywall, only Sign out. Leaving without deleting creates a floating account they can never remove without contacting support.
**Consequences:** CoachPaywall renders both "Sign out" and "Delete account" as separate actions at all times, regardless of subscription state. Two buttons, user decides. No conditional logic — simplest and least error-prone.

### Every role that owns a subscriptions row must explicitly delete it before auth delete
**Reason:** Both `subscriptions.solo_id → profiles.id` and `subscriptions.coach_id → profiles.id` are NO ACTION FKs. Any future role that owns a subscriptions row will hit the same issue.
**Consequences:** `delete-account` has explicit DELETE blocks for both coach and solo before the auth delete. Any new billing role added in future must follow the same pattern: cancel Stripe → delete DB row (with response checking) → then auth delete.

### Solo account deletion must explicitly delete the subscriptions row before auth delete
**Reason:** `subscriptions.solo_id` is a FK to `profiles.id` (NO ACTION). Deleting the auth user cascades to delete the profiles row, which Postgres rejects if the subscriptions row still references it.
**Consequences:** `delete-account` solo branch: cancel Stripe sub → explicitly DELETE subscriptions row (with response checking, throw on failure) → then proceed with the generic deletions loop and auth delete. Response checking is mandatory — silent failures produce confusing FK violations downstream.

### Every table used in edge function DELETEs/INSERTs needs explicit grants to service_role
**Reason:** Tables don't automatically have DELETE or INSERT granted to service_role even though service_role bypasses RLS. Missing grants return `42501 permission denied` which fails silently if response codes aren't checked.
**Applied grants so far:** `GRANT DELETE ON public.subscriptions TO service_role`, `GRANT SELECT, INSERT, UPDATE ON public.trial_ledger TO service_role`.
**Rule:** When adding a new table operation in an edge function, verify the grant exists. Test with response checking — never ignore DELETE/INSERT response codes.

### `GRANT DELETE ON public.subscriptions TO service_role` is required
**Reason:** The subscriptions table was created with only SELECT granted to authenticated/service_role. DELETE was never granted. Even though service_role bypasses RLS, it still needs explicit table-level DELETE permission.
**Consequences:** Without this grant, any service_role DELETE on subscriptions returns `42501 permission denied` silently if not response-checked. Grant applied in SQL editor. Any new table used in edge function DELETEs must have this grant verified.

### `delete-account` client offboarding ordering
**Reason:** When a coach deletes, `coach_clients` rows must be processed before they are deleted, and the coach's Stripe sub must be cancelled after `coach_clients` rows are gone.
**Consequences:** Order is: (1) fetch + process all clients (resume subs, flip roles, write offboard markers, send emails), (2) bulk DELETE all data rows including `coach_clients`, (3) cancel coach Stripe sub, (4) delete auth user. Stripe cancel goes last in the data deletion sequence so the resulting `customer.subscription.deleted` webhook finds no clients to re-offboard.

### `resumeSoloSubscription` is duplicated across three files (deferred extraction)
**Reason:** Extracting to `_shared/` mid-feature would require editing two live-billing functions as a side effect of shipping a new feature — bad change hygiene.
**Consequences:** Verbatim copies in `offboard-self`, `offboard-client`, `delete-account`. Flagged as tech debt: extract to `supabase/functions/_shared/resumeSoloSubscription.ts` in a dedicated refactor pass where all three are visible and testable together.

### Notify the client on coach review; keep per-check-in coach email per-event for now; defer digest/exception-gating to scale (Jun 15 2026)
**Reason:** A check-in submit already notifies the coach (bell derives it + `notify-checkin` emails). At ~1 active client that per-event email is fine, even good (responsiveness). The firehose problem — 50–100 emails/cycle → coaches filter/mute → signal dies, contradicting "100 clients with the attention of 20" — only appears at scale Gardnr doesn't have yet. Gating to exceptions or defaulting to a digest now is solving a problem before it exists, and the "what's an exception" threshold would be a guess without real data.
**Consequences:** Shipped only the piece valuable at any scale — notify the **client** when the coach reviews/comments (`notify-checkin-review` + an in-app bell event + the coach's note on the client's check-in). Deliberately did NOT touch `notify-checkin` or build a per-event-vs-digest toggle. **Revisit at ~20+ clients:** route routine check-ins through the in-app review queue + `weekly-digest`, and reserve immediate coach email for at-risk check-ins. General rule: notifications 1:1 with routine events don't scale — aggregate + reserve real-time pushes for exceptions and for the client-facing reply.

### `checkout.session.completed` fetches the real subscription object from Stripe
**Reason:** Inferring status from `payment_status === 'paid'` was unreliable for trial checkouts and wrote `active` when it should be `trialing`.
**Consequences:** The handler now reads true `status`, `trial_end`, `current_period_end`, and `price_id` directly from the Stripe subscription object. (Verified writing `trialing` correctly in live mode, June 6 2026.)

### Email sends are wrapped in non-throwing try/catch
**Reason:** A thrown email error inside a webhook handler triggers Stripe/webhook retry loops and can double-process events.
**Consequences:** All Resend calls are best-effort; a failed email never blocks the core transaction or causes a retry storm.

### Milestone email fires once per level
**Reason:** Avoid spamming a coach every time a client refreshes while at a milestone streak.
**Consequences:** `milestone-reached` fires only if `streakCount in MILESTONES AND last_milestone_streak < streakCount`, then updates `last_milestone_streak`. Banner shows only on a genuine `{ ok: true, milestone }` response, never on refresh.

---

## UI / UX

### No TypeScript
**Reason:** Speed of development and Jay is learning JS — types would add friction without payoff at this stage.
**Consequences:** Plain JSX throughout. No compile-time type safety; rely on tests and runtime checks.

### Inline styles + CSS variables, no Tailwind
**Reason:** Pragmatic for component-level styling without adding a build/utility dependency.
**Consequences:** Styling lives inline and in `index.css` CSS variables; shared `cardStyle` extracted to `utils/styles.js`.

### No emoji in AI-tool buttons; minimal emoji elsewhere
**Reason:** Professional aesthetic for the coach-facing product.
**Consequences:** Emoji removed from exercise types, empty states, barcode buttons, export, role picker. Kept only where they carry meaning: message reactions, checkmarks, streak milestones.

### Message thread scrolls, capped at 400px
**Reason:** Prevent the card from stretching indefinitely with a long thread.
**Consequences:** Thread is a 400px-max scroll area with a dark scrollbar; auto-scrolls to bottom on new messages.

### `SubscriptionManager.onChange` does a full `window.location.reload()`
**Reason:** The subscription prop is fetched once in App.jsx and goes stale after a cancel/resume; a reload is the simplest correct refresh.
**Consequences:** Inelegant but correct. A refetch-callback refactor (lifting the fetch out of App.jsx) is deferred technical debt.

### App nav is a solid sticky bar; page roots use `overflow-x: clip`, not `hidden` (Jun 9 2026)
**Reason:** A frosted (`backdrop-filter`) nav both bled scrolled content through the translucent bar and trapped the mobile menu's `position: fixed` backdrop against the 56px nav (the menu never dimmed the page). Separately, `overflow-x: hidden` on `html/body/#root` turns them into scroll containers, which **breaks `position: sticky`** — the nav scrolled away on mobile (the real cause of the "header overlaps the status bar" report).
**Consequences:** Nav background is solid `--color-surface` + a soft shadow (`.gnav`). Page roots use `overflow-x: clip` (clips horizontal overflow without creating a scroll container, so sticky keeps working). NavBar is responsive: desktop pill-tab bar; mobile (≤600px) hamburger → dropdown. **Rule: don't put `backdrop-filter` on a bar that contains a `fixed` overlay, and never use `overflow-x: hidden` on a sticky element's scroll ancestor — use `clip`.**

### Verify UI changes with the Playwright harness — don't ship blind (Jun 9 2026)
**Reason:** Several UI regressions (a wrapping nav that looked unintentional, and the sticky-nav bug) shipped because changes were reasoned about but never actually viewed. The sticky bug only appeared on a *scrolled* page.
**Consequences:** `scripts/shoot.mjs` / `shoot-all.mjs` (Playwright, devDeps) screenshot real pages via throwaway accounts (incl. coach/client via an injected subscription + client-token link). **Run `node scripts/shoot.mjs` and read `/tmp/shots/*.png` after any UI change before claiming it's done.** See architecture.md → Visual QA.

---

## Open Product Decisions (not yet resolved)

These are flagged in `features.md` and need a call before the relevant feature ships.

### Should clients see heatmap / rolling average on their own Dashboard?
**Current stance:** No (❌ in the tier matrix). Client self-analytics would overlap with Solo Premium and could undercut its value.
**Open because:** Defaulting to coach-side-only for clients until explicitly decided.

### Body measurements & progress photos for clients
**Current stance:** Gated to "coach enables" — the coach decides whether a client tracks these.
**Open because:** Not yet validated whether this should be client-default or coach-controlled.

### Progress photo timeline (when built) keyed to timestamps, not workouts
**Reason (provisional):** Users may upload progress photos without any associated training session.
**Consequences (provisional):** Timeline would be built on photo timestamps, independent of any workout ID. (Recorded now so the decision isn't relitigated when Tier 3 photos are built.)

### Single client-level "attention rank" on the coach dashboard (red/yellow/green triage)
**Current stance:** Undecided. Today the coach dashboard shows *per-metric* compliance pills (calories/protein/cardio/steps). The open idea is to roll those — plus weight trend, check-in overdue, and logging-frequency drop — into **one client-level attention rank** so a coach scanning 50+ clients sees *who to look at first*, not four pills per row to interpret. This is the "attention is the bottleneck" thesis (`vision.md`) made literal.
**Open because:** (1) It's a ranking/weighting model — the weighting is a judgment call that needs real coach feedback, not a guess. (2) It must stay on the right side of the no-fabricated-confidence rule (above): a green/yellow/red **flag from observed facts** is fine; a numeric "attention score" that implies precision we can't back is not. Decide the input weights and the flag-vs-number question before building.
