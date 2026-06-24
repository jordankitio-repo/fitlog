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
| Goals / targets | calorie/macro/cardio/step targets, weight goal | `targets` | **health** |
| Coaching content | check-ins (+answers), coach notes, reports, messages, custom questions, day-complete markers | `check_ins`, `coach_notes`, `reports`, `messages`, `checkin_questions`, `day_complete` | **health** |
| Relationship | coach↔client links, invitations (email + token) | `coach_clients`, `invitations` | — |
| Billing | Stripe customer/subscription IDs, status, trial flags; **hashed** email for trial dedup | `subscriptions`, `trial_ledger` | — |
| Card data | **NONE stored** — entered on Stripe-hosted Checkout | (Stripe only) | — |
| Notifications | server-pushed events | `notifications` | — |
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

## 3. Determinations

**HIPAA — NOT covered.** Direct-to-consumer coaching; no insurance billing; no covered-entity business-associate relationship. Guardrail: ToS will state the service is **not for covered entities / PHI-on-behalf-of**, and Gardnr **declines BAAs**. Binding health regime is therefore the **FTC Health Breach Notification Rule** (vendors of personal health records not covered by HIPAA) — requires breach detection + notice to affected individuals (and FTC, and media if ≥500) without unreasonable delay (≤60 days).

**PCI DSS — SAQ A.** All card entry happens on the **Stripe-hosted Checkout page** (`create-checkout-session` returns a URL; the frontend redirects). No PAN touches Gardnr's frontend or servers. Eligible for the shortest self-assessment (SAQ A); rely on Stripe's PCI Level 1 attestation.

**Other binding regimes (US):** CCPA/CPRA + ~14 state privacy laws (access / delete / correct / **portability** / "do not sell or share" — Gardnr does not sell); WA MHMDA + NV/CT consumer-health-data laws (separate policy + consent + no geofencing + no sale without separate authorization); CAN-SPAM (transactional only today); ADA / WCAG 2.1 AA.

## 4. Data-subject rights — current implementation

| Right | Mechanism | Status |
|---|---|---|
| Access / portability | Profile → "Export my data" → complete JSON (all personal-data tables) | ✅ completed Jun 24 |
| Deletion / erasure | Profile → delete account → `delete-account` (all tables + storage photo) | ✅ completed Jun 24 |
| Correction | Edit in-app (profile, logs, targets) | ✅ existing |
| Age gate | Required 18+ / Terms+Privacy checkbox at signup | ✅ added Jun 24 |
| Consent (health data) | **TODO** — explicit collection/share consent record (MHMDA) | ⬜ pending |
| Breach response runbook | **TODO** — FTC HBNR process | ⬜ pending |

## 5. Retention
Account/personal data retained while the account exists; erased on deletion. **`trial_ledger`** (hashed email) deliberately retained after deletion for trial-fraud prevention. Server/request logs follow Supabase + Vercel default retention. Rate-limit counters are transient.
