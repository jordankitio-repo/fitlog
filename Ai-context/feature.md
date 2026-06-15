Gardnr — Master Feature & Implementation List
Last updated: June 15, 2026

SHIPPED since (live in prod, Jun 15) — do NOT re-propose:
- Logging Consistency / Attention triage → coach **roster rollup** (`summarizeRoster`) + per-client badges.
- **Meal grouping**, **Saved meals**, **Complete Day** (Layer 1 solo-completeness).
- **Check-in review queue** (`reviewed_at`/`coach_comment` + `review_checkin` RPC) + client notification on review.
- Also already existed (not gaps): copy-previous-day, frequent-foods quick-add, manual custom-food entry, USDA food search, barcode.
REMAINING coach-cockpit (Layer 2/3): configurable **check-in cadence**, **questionnaire builder**, **habit tracking** (caveats: self-reported; only adds value for non-logged behaviors), progress photos, body measurements, weight rate/ETA, adaptive maintenance, diet-break detector. See current-state.md + decisions.md (solo-on-ramp; one-triage-brain; notifications-at-scale).


Note on feature numbers (#2, #5, #7, etc.): These reference the original tiered backlog from an earlier planning session. They are preserved as stable labels for cross-reference. The source list with full definitions of #1–#30 is not in current context — numbers are carried forward as-is, not independently re-verified.

Note on two different lenses: This doc separates two things that were previously conflated:

	•	"Where it's built" = which screen/role the feature technically appears on (capability)
	•	"Tier access" = who is granted access under which paid plan (gating) A feature can be technically built into the Dashboard but gated so a free user doesn't see it. The Tier Access Matrix is the source of truth for gating.


Shipped ✅
Core Logging
Feature
Notes
Nutrition logging
Food, calories, protein, carbs, fat, serving size/unit
Weight logging
With time of day (AM/PM), unit toggle (lbs/kg)
Cardio logging
Exercise type, duration, calories burned, avg heart rate
Steps logging
Steps + distance
Barcode scanner
Camera-based food lookup
Repeat nutrition entry
↻ button on each entry
Dashboard & Charts
Feature
Notes
Solo/client dashboard
Today's stats, progress bars vs target, 7-day charts
Coach dashboard
Client list with 7-day compliance pills per metric
Client view
Full data view for coach — charts, logs, targets, messages
Compliance pills
Green ≥5/7, yellow 3-4/7, red <3/7. Suppress at 0 logged
Correlated body composition chart
Weight + calorie % + cardio % overlaid
Hide calories toggle
Coach-controlled per client
Coach-Client System
Feature
Notes
Coach invite flow
Email invite → /join?token=xxx → connected
Join page
/join — client invite acceptance flow
Target setting
Calories, protein, carbs, fat, cardio, steps, weight goal
Messaging
Unified coach ↔ client thread with reactions
Weekly check-ins
Adherence rating, energy, obstacles, notes. Unique per client/week
Coach private notes
Timestamped append log per client
Nudge mechanic
48hr cooldown, Resend email, in-app banner on client side
Offboard client
Coach can remove client. Data preserved
Leave coaching plan
Client can leave coach
AI Features
Feature
Notes
AI weekly coaching report
Generated per client, editable, sent to client. Coach only
AI call prep briefing
Private to coach, not visible to client. Coach only
AI nutrition advice
Currently UNGATED — available to all logged-in users. To be gated when solo billing ships
Notifications & Email
Feature
Notes
notify-report
Email to client when coach sends report
notify-checkin
Email to coach when client submits check-in
nudge-client
Email to client from coach nudge
Weekly coach digest
Monday 8am UTC. Per-coach email summarizing all clients' 7-day compliance + check-in status
Account deletion confirmation
Email on successful account deletion, all roles incl. coach (awaited; via sendEmail() with Resend response checking)
Client deletion coach notification
Email to coach when a client deletes their account (fires only if active coach relationship exists)
Coach-leave notification
Email to coach when a client voluntarily leaves coaching (offboard-self)
Edge Functions
Function
Purpose
delete-account
Role-aware deletion. Coach: offboards all clients (resume paused subs, flip roles, write offboard markers, send emails), cancels coach Stripe sub after coach_clients rows deleted, then deletes. Solo/client: cancels Stripe sub + explicitly deletes subscriptions row (GRANT DELETE required) to clear FK before auth delete.
offboard-client
Coach removes a client. Ends connection, resumes client's paused solo sub (trial recreate or active unpause), writes offboard marker to profiles (coach_offboarded), sends email.
offboard-self
Client leaves coaching. Resumes paused solo sub. No offboard marker written (self-initiated). Emails the coach (awaited) that the client has left.
pause-solo-subscription
Pauses a solo user's sub when they join a coach. Trialing: cancels Stripe sub + stores paused_trial_days_remaining. Active: pause_collection. Write-before-delete ordering: DB guard set before Stripe DELETE.
cancel-subscription
Self-serve cancel (cancel_at_period_end). Coach and solo.
nutrition-coach
AI nutrition advice
weekly-report
AI weekly coaching report generation
notify-report
Email notification when report sent
notify-checkin
Email notification when check-in submitted
call-prep
AI call briefing for coaches
nudge-client
Coach nudge — 48hr cooldown, Resend email
create-checkout-session
Creates Stripe checkout session (30-day coach trial, 14-day solo trial). Checks trial_ledger (hashed email) before attaching trial — omits trial_period_days if already used. Does NOT write the ledger here (moved to stripe-webhook on actual trial start — Jun 8). Verifies stored stripe_customer_id via customerIsUsable() and recreates it if deleted in Stripe.
check-trial-eligibility
Returns { coach_trial_used, solo_trial_used } for the authenticated user. Called by CoachPaywall on mount to show billing warning before Stripe redirect.
stripe-webhook
Handles Stripe events. Guards customer.subscription.deleted: skips update + offboarding when paused_for_coaching=true (coaching-pause cancellation, not real churn). On checkout.session.completed, records trial usage in trial_ledger when the sub enters trialing (upsert on_conflict=email_hash) — the single place trial usage is now marked.
weekly-digest
Monday coach digest email via pg_cron
Billing & Access
Feature
Notes
Stripe checkout
30-day free trial → $19/month founding / $29/month standard
CoachPaywall
Gate for coaches with no active subscription
BillingSuccess page
/billing/success — post-checkout redirect page
BILLING_ENABLED flag
true — live mode active. Gates COACHES ONLY currently
Stripe live mode
Webhook registered, live keys in Vercel + Supabase
Subscriptions table
RLS fixed. grant select on public.subscriptions to authenticated
Legal & Support
Feature
Notes
Terms of Service
21 sections. Public route /terms. Effective June 4, 2026
Privacy Policy
14 sections. Public route /privacy. Effective June 4, 2026
Feedback & Support button
Pre-filled mailto to digigardenllc@gmail.com. In NavBar + CoachPaywall
Auth & Account
Feature
Notes
Email/password auth
Supabase Auth
Google OAuth
Working but needs re-architecture (deferred)
Role picker
First-login role selection for OAuth users
Password reset
/reset-password handler
Data export
Profile page
Account deletion
Edge function — deletes all data + auth user
Profile page
Subscription status display, security, data card
Components
Component
Notes
NavBar.jsx
Active link state, Gardnr logo as Link, Terms/Privacy links, Feedback button
Button.jsx
Variants: primary/ghost/danger/danger-solid/outline/muted/ai
StatCard.jsx
Metric color system, left accent border
Skeleton.jsx
Loading state
Toast.jsx
In-app notifications
EmptyState.jsx
Empty data states
BarcodeScanner.jsx
Camera barcode lookup
SectionHeader.jsx
Collapsible section toggle with animated grid-row collapse
CoachPaywall.jsx
Paywall gate for coaches with no active subscription
FeedbackButton.jsx
Pre-filled mailto support button
Utilities
File
Notes
src/utils/styles.js
Shared cardStyle
src/utils/lockState.js
resolveLockState pure function
src/utils/dateHelpers.js
All date helpers
src/utils/inviteValidation.js
getInviteBlockReason
Infrastructure
Feature
Notes
Domain
gardnr.fit — Namecheap → Vercel. SSL provisioned. tryfitlog.com 308-redirects to www.gardnr.fit until expiry.
Resend
DKIM + SPF + DMARC verified on gardnr.fit. Sender: noreply@gardnr.fit. SPF on send.gardnr.fit subdomain (Resend standard layout).
pg_cron
Weekly digest scheduled. 0 13 * * 1
CI/CD
Vercel auto-deploy on push to main


Roadmap ⬜
🔴 Critical — Fix Before First Billing Cycle
Feature
Notes
~~Fix trialing status in webhook~~ ✅ RESOLVED — webhook now fetches real Stripe subscription object; trialing status confirmed writing correctly (verified live Jun 6)


🟡 Tier 1 — High impact, low effort, data already exists
"Where built" = the screen the feature lives on. Whether a given user sees it is determined by the Tier Access Matrix below, not here.

Status reconciliation (June 9, 2026): The board had fallen behind the code — most of Tier 1 is already shipped. Verified against src on June 9. Remaining gap is porting the coach-side self-analytics (heatmap, weekend split) onto the solo Dashboard behind the Premium gate; Best week is now done there.

#
Feature
Where built
Status
11
Compliance heatmap
ClientView + Dashboard (ComplianceHeatmap component)
✅ SHIPPED both sides — solo Dashboard hosts it inside the Premium-gated "Logging consistency" card (free sees SoloUpgrade)
7
Rolling 7-day weight average
Dashboard weight chart
✅ SHIPPED — Premium-gated dataset on weight chart (SoloUpgrade CTA for free); also computed coach-side in ClientView
10
Weekend vs weekday compliance split
ClientView + Dashboard
✅ SHIPPED both sides — solo Dashboard shows weekday/weekend split inside the Premium-gated "Logging consistency" card
21
Best week analysis
Dashboard + ClientView
✅ SHIPPED — coach-side in ClientView; on solo Dashboard inside the Premium-gated "Logging consistency" card. Descriptive-only (most logged days in any Sun–Sat window, last 90 days)
18
Milestone celebrations
Dashboard (in-app banner) + milestone-reached edge fn
✅ SHIPPED — fires for client AND solo roles. Edge fn records the streak and only emails a coach when an active relationship exists, so solo users get the banner with no email
17
Client comparison/ranking dashboard
CoachDashboard
✅ SHIPPED — sortBy compliance / recent / checkin. Adding a steps/streak sort key is trivial (sort scaffold exists)


🟠 Tier 2 — High impact, moderate effort
#
Feature
Notes
30
Structured client onboarding assessment
Form → pre-populated targets. Reduces new coach-client friction
27
Body measurements tracking
New table. Waist/hips/arms. High value for body recomp clients
2
Rate of weight change alerts
Weekly pace calculation. Alert if outside safe range. Edge function
29
Auto-generated shareable PDF report card
PDF generation. High marketing value — clients share results


🔵 Tier 3 — High impact, higher effort or new infrastructure
#
Feature
Notes
26
Progress photo timeline
Needs Supabase Storage
5
Estimated TDEE from logged data
Needs 4+ weeks of data per user
15
Check-in form builder with data correlation
Complex. Build after data accumulates
25
Rest day calorie adjustment
Needs new UX pattern


💳 Billing & Access
Feature
Notes
~~Fix trialing webhook status~~ ✅ RESOLVED
~~Auto-offboard clients on coach cancel~~ ✅ SHIPPED — stripe-webhook handles customer.subscription.deleted; offboards all active coach clients, flips roles to solo, sends emails
~~Grace period flow~~ ✅ SHIPPED — offboarded clients resume solo plan; paused solo subs restored
~~Self-serve cancellation in Profile~~ ✅ SHIPPED — cancel-subscription edge fn, SubscriptionManager.jsx, cancel_at_period_end, confirmation email
~~Paid solo Stripe product~~ ✅ SHIPPED — $7.99/mo, 14-day trial
Solo tier feature gating
IN PROGRESS — gate pattern is live: hasSoloPremium prop + SoloUpgrade.jsx (Stripe checkout CTA). Gated on solo Dashboard: rolling 7-day weight avg, plus the "Logging consistency" card (best week + weekday/weekend split + 90-day heatmap). Remaining to gate when built on Dashboard: TDEE.
Gate AI nutrition advice
Currently ungated. Should require Solo Premium or Coach


Tier Access Matrix (source of truth for gating)
Two principles:

	•	Solo Premium gets better self-analytics only. The coach-client interaction layer is hard-walled — never available to solo regardless of tier. A Solo Premium user who wants accountability still needs a coach.
	•	Clients are always free. They are invited by a coach, not self-serve payers. The coach pays for the platform. Clients receive the coaching layer (targets, reports, check-ins, nudges) but NOT solo self-analytics — those are a coach-side view of client data, or a Solo Premium upsell.

Note: Coaches do NOT log their own nutrition/weight/cardio data. The coach role manages clients. So self-analytics features (rolling average, heatmap on own data, etc.) do not apply to the coach's own profile — coaches see these computed over their clients' data inside ClientView.

Feature
Solo Free
Solo Premium ($7–9/mo)
Client (free)
Coach ($19–29/mo)
Daily logging (all metrics)
✅
✅
✅
— (coaches don't log)
Basic dashboard
✅
✅
✅
—
7-day charts
✅
✅
✅
—
Rolling 7-day weight average
❌
✅
❌
✅ (over client data)
30/90 day compliance heatmap
❌
✅
❌
✅ (over client data)
Weekend vs weekday split
❌
✅
❌
✅ (over client data)
Best week analysis
❌
✅
❌
✅ (over client data)
Body measurements
❌
✅
❌ (unless coach enables)
✅ (views client)
Progress photos
❌
✅
❌ (unless coach enables)
✅ (views client)
TDEE estimation
❌
✅
❌
✅ (over client data)
AI nutrition advice
❌ (after gating)
✅
❌
✅
Milestone in-app celebration
✅
✅
✅
—
Milestone coach notification
n/a
n/a
✅ (coach notified)
✅ (receives)
Client comparison dashboard
❌
❌
❌
✅
Coach connection
❌
❌
✅ (invited)
✅
Targets set by coach
❌
❌
✅ (receives)
✅ (sets)
Weekly coaching report
❌
❌
✅ (receives)
✅ (generates)
Check-ins with coach
❌
❌
✅ (submits)
✅ (reads)
Nudge mechanic
❌
❌
✅ (receives)
✅ (sends)
Call prep briefing
❌
❌
❌
✅
Private coach notes
❌
❌
❌
✅
Weekly digest email
❌
❌
❌
✅ (receives)

Open product decisions (not yet made):

	•	Should the heatmap / rolling average appear for a client on their own Dashboard? Currently marked ❌ — client self-analytics would overlap with Solo Premium and could undercut its value. Defaulting to coach-side only for clients until decided.
	•	Body measurements & progress photos for clients: gated to "coach enables" — coach decides whether a client tracks these.


🔧 Technical Debt — Deferred
Item
Notes
Large Vite chunk warning
Deferred
Lint errors (4 errors / 9 warnings)
Deferred
Google OAuth re-architecture
Deferred
AI nutrition advice ungated
Currently free for all users — gate when solo billing built
Extract resumeSoloSubscription to _shared/
Currently duplicated verbatim in offboard-self, offboard-client, delete-account. Extract to supabase/functions/_shared/resumeSoloSubscription.ts in a dedicated refactor pass.
subscriptions FK on solo_id and coach_id are both NO ACTION
Fixed in Parts 5 + 6: both roles now explicitly cancel Stripe sub + DELETE subscriptions row (with response checking) before auth delete. GRANT DELETE ON public.subscriptions TO service_role required. Pattern: any future billing role must follow the same.


⏳ Deferred — Needs more users first
#
Feature
Why deferred
3
Menstrual cycle tracking
New data collection, niche
4
Meal timing analysis
Needs timestamped meals
6
Max heart rate zones
Needs HR data volume
8
Social/community features
Premature
9
Coach marketplace
Premature
13
Supplement tracking
Low priority
14
Sleep tracking
New data category
16
Hydration tracking
Low priority
19
Injury/rest day logging
Low priority
20
RPE logging
Niche
22
Meal plan builder
Complex
23
Recipe database
Complex
24
Grocery list generation
Complex
28
Apple Health / Google Fit sync
New infrastructure

Note: deferred feature numbers (#3, #4, #6, etc.) are carried from the original backlog. Definitions are best-effort recollections, not verified against the source list.


Legal Doc Tracker
Item
Document
Status
Self-serve cancellation
ToS Section 6
⬜ Add when built
Grace period terms
ToS Section 19
⬜ Add when built
Solo tier feature differences
ToS Section 6
⬜ Add when built
Solo Premium data usage
Privacy Policy Section 2
⬜ Add when built
AI nutrition advice gating
Privacy Policy Section 8
⬜ Update when gated
Trial ledger fraud-prevention retention
Privacy Policy
⬜ Disclose that a hashed email is retained post-deletion for fraud prevention (legitimate interest basis). Not legal advice — flag for legal review before shipping trial_ledger gate.


Pricing Summary
Tier
Price
Who
Notes
Solo Free
$0
Individual self-trackers
Basic logging + 7-day charts only
Solo Premium
$7–9/month
Serious self-trackers
Full self-analytics, no coaching layer
Client
$0
Invited by coach
Always free — coach pays for platform
Coach Founding
$19/month (locked forever)
First coaches
Currently active in live mode
Coach Standard
$29/month
Future coaches
After founding closes
   # Gardnr Coach Metrics Roadmap

Last updated: June 5, 2026

## Purpose

This document ranks additional metrics Gardnr could track or derive for coaches. The priority is market value with the least client friction and highest product ROI.

Gardnr should not become a general health tracker. The best metrics are the ones that help a coach answer:

- Is this client logging enough data to trust the check-in?
- Are they actually following the plan?
- If not, where is the plan breaking?
- Who needs coach attention first?
- What should the coach adjust next?

## Current Gardnr Data Advantage

Gardnr already captures enough data to create stronger coaching intelligence without asking clients for much more:

- Nutrition entries: calories, protein, carbs, fat, date.
- Weight entries: weight, unit, logged date, weigh-in time.
- Cardio entries: exercise type, duration, calories burned, heart rate.
- Steps entries: steps, distance, date.
- Targets: calories, macros, cardio minutes, steps, weight goal.
- Weekly check-ins: adherence rating, energy level, obstacles, notes.
- Messages: content, sender, read state, reactions.
- Reports: sent reports, read state, archived state, week.
- Coach-client relationship metadata: last nutrition log, nudge timing, lock state.

This means the near-term opportunity is mostly derived metrics, not new manual tracking.

## Highest ROI Metrics

### 1. Logging Consistency Score

Priority: Very high 
Friction: None 
Data source: existing nutrition, weight, cardio, steps logs

Track how consistently a client logs the expected inputs over the last 7 and 14 days.

Useful outputs:

- Nutrition logged: 6/7 days.
- Weight logged: 4/7 days.
- Steps logged: 7/7 days.
- Cardio logged: 3/4 expected sessions.
- Overall logging completeness: 78%.

Why coaches care:

Before judging compliance, coaches need to know whether the data is complete enough to trust.

Product angle:

"Know whether the client is non-compliant or just under-reporting."

### 2. Target Deviation

Priority: Very high 
Friction: None 
Data source: nutrition logs, cardio logs, steps logs, targets

Gardnr currently tracks compliance by days at or above 90% of target. Add magnitude.

Useful outputs:

- Calories: +180/day over target.
- Protein: -22g/day under target.
- Steps: -1,850/day under target.
- Cardio: -45 minutes/week under target.

Why coaches care:

Two clients can both be 4/7 compliant, but one is barely missing and the other is far off plan. Magnitude helps coaches make better adjustments.

Product angle:

"Not just whether they missed. How much they missed by."

### 3. Check-In Readiness

Priority: Very high 
Friction: None 
Data source: logs, check-ins, targets, reports

Create a coach-facing readiness state for each client before a weekly check-in.

Example states:

- Ready: enough logs, check-in submitted, trend available.
- Partial: missing weight or activity data.
- Not ready: sparse logs or no check-in.

Suggested inputs:

- Nutrition logged at least 5/7 days.
- Weight logged at least 3/7 days.
- Steps/cardio logged if targets exist.
- Weekly check-in submitted.
- At least one meaningful note or obstacle entered.

Why coaches care:

This maps directly to the job they are trying to do before calls and reports.

Product angle:

"Open the dashboard and know which check-ins are ready."

### 4. Weekend Drift

Priority: High 
Friction: None 
Data source: nutrition logs, steps logs, weight logs

Compare weekday behavior against weekend behavior.

Useful outputs:

- Weekend calories average +420/day vs weekday.
- Weekend protein average -28g/day vs weekday.
- Weekend steps average -2,100/day vs weekday.
- Monday weight spike detected after high-calorie weekend.

Why coaches care:

Many nutrition clients are compliant during the week and lose control on weekends. This is highly recognizable to coaches and easy to market.

Product angle:

"Find the pattern that is hiding inside the weekly average."

### 5. Weight Trend Reliability

Priority: High 
Friction: None 
Data source: weight logs, weighed_at

Use weigh-in count and time consistency to tell the coach how reliable the weight trend is.

Useful outputs:

- High confidence: 5 weigh-ins, mostly morning.
- Medium confidence: 3 weigh-ins, mixed timing.
- Low confidence: 1 weigh-in or inconsistent timing.

Why coaches care:

Weight fluctuations are noisy. Coaches need to avoid overreacting to a trend built from poor data.

Product angle:

"Know whether the scale trend is real or just noisy."

### 6. Attention / Risk Flag

Priority: High 
Friction: None 
Data source: logs, check-ins, messages, reactions, nudges

Flag clients who may need coach intervention.

Suggested triggers:

- No nutrition log for 2+ days.
- Protein compliance below threshold.
- Steps/cardio drop-off.
- Check-in not submitted.
- Low energy rating.
- Negative message reaction.
- Nudge sent but no logging afterward.

Why coaches care:

Coaches do not just need charts. They need a prioritized list of who needs attention today.

Product angle:

"Know who is slipping before they disappear."

### 7. Check-In Timeliness

Priority: Medium-high 
Friction: None 
Data source: check_ins.created_at, week_of

Track whether clients submit check-ins on time and whether this is improving or slipping.

Useful outputs:

- Submitted this week.
- Late by 2 days.
- Missed 2 of last 4 check-ins.
- Check-in streak: 4 weeks.

Why coaches care:

Check-in consistency is a proxy for engagement and coaching health.

Product angle:

"Spot disengagement before the client churns."

### 8. Report Read Status

Priority: Medium-high 
Friction: None 
Data source: reports.read_at

Track whether clients read coach reports.

Useful outputs:

- Last report read.
- Last report unread after 3 days.
- Report read streak.

Why coaches care:

If the coach sends feedback and the client does not read it, adherence problems may not be a nutrition problem.

Product angle:

"Know whether your coaching feedback is being seen."

### 9. Nudge Responsiveness

Priority: Medium 
Friction: None 
Data source: nudge timing, subsequent logs/messages

Track whether nudges cause the client to re-engage.

Useful outputs:

- Logged within 24 hours of nudge.
- No response after nudge.
- Nudge cooldown active.

Why coaches care:

Coaches need to know whether a light touch works or whether the client needs a direct conversation.

Product angle:

"Measure whether reminders actually bring clients back."

### 10. Message Sentiment / Reaction Signal

Priority: Medium 
Friction: Low to none 
Data source: existing message reactions, optional future simple sentiment classification

Gardnr already stores message reactions and uses negative reactions in coach call prep. Build this into coach-facing risk context.

Useful outputs:

- Negative reaction this week.
- Client mood concern.
- Positive response after coach feedback.

Why coaches care:

Adherence problems often show up in tone, stress, and client responses before they show up in numbers.

Product angle:

"Data plus client context in one view."

## Best Low-Friction New Inputs

These are worth considering only after the derived metrics above are built or designed.

### 1. Hunger Rating

Priority: High 
Friction: One tap 
Format: 1-5 or Low / Normal / High

Why coaches care:

Helps decide whether calories are too aggressive, protein/fiber timing needs work, or adherence risk is rising.

Implementation note:

Make it optional and quick. Do not force a daily journal.

### 2. Sleep Quality

Priority: Medium-high 
Friction: One tap 
Format: Poor / OK / Good

Why coaches care:

Sleep affects hunger, energy, scale weight, recovery, and compliance.

Implementation note:

Do not build full sleep tracking yet. A simple subjective pulse is enough.

### 3. Training Completed

Priority: Medium-high 
Friction: One tap 
Format: Rest / Trained

Why coaches care:

Gardnr is not a workout platform, but knowing whether the client trained gives useful context for hunger, weight, steps, cardio, and fatigue.

Implementation note:

Avoid building a full workout logger. Keep it as context.

### 4. Stress Rating

Priority: Medium 
Friction: One tap 
Format: 1-5 or Low / Normal / High

Why coaches care:

Stress is a common driver of poor adherence and poor sleep.

Implementation note:

This could be part of the weekly check-in before it becomes a daily input.

### 5. Digestion / Bloating Flag

Priority: Medium 
Friction: One tap 
Format: Normal / Bloated / GI issue

Why coaches care:

Useful when scale weight spikes despite good adherence.

Implementation note:

Keep optional. This is valuable for some coaches but not universal.

## Metrics to Avoid for Now

Do not prioritize these yet:

- Full micronutrient tracking.
- Water tracking unless customers specifically ask for it.
- Detailed mood journaling.
- Full workout programming or exercise library.
- Wearable integrations before the core coach workflow is stronger.
- Complex habit tracking that competes with the nutrition coaching focus.

These add surface area and friction without clearly strengthening Gardnr's core positioning.

## Recommended Product Package

The strongest next product package is:

### Client Readiness + Risk Score

Use mostly existing data:

- Logging consistency.
- Target deviation.
- Weight trend reliability.
- Check-in submitted/on-time.
- Missed logs.
- Low energy or negative reaction.
- Report unread.
- Nudge response.

Suggested coach-facing output:

- Ready
- Needs review
- At risk

Suggested detail:

- "Nutrition logged 3/7 days."
- "Protein averaged 24g under target."
- "No weigh-in since Tuesday."
- "Check-in not submitted."
- "Last report unread."

Why this is the best next move:

- High coach value.
- Low client friction.
- Strong marketing story.
- Uses Gardnr's existing data model.
- Differentiates from generic nutrition trackers.

## Market Positioning Angle

This should be marketed as coaching intelligence, not just analytics.

Better wording:

"Know who is ready for check-in, who is drifting, and what changed this week."

Avoid wording:

"Advanced analytics dashboard."

The first sounds like a coach workflow solution. The second sounds like generic software.

## Evidence Notes

The research direction supports focusing on self-monitoring and adherence intelligence:

- USDA Nutrition Evidence Systematic Review: higher frequency or adherence to diet and weight self-monitoring is associated with more favorable body weight outcomes in behavioral weight management contexts.
 https://nesr.usda.gov/what-relationship-between-use-diet-and-body-weight-self-monitoring-strategies-and-body-weight

- Live SMART secondary analysis: adherence to self-monitoring of dietary intake, self-weighing, and physical activity was associated with weight change during the same month.
 https://pubmed.ncbi.nlm.nih.gov/31556659/

- Electronic dietary self-monitoring research: adherence to self-monitoring is consistently treated as a meaningful predictor and engagement signal in weight loss contexts.
 https://pmc.ncbi.nlm.nih.gov/articles/PMC6647027/

These sources do not mean Gardnr should claim guaranteed outcomes. They support the product strategy of tracking logging consistency, adherence, and coach-visible context.

## Self-Check: What Was Added After Review

Initial recommendations focused heavily on nutrition, weight, steps, cardio, hunger, energy, and sleep. After checking the actual Gardnr codebase and current-state document, four additional low-friction areas were added:

- Check-in timeliness.
- Report read status.
- Nudge responsiveness.
- Message reaction/sentiment signal.

These were added because Gardnr already has messages, reports, check-ins, reactions, and nudge metadata. They are valuable to coaches and do not require new client logging behavior.


