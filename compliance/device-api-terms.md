# Device & wearable API terms review

> Internal compliance reference (Oct 15 2026). Reviewed before building device sync, because two of Gardnr's core features — **a coach reading their client's numbers** and **AI-generated reports** — are exactly what wearable vendors' API terms most often forbid. Not legal advice; for counsel review.

**The two questions every vendor is tested against:**

1. **Coach visibility** — may a user's data be shown to another person (their coach)?
2. **AI use** — may the data be sent to an AI model?

These are the clauses that disqualified Strava, and they recur in nearly every vendor's agreement. Any new provider must be reviewed against both **before** an adapter is written.

---

## Verdicts

| Vendor | Coach visibility | AI use | Verdict |
|---|---|---|---|
| **Apple Health** (HealthKit, via a native app) | ✅ permitted with user permission | ✅ not restricted for health management | **Use** |
| **Android Health Connect** (via a native app) | ✅ permitted with explicit consent | ✅ not restricted | **Use** |
| **Whoop** | ⚠️ only with explicit opt-in consent | ⚠️ no model training; inference arguably OK | **Usable with care** |
| **Withings** | ✅ no prohibition found | ✅ none found | **Usable, but now costs the client** |
| **Google Health API** (Fitbit, Pixel, Android) | ⚠️ unreviewed | ⚠️ unreviewed | **Blocked** — restricted scopes, OAuth verification + CASA |
| **Oura** | ❌ forbidden | ❌ forbidden | **Disqualified** |
| **Strava** | ❌ forbidden | ❌ forbidden | **Disqualified** |
| **Garmin** | — | — | **Unavailable** — partner-approval only, sign-ups reportedly closed |

---

## Disqualified

### Oura — do not build

- **Coach visibility.** API Agreement §4(a)(vi) prohibits "aggregating, selling, transferring, renting, leasing, licensing, sharing, redistributing, or **disclosing User Data** … **to any third party**, except as specifically provided for under this Agreement." A client's coach is a third party, and the agreement provides no coaching exception. §3(e) separately requires Oura's **prior written approval per end customer** before data reaches them.
- **AI use.** §4(d): "You shall not use, and shall not permit any third party to use, the Oura API to develop, train, fine-tune, evaluate, **prompt**, or otherwise **provide input or data to any AI Model or AI Platform**." §6(g) repeats it in capitals. This is **broader than Strava's**: it forbids not merely training a model but *asking one about the data*, which is precisely what `weekly-report`, `call-prep` and `nutrition-coach` do.
- **Also:** §4(a)(xiii) prohibits "charging Users in any manner for access to or use of … the Oura API or Oura Platform"; §5(f) mandates deletion of all User Data **within 72 hours** of a deletion request, which conflicts with keeping imported history after a disconnect.

### Strava — do not build

2026 API terms prohibit disclosing a user's data to another user ("you may not disclose such data to, or use it for, another user nor any other third party", §§2.3 / 6.1), prohibit acting as a pass-through or aggregator (§5.16(a)), and prohibit use of API data for AI/ML. Coaching platforms were an explicit target of the change.

---

## Usable

### Whoop — usable, with two conditions

- **Coach visibility — conditional.** Prohibits "Expose WHOOP Data to other users or to third parties **without explicit opt-in consent** from the user that provided the WHOOP Data." Consent is therefore the gate, not a ban. **This is what `health_data_consents.kind = 'device_share_coach'` exists to satisfy** — a separate, affirmative, recorded opt-in, which WA MHMDA requires anyway.
- **AI use — narrower than Oura's.** Prohibits using data to "create, develop, test, train, fine-tune or improve any large language model or any other machine learning or artificial intelligence model." Every verb concerns *building* a model. It does not, on its face, prohibit inference — sending data to an existing model to generate a report for the user. That is a defensible reading, and materially different from Oura's explicit ban on "prompt, or otherwise provide input."
  **Open risk:** it is a reading, not a written permission. Before shipping Whoop, either get written confirmation, or exclude Whoop-sourced rows from AI prompts. The `source` column makes the latter a filter rather than a redesign.
