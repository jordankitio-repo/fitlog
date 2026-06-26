# Gardnr — Pre-Public Launch Readiness

> Status of the security + compliance program. Scope: **US-only, 18+, not HIPAA-covered** (FTC HBNR + state consumer-health-data laws bind). Last updated Jun 25 2026. Companion docs: [data-map.md](data-map.md), [subprocessors.md](subprocessors.md), [breach-response.md](breach-response.md).

## Verdict
**Engineering & data-protection readiness: DONE.** The two live launch-blockers we started with (public profile photos; account deletion that silently skipped data) are closed and verified in prod. Remaining items are **owner/legal tasks only** (counsel review, accept DPAs) — none are code.

## Security

| Item | Status | Evidence |
|---|---|---|
| Tenant isolation (RLS on every table) | ✅ | `tests/rls/` harness (isolation + billing); extended to body_measurements/notifications/rate_limits (`61899e5`) |
| Profile photos private (was public bucket) | ✅ | Migration `20260624130000`; signed-URL/RLS; prod-verified (owner can read, unrelated denied) — `3921472` |
| Right-to-erasure complete | ✅ | `delete-account` covers all personal tables + storage; service_role grants `20260624120000`; prod E2E — `3921472` |
| Security headers (CSP/HSTS/frame/nosniff/referrer/permissions) | ✅ | `vercel.json`; confirmed serving on prod — `3921472` |
| Per-user rate limiting on AI endpoints | ✅ | `rate_limits` + `check_rate_limit` RPC; locked to service_role, prod-verified (authenticated → 42501) — `3921472`, `20260625000000` |
| Supabase Security Advisor | ✅ | Triaged; `handle_new_user` search_path pinned, trigger fns' RPC EXECUTE revoked — `7f3cc28` |
| Secrets hygiene | ✅ | `.env` gitignored; git-history scan = no secret ever leaked; prod deps 0 vulns |
| Auth: leaked-password protection | ✅ | Enabled in Supabase (HIBP) — confirmed live (blocks breached passwords) |

## Data-subject rights

| Item | Status | Evidence |
|---|---|---|
| Access / portability (export) | ✅ | Profile "Export my data" — all personal tables; prod-verified — `e76f8d6` |
| Deletion | ✅ | See erasure above |
| Correction | ✅ | In-app editing |
| 18+ age gate | ✅ | Required clickwrap checkbox at signup — `e76f8d6` |

## Legal / policy (drafts — counsel to review)

| Item | Status | Evidence |
|---|---|---|
| Privacy Policy | ✅ draft | `Privacy.jsx` — accurate to the code (cookies→localStorage fix, breach commitment, state rights) `f4e38ef` |
| Terms of Service | ✅ draft | `Terms.jsx` — TX/AAA, 18+, HIPAA "no BAA / not for covered entities" `f4e38ef` |
| **Consumer Health Data Privacy Policy** (WA MHMDA) | ✅ draft | Separate `/health-data-privacy` page, linked from homepage + footers — `4e5a774`, `bd656fe` |
| Vulnerability disclosure | ✅ | `/.well-known/security.txt` (RFC 9116) — `e76f8d6` |
| Subprocessor register | ✅ | `compliance/subprocessors.md` — `d5303ae` |
| Breach-response runbook (FTC HBNR) | ✅ | `compliance/breach-response.md` |

## Determinations
- **HIPAA:** not covered (D2C, no insurance billing, no BAAs). Binding health regime = FTC HBNR. ([data-map.md](data-map.md))
- **PCI DSS:** SAQ A — card entry on Stripe-hosted Checkout; no PAN touches Gardnr.

## Accessibility (WCAG 2.1 AA)
- ✅ All public pages (landing, auth, legal) **axe-clean in light AND dark** — focus, labels, keyboard, zoom, contrast, links. App-wide button system fixed. `5cab91a`, `68177ad`, `1dcb297`.
- ⬜ **Gap:** authenticated app screens (Dashboard/Log/ClientView/Profile) not yet axe-scanned (need a logged-in scan). They inherit the token/button fixes; extend `scripts/a11y-scan.mjs` with a throwaway login to confirm.

## Owner / non-code actions (only you can do these)
1. **Legal review** — have the three policy drafts reviewed (Termly's MHMDA generator or a one-time flat-fee privacy attorney). They're accurate to the product; that's the foundation counsel builds on.
2. **Accept subprocessor DPAs** — standard click-to-accept (Supabase, Vercel, Resend; Stripe is automatic). Links in [subprocessors.md](subprocessors.md).
3. **Line up counsel + consider cyber-insurance** before launch (for the breach runbook).
4. At public launch: flip `BILLING_ENABLED`/`SOLO_BILLING_ENABLED` back on when ready (separate product decision).

## Recommended remaining engineering (optional, not blockers)
- Extend the a11y scanner to logged-in screens.
- A breach-detection alert (Supabase log drain) so detection isn't manual.
