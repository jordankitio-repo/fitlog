# Gardnr — Data Breach Response Runbook

> The binding regime for Gardnr (a non-HIPAA "vendor of personal health records") is the **FTC Health Breach Notification Rule (HBNR)**, 16 CFR Part 318, as amended (in effect July 29 2024), plus state breach-notification laws and WA MHMDA. This runbook is the pre-decided plan so a breach isn't improvised. Operator: **Digigarden LLC**. Not legal advice — engage counsel when a real incident occurs.

## 0. What counts as a breach
A **breach of security** under HBNR is the unauthorized **acquisition** of identifiable health information — including unauthorized access, an external compromise, OR an unauthorized internal disclosure (e.g., one user able to read another's health data, a public-bucket leak, a mis-scoped RLS policy). Acquisition is presumed when there's unauthorized access unless you can show it didn't occur.

Examples for Gardnr: a leaked `SUPABASE_SERVICE_ROLE_KEY`, an RLS regression exposing cross-tenant data, the avatars bucket made public again, a Stripe/Resend/Anthropic/Supabase subprocessor breach affecting our data, credential stuffing yielding account takeover.

## 1. Detect (sources to watch)
- Supabase logs + (recommended) log drains / alerts; the **Security Advisor** (run periodically).
- Auth anomalies (spikes in failed logins, signups, password resets), `rate_limits` spikes.
- Error monitoring / unexpected 500s from edge functions.
- The **`/.well-known/security.txt`** contact (`digigardenllc@gmail.com`) — external researcher reports.
- Subprocessor status pages / breach notices (Supabase, Stripe, Resend, Vercel, Anthropic).
- User reports.

## 2. Contain & preserve (first hours)
1. **Stop the bleeding:** rotate the implicated secret (Supabase service-role/anon, Stripe, Resend, USDA, Anthropic) in Supabase + Vercel; revoke sessions; disable the affected account(s)/feature; if data-layer, revert the offending migration/policy.
2. **Preserve evidence:** export relevant Supabase logs and timestamps *before* changing things; note discovery date/time (the 60-day clock starts at discovery).
3. **Don't destroy/alter** affected records beyond what containment requires.

## 3. Assess scope
Determine: **what data** (which tables/fields — was it consumer health data?), **how many individuals**, **which U.S. states** they reside in (drives state-law + media triggers), **whether identifiable health info was acquired**, and **which third parties** (if any) received it. Write a short factual timeline.

## 4. Notify — FTC HBNR obligations
Trigger once you confirm a breach of unsecured identifiable health info.

| Who | When | How / content |
|---|---|---|
| **Affected individuals** | Without unreasonable delay, **≤ 60 calendar days** after discovery | Email (or first-class mail). Clear, plain language. |
| **The FTC** | If **≥ 500** individuals: **same time** as individuals (≤60 days). If **< 500**: log it and report to the FTC **annually** (within 60 days of year-end) | Via the FTC HBNR online form |
| **Prominent media** | If **≥ 500 residents of a single state/jurisdiction** | Notice to prominent media serving that area |

**Individual-notice content (HBNR-required):**
- What happened + the date of the breach and the date of discovery.
- The types of information involved (e.g., name, email, weight, body measurements, nutrition logs, photo).
- **The full name/identity of any third party that acquired the data**, if known.
- Steps individuals can take to protect themselves.
- What Gardnr is doing (investigation, mitigation, safeguards).
- **Contact procedures — at least two of:** toll-free phone, email, website, in-app notice, postal address.

## 5. State law + MHMDA overlay
US-only means state breach-notification laws also apply (most require notice to affected residents "without unreasonable delay"; some require state AG notice above a threshold). Because Gardnr handles **consumer health data**, also consider **WA MHMDA** (Washington AG) and NV/CT. Counsel maps the specific states once the affected-resident list is known. Don't let the state analysis delay the HBNR 60-day clock.

## 6. Subprocessor breaches
If the breach originates at a subprocessor (see [subprocessors.md](subprocessors.md)), their notice to us starts our clock for *our* users. Get their incident report; our HBNR duty to our users still stands.

## 7. Post-incident
Root-cause; ship the fix + a **regression test** (extend `tests/rls/` for a data-isolation breach — that harness already exists); update this runbook + controls; keep a written record (date discovered, scope, who was notified, when, remediation) for the FTC annual log and audit trail.

## Roles & contacts (fill in)
- **Incident lead:** Digigarden LLC owner (solo — designate a backup if/when the team grows).
- **Counsel:** _[engage a privacy attorney; line one up before launch]_
- **Cyber-insurance:** _[none yet — consider a policy]_
- Subprocessor support: Supabase, Stripe, Resend, Vercel, Anthropic dashboards/status pages.
- FTC HBNR notice form: ftc.gov (Health Breach Notification Rule).

Sources: [FTC HBNR final rule (2024)](https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-finalizes-changes-health-breach-notification-rule) · [FTC HBNR overview](https://www.ftc.gov/legal-library/browse/rules/health-breach-notification-rule).
