# FitLog — Current State

> **Purpose:** The live, fast-changing snapshot. Update this at the end of every session. Everything durable lives elsewhere:
> - **How it's built** → `architecture.md`
> - **Why it was built that way** → `decisions.md`
> - **What could be built next** → `features.md`
>
> Keep this file short. If something here stops changing session-to-session, promote it to `architecture.md` or `decisions.md`.

---

## Current Commit
`e5acdf4 feat: email cancellation confirmations` (~180+ commits)

## Production
- **Live URL:** https://www.tryfitlog.com
- **Build:** Passing (`npm run build`)
- **Lint:** Failing on pre-existing issues only (4 errors / 9 warnings) — no new errors
- **Deploy:** Auto on push to `main` via Vercel
- **Billing:** Live mode active (`BILLING_ENABLED = true`)

---

## Recently Shipped (most recent first)

**Self-serve cancel + resume** — `cancel-subscription` edge fn, `SubscriptionManager.jsx`, cancel-at-period-end, confirmation email.

**Solo Premium tier** — $7.99/mo, 14-day trial, pause/resume during coaching, `solo_id` on subscriptions, `SoloUpgrade.jsx`, AI nutrition advice gated.

**Tier 1 analytics (all 6)** — compliance heatmap, rolling 7-day weight average, weekday/weekend split, best-week analysis, client ranking dashboard, milestone streak celebrations + coach notification.

**Billing layer complete** — Stripe live mode, coach paywall, webhook (offboard on cancel), legal docs (Terms 21§ / Privacy 14§), feedback button, weekly coach digest (pg_cron Monday 8am UTC).

---

## Verified This Session (June 6, 2026)

Full live workflow tested end-to-end — all passing:
- `on_auth_user_created` trigger confirmed present in live DB
- Coach signup → role picker → billing card → Stripe checkout → dashboard
- Subscription row writes `status: trialing` correctly (confirms webhook fix)
- Coach invite → client accept → connection
- Coach offboard → client → solo + in-app notification
- Solo Premium trial checkout
- Re-invite existing (now Solo Premium) user → correct messaging → accept → client
- Client leave coaching → back to solo trialing
- Coach cancel subscription → confirm → cancel → resume

**Conclusion:** App is functionally solid for first real users.

---

## Open Bugs

| Issue | Status |
|---|---|
| Chart.js Filler plugin warning | Cosmetic, deferred (Filler now registered — verify gone) |
| `npm run lint` 4 errors / 9 warnings | Pre-existing, deferred |
| Offboard in-app notice shows twice | Cosmetic, deferred |
| Large Vite JS chunk warning | Deferred |

**Resolved:** ~~`subscriptions.status` writes `active` instead of `trialing`~~ — fixed (webhook fetches real Stripe sub object); verified `trialing` live June 6.

---

## Current Priorities (in order)

1. **Buy `gardnr.fit` domain** — $2.98/yr, 2 min, unblocks rebrand. (See rebrand plan below.)
2. **Apply Phase 1 rebrand to `main`** — text-only FitLog → Gardnr (file-by-file changes documented in rebrand plan).
3. **Swap landing page** — replace `Landing.jsx` with the Gardnr version from the June 6 session.
4. **Phase 2 domain migration** — connect gardnr.fit to Vercel + verify in Resend + swap `tryfitlog.com` → `gardnr.fit`.
5. **Beta coach outreach** — 3–5 founding coaches at $19/mo locked.
6. **Google OAuth production verification** — currently testing mode only.

---

## Next Planned Features (Tier 2)

Source of truth is `features.md`. Top of the Tier 2 queue:
1. Structured client onboarding assessment (form → pre-populated targets)
2. Body measurements tracking (new table: waist/hips/arms)
3. Rate-of-weight-change alerts (weekly pace, safe-range edge fn)
4. Auto-generated shareable PDF report card

Strong candidate package (from metrics roadmap): **Client Readiness + Risk Score** — logging consistency, target deviation, weight-trend reliability, check-in status → Ready / Needs review / At risk.

---

## Pending Verifications / Reminders

- Legal doc updates owed (see Legal Doc Tracker in `features.md`): self-serve cancellation now exists, Solo Premium $7.99 terms, pause/resume behavior, trial-aging disclosure, client-reconnection clause, coach-cancel-timing clause.
- Google OAuth still in testing mode — only manually added test users can sign in via Google.

---

## Rebrand Plan: FitLog → Gardnr (ready, not applied to main)

**New name:** Gardnr — **Tagline:** "Coaches don't build physiques. They create conditions for growth."
**Domain:** `gardnr.fit` ($2.98/yr first year, ~$33.98 renew) — recommended, not yet purchased.

**Phase 1 (text-only, safe to apply now):**
- All UI text in `src/` and `supabase/`: FitLog → Gardnr
- Email display names: `'FitLog <noreply@tryfitlog.com>'` → `'Gardnr <noreply@tryfitlog.com>'`
- Email body brand text, legal docs (Terms/Privacy), `index.html` title, export filename (`fitlog-export-*` → `gardnr-export-*`)
- **Do NOT change in Phase 1:** `noreply@tryfitlog.com` sender, `tryfitlog.com` URLs, `.supabase.co` refs, `Digigarden LLC`, `digigardenllc@gmail.com`, `package.json` name (`fitlog` internal id)

**Phase 2 (after gardnr.fit purchased + DNS):**
1. Connect gardnr.fit to Vercel (A + CNAME)
2. Verify gardnr.fit in Resend (DKIM + SPF + DMARC)
3. Switch sender to `noreply@gardnr.fit`
4. One pass: swap all `tryfitlog.com` → `gardnr.fit`

*Note: Phase 1 work was previously stashed/dropped from a deleted branch — must be re-applied cleanly.*

---

## Session Log (brief — newest first)

- **Jun 6** — Live workflow verification (all flows passing). Trigger confirmed. Began AI-context refactor: split into `architecture.md` + `decisions.md` + slim `current-state.md` (+ existing `features.md`).
- **Jun 5/6 (prior session)** — Rebrand decision (Gardnr), new landing page built (not merged), DB + Stripe cleared for clean slate.
- **Jun 5** — Tier 1 feature sweep (6 features), 6 bug fixes, steps unique-constraint fix.
- **Jun 4** — Solo Premium + self-serve cancel/resume; legal docs; Stripe live mode; weekly digest.
- **Jun 3–4** — Stripe billing full implementation; design sprint (Inter, color system, surfaces); nudge mechanic; hide-calories; domain + Resend verified.
