# Gardnr — Data Map & Compliance Determinations

> Internal compliance reference (Jun 24 2026). Grounds the Privacy Policy, the Consumer Health Data Privacy Policy, breach response, and the subprocessor register. Scope locked: **US-only, 18+, not HIPAA-covered.** Operator: **Digigarden LLC**. Not legal advice — for counsel review.

## 1. Personal data inventory

| Category | Fields | Where stored | Sensitive? |
|---|---|---|---|
| Identity / account | email, full_name, password (hash) | Supabase Auth + `profiles` | — |
| Profile / biometric | sex, birth_date, height_cm, activity_level, primary_goal, unit_preference | `profiles` | **health** |
| Profile photo | avatar JPEG | Supabase Storage `avatars` (**private**, signed-URL reads) | **sensitive** (face) |
| Nutrition | food, calories, protein/carbs/fat, servings, meal grouping | `nutrition_log`, `saved_meals`(+items) | **health** |
| Body metrics | weight + time-of-day, body measurements (neck/chest/waist/hips/arm/thigh), step counts, cardio | `weight_log`, `body_measurements`, `steps_log`, `cardio_log` | **health** |
| Metric provenance | `source` (manual or the device that supplied it), `source_connection_id`, `external_id` on the three metric tables | `weight_log`, `steps_log`, `cardio_log` | **health** (context) |
| Device connections | connected provider, device label, sync status + watermark, which device owns a metric | `device_connections`, `device_metric_preferences` | — (operational) |
| Deleted-row tombstones | the provider record id of a synced row the user deleted, so it is not re-imported | `device_dismissals` | — (internal) |
| Health-data consent | separate collect / share-with-coach grants per provider, policy version, withdrawal timestamp | `health_data_consents` | — (consent record) |
| Goals / targets | calorie/macro/cardio/step targets, weight goal | `targets` | **health** |
| Coaching content | check-ins (+answers), coach notes, reports, messages, custom questions, day-complete markers | `check_ins`, `coach_notes`, `reports`, `messages`, `checkin_questions`, `day_complete` | **health** |
| Relationship | coach↔client links, invitations (email + token) | `coach_clients`, `invitations` | — |
| Billing | Stripe customer/subscription IDs, status, trial flags; **hashed** email for trial dedup | `subscriptions`, `trial_ledger` | — |
| Card data | **NONE stored** — entered on Stripe-hosted Checkout | (Stripe only) | — |
| Notifications | server-pushed events | `notifications` | — |
| Notification prefs | which emails the user switched off (per category) | `notification_preferences` | — |
| Technical | IP, user-agent, device, usage | Supabase + Vercel request logs | — |
| Client-side prefs | theme, notif last-seen, chart prefs | browser `localStorage` (not cookies) | — |
| Abuse control | per-user rate-limit counters | `rate_limits` | — |

**"Consumer health data"** (WA My Health My Data Act / NV SB370 / CT defns) = weight, body measurements, nutrition, fitness activity, body-composition goals, biometric profile fields, and arguably the profile photo. This is the trigger for the separate **Consumer Health Data Privacy Policy** + affirmative collection/share consent.

## 2. Subprocessors (→ Privacy Policy + DPA register)

| Vendor | Role | Data it sees | DPA / notes |
|---|---|---|---|
| **Supabase** (AWS, US-East) | DB, Auth, Storage, Edge Functions | ~all data at rest | DPA on file (verify) |
| **Vercel** | Hosting / CDN | request metadata, IP | DPA (verify) |
| **Stripe** | Payments | name, email, **card data** (their scope) | PCI L1; SAQ A for us |
| **Resend** | Transactional email | email address + email content | DPA (verify) |
| **Anthropic** (Claude API) | AI reports / briefs / nutrition feedback | **health/fitness data in prompts** | **Confirm: commercial terms = no-training + zero/limited retention.** Disclosed in Privacy §8 |
| **USDA FoodData Central** | Food search | typed food name only (no PII) | public API |
| **Google** (OAuth) | Optional sign-in | name, email | OAuth on hold pre-launch |

### 2b. Data sources (inbound) — NOT subprocessors

Device integrations are **sources**, not processors: health data flows *in*, and the only thing flowing *out* is an authorization to read. There is no DPA to sign for an inbound read. What is required instead is a recorded review of each vendor's developer terms, because those terms routinely forbid the two things this product does — **showing a client's data to their coach**, and **sending it to an AI model**.

Full clause-by-clause review: **[`device-api-terms.md`](device-api-terms.md)**. Summary:

| Source | What we receive | Status |
|---|---|---|
| **Apple Health** (needs a native app) | steps, weight, workouts | Cleared — Guideline 5.1.3 carve-out covers coach sharing + AI for health management |
| **Android Health Connect** (needs a native app) | steps, weight, workouts | Cleared — requires explicit consent + Play health-permissions declaration |
| **Whoop** | steps, workouts | Usable — needs recorded opt-in for coach sharing; AI inference is a reading, not a written permission |
| **Withings** | weight, steps, workouts | Usable — but since Oct 12 2026 a new account needs Withings+ (~$100/yr) to share with a free-plan app |
| **Google Health API** (Fitbit/Pixel/Android) | steps, weight, workouts | Blocked — Restricted scopes need OAuth verification + annual CASA; its own terms not yet reviewed |
| **Oura** | — | **Disqualified** — forbids disclosing data to any third party (the coach) and forbids even *prompting* an AI with it |
| **Strava** | — | **Disqualified** — same two clauses |

## 3. Determinations

**HIPAA — NOT covered.** Direct-to-consumer coaching; no insurance billing; no covered-entity business-associate relationship. Guardrail: ToS will state the service is **not for covered entities / PHI-on-behalf-of**, and Gardnr **declines BAAs**. Binding health regime is therefore the **FTC Health Breach Notification Rule** (vendors of personal health records not covered by HIPAA) — requires breach detection + notice to affected individuals (and FTC, and media if ≥500) without unreasonable delay (≤60 days).

**PCI DSS — SAQ A.** All card entry happens on the **Stripe-hosted Checkout page** (`create-checkout-session` returns a URL; the frontend redirects). No PAN touches Gardnr's frontend or servers. Eligible for the shortest self-assessment (SAQ A); rely on Stripe's PCI Level 1 attestation.

**Other binding regimes (US):** CCPA/CPRA + ~14 state privacy laws (access / delete / correct / **portability** / "do not sell or share" — Gardnr does not sell); WA MHMDA + NV/CT consumer-health-data laws (separate policy + consent + no geofencing + no sale without separate authorization); CAN-SPAM (transactional only today; per-category email opt-out shipped Oct 19 2026, Profile → Notifications); ADA / WCAG 2.1 AA.

## 4. Data-subject rights — current implementation

| Right | Mechanism | Status |
|---|---|---|
| Access / portability | Profile → "Export my data" → complete JSON (all personal-data tables) | ✅ completed Jun 24 |
| Deletion / erasure | Profile → delete account → `delete-account` (all tables + storage photo) | ✅ completed Jun 24 |
| Correction | Edit in-app (profile, logs, targets) | ✅ existing |
| Age gate | Required 18+ / Terms+Privacy checkbox at signup | ✅ added Jun 24 |
| Consent (health data) | `health_data_consents` — separate `device_collect` + `device_share_coach` grants, with withdrawal | 🟡 **devices only**; base-app collection still ⬜ pending |
| Breach response runbook | **TODO** — FTC HBNR process | ⬜ pending |

## 4b. Erasure gap found and fixed (Oct 15 2026)

`20260624120000_service_role_grants_erasure` fixed a class of bug where a missing `service_role` grant made `delete-account`'s DELETEs silently no-op — but it covered five tables and **missed `weight_log`, `cardio_log` and `steps_log`**, all classified health data above. The prod dump shows those three granting `service_role` only `REFERENCES,TRIGGER,TRUNCATE,MAINTAIN`.

Worse than the original case: `user_id` on these three has no foreign key to `auth.users`, so there was no `ON DELETE CASCADE` behind the failed DELETE either — the rows would orphan permanently once the auth user was gone.

Fixed by `20261015000000_service_role_grants_metric_logs` (grants) plus a change to `delete-account` so **every** DELETE response is checked and a failure **aborts before the auth user is deleted**. The local RLS suite could not catch this: a local stack creates tables through the normal flow and inherits platform default privileges that prod's pooler-created tables never got, so the erasure test passed against a more permissive environment than production.

**Verify against prod** with:
```sql
select table_name, privilege_type from information_schema.role_table_grants
where grantee = 'service_role' and table_name in ('weight_log','cardio_log','steps_log');
```

## 5. Retention
Account/personal data retained while the account exists; erased on deletion. A **disconnected** `device_connections` row is retained so provenance on already-imported rows stays readable; disconnecting is not erasing, and the user chooses separately whether to delete what the device imported (`purge_device_data`, which never touches a row they edited by hand). **`trial_ledger`** (hashed email) deliberately retained after deletion for trial-fraud prevention. Server/request logs follow Supabase + Vercel default retention. Rate-limit counters are transient.