- **Derived data.** Prohibits creating "a derivative work of … WHOOP Data". Compliance percentages computed from Whoop cardio minutes are arguably derivative. The clause reads as aimed at redistribution rather than internal display, but it is a noted risk.
- **Charging.** Explicitly permitted: "Company is not prohibited from charging a fee for the provision of functionality not provided by the WHOOP Platform." Gardnr charges coaches for coaching tools, not for Whoop data.
- **Attribution.** May state that Gardnr uses the WHOOP API; may **not** imply partnership or endorsement without written consent.
- **Coverage note.** Whoop provides steps (cycle aggregates, scored cycles only) and workouts. **No weight series** — only a single current body measurement.

### Withings — usable, but the client now pays

No coach-visibility or AI prohibition found in the public terms.

**⚠️ Changed Oct 12 2026, days before this review:** Withings+ ($9.99/mo, $99.99/yr US) is **required on the free API plan** for an account to share health data with a third-party app. Accounts created **before** Oct 12 2026 are unaffected; Enterprise lifts it for specific use cases. Withings explicitly closed the workaround of routing via Apple Health or Google's health ecosystem.

**Consequence:** any client who buys a Withings scale from now on must pay Withings ~$100/yr for Gardnr's integration to work. That is a material change to the value of this integration and should be weighed before building the adapter. Withings remains the only reviewed vendor that provides a genuine **weight series**, because it is the only one that sells scales.

### Apple Health — the cleanest option, and it needs a native app

HealthKit has **no cloud API**; data is on-device only, so this requires a native iOS app, not the PWA.

App Review Guideline **5.1.3** restricts health data from being used or disclosed "for advertising, marketing, or other use-based data mining purposes **other than improving health management**, or for the purpose of health research, and then only with permission."

Both of Gardnr's at-risk features fall inside the carve-out: sharing with a coach, and AI feedback to the client, are *health management*, with the user's permission. There is **no prohibition on LLM use** and **no ban on showing data to a coach with consent**. Also prohibited, and not things Gardnr does: writing false data into HealthKit, and storing health data in iCloud.

**The strategic point:** once a client's Oura ring, Whoop or Fitbit has synced into Apple Health, reading it from Apple Health is reading *Apple Health data with the user's permission* — not Oura API data under Oura's agreement. A native app therefore reaches the data of vendors whose API terms disqualify them, and covers clients who own no wearable at all.

### Android Health Connect — same shape as Apple

On-device, so again a native app. Health Connect data is "personal and sensitive user data" under Play's User Data policy: access must be the minimum necessary, a prominent disclosure and privacy policy are required, and **sharing with third parties requires explicit user consent**. No AI prohibition surfaced. Requires a Play Console health-permissions declaration.

---

## Blocked

### Google Health API (Fitbit, Pixel Watch, Android)

The replacement for both the **Fitbit Web API (shut off Oct 30 2026)** and Google Fit (support ends end of 2026). It *is* a genuine cloud REST API (`health.googleapis.com/v4/...`), so a server-side read path exists.

Blocked on access, not terms: every `googlehealth.*` scope is Google-**Restricted**, requiring OAuth app verification (~6 weeks) plus an **annual CASA security assessment** past 100 users. Gardnr has a standing internal hold on Google OAuth verification work. Buildable and testable in Google's Testing mode (≤100 users, no verification) in the meantime.

**Its own developer terms have not yet been reviewed against the two questions above.** Do that before enabling it — do not assume Apple's permissiveness carries over.

---

## Standing rules

1. **Review both questions before writing an adapter.** The pattern is not incidental; vendors are actively tightening these clauses (Strava in 2024-26, Oura's AI clause, Withings' paywall three days before this review).
2. **`source` is the enforcement point.** Every metric row records where it came from, so a vendor-specific restriction — "do not send this to an AI", "delete within 72 hours" — is a filter on a column, not a re-architecture.
3. **Consent is recorded, not assumed.** `health_data_consents` holds separate `device_collect` and `device_share_coach` grants with a withdrawal timestamp. This satisfies WA MHMDA / NV / CT *and* Whoop's opt-in requirement with one mechanism.
4. **Re-review on renewal.** These terms change without notice and the changes have twice been adverse. Re-check before any provider work, and record the date here.
