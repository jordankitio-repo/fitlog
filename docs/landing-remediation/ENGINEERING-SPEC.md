# Landing page remediation — engineering spec

Hand this to Codex. It is ordered by impact; ship the phases as separate commits
so each can be verified and reverted independently.

## Ground rules

1. **You do not write copy.** Every user-facing string on the landing page lives
   in `src/pages/landingContent.js`. Import from it. If a string you need isn't
   there, stop and flag it — do not invent one, and do not inline it.
2. **Landing.jsx must contain no hardcoded copy** when you're done. The existing
   `clients`, `pains`, `contrast`, `steps`, `trialSteps`, `capabilities` arrays at
   the top of the file are superseded by `landingContent.js` — delete them.
   (`clients` is the fake product-preview data and is handled in Phase 5.)
3. **No analytics on authenticated routes.** See Phase 2. This is a compliance
   constraint, not a preference.
4. After each phase, run `npm run lint` and `npm test`, and verify the landing
   still renders at 375px, 768px, and 1440px.

---

## Phase 1 — Serve the landing page to mobile visitors (P0)

**The bug.** `src/App.jsx:107` decides the homepage by *screen width*:

```js
const showLoginAsHome = !session && path === '/' && isMobile   // isMobile = max-width 600px
```

So every logged-out visitor on a phone gets the sign-in form as the homepage.
Verified live: at a Pixel 5 viewport, `https://gardnr.fit/` renders `<h1>Sign in</h1>`
and ~12 words of body text. Because Google indexes with Googlebot Smartphone
under mobile-first indexing, that login form *is* the indexed homepage.

**Why the flag exists (do not just delete it).** An installed PWA user launching
from their home screen lands on `/` and should get login, not marketing. The flag
is right in intent and wrong in its test: it keys off viewport width when it
should key off **launch context**.

**The fix.** Replace the width test with a standalone-display test:

```js
// A PWA launched from the home screen opens at `/` and wants the sign-in form.
// A stranger who tapped a link in a browser — at any width — wants the landing.
const isStandalone = useMediaQuery('(display-mode: standalone)')
const showLoginAsHome = !session && path === '/' && isStandalone
const isLanding = !session && path === '/' && !isStandalone
```

`useMediaQuery` (`src/hooks/useMediaQuery.js`) already handles this correctly —
`display-mode` is a valid media feature and needs no new code. Also handle the
iOS Safari case, where `navigator.standalone === true` and `display-mode` support
has historically been unreliable; OR the two together.

**Then make the landing actually work on a phone.** The breakpoints already exist
down to 480px in `landing.css` — they have simply never been reachable. Load it
at 375px and fix what's broken. Expect problems in at least:

- `.lp-pp` product preview (built for a 55/45 desktop split; stacks at 480px but
  has never been looked at on a real phone)
- `.lp-contrast-table` (two-column grid collapsing to one)
- the sticky nav at `padding: 0 20px` with three right-hand items

**Acceptance:**
- `curl`-equivalent at a 393px viewport renders `<h1>Stop guessing how your
  clients' week actually went.</h1>`, not "Sign in".
- Installing the PWA and launching from the home screen still opens the sign-in
  form when logged out.
- The landing is usable and unbroken at 375px with no horizontal scroll.

---

## Phase 2 — Analytics (P0), with a hard compliance constraint

You cannot currently answer "did anyone visit, and did they sign up." Nothing in
the codebase measures behavior; Sentry only measures errors.

**The constraint, stated first because it governs the implementation.** Gardnr is
a consumer health app bound by the FTC Health Breach Notification Rule and
Washington's My Health My Data Act. Sending health-adjacent page paths
(`/log`, `/client/:id`, the dashboard) to a third-party analytics vendor is the
exact fact pattern behind the FTC's GoodRx and BetterHelp enforcement actions.
Therefore:

- **Same-origin only.** Use **Vercel Web Analytics** (`@vercel/analytics`). Its
  script and beacon are proxied through `/_vercel/insights` on your own origin,
  so no data goes to a third-party host and **no CSP change is required** —
  `script-src 'self'` and `connect-src 'self'` already cover it. Confirm this at
  runtime; if the CSP blocks it, fix the CSP rather than switching to a
  third-party host.
- **Marketing routes only.** Mount `<Analytics />` **inside the `Landing`
  component**, not in `App.jsx` and not in `index.html`. It must never mount on an
  authenticated route. Do not use `@vercel/speed-insights` app-wide for the same
  reason.
- **No identifiers.** No user IDs, no emails, no `beforeSend` enrichment. Cookieless.

**Instrument exactly three events**, via `track()` from `@vercel/analytics`:

| Event | Fires when |
|---|---|
| `landing_view` | Landing mounts |
| `cta_click` | Any "start trial" CTA is clicked; include a `location` prop (`nav` / `hero` / `pricing` / `trial` / `final`) |
| `signup_started` | `/login?mode=signup&role=coach` mounts with those params |

That gives the landing → CTA → signup funnel, which is the only funnel that
matters right now.

**Also update `src/pages/Privacy.jsx`** to disclose first-party, cookieless
analytics on marketing pages. Flag to Jordan when done — he owns that copy.

---

## Phase 3 — Crawlability and payload

**3a. `robots.txt` and `sitemap.xml` return HTML.** Both currently 200 with
`<!doctype html>`, because the catch-all rewrite in `vercel.json`
(`/(.*)` → `/index.html`) swallows them — the files simply don't exist.

Add `public/robots.txt` and `public/sitemap.xml`. Vercel checks the filesystem
*before* applying `rewrites`, so this alone should be sufficient — **verify with a
real request against a preview deployment** rather than assuming. If they still
resolve to HTML, add explicit exclusions to the rewrite source pattern.

`sitemap.xml` should list `/`, `/terms`, `/privacy`, `/health-data-privacy`.
Nothing behind auth.

**3b. Canonical + structured data.** In `index.html`:
- Add `<link rel="canonical">`. Note the live site serves from `www.gardnr.fit`
  while the OG tags say `https://gardnr.fit` — pick one, make the other 308 to it,
  and make the canonical, the OG `url`, and the sitemap all agree.
- Add a `SoftwareApplication` JSON-LD block (`applicationCategory: HealthApplication`,
  `offers` at 19 USD/month). Take the name and description from
  `landingContent.js` → `meta`; do not write new prose.
- Update `<title>` and `<meta name="description">` from `landingContent.js` → `meta`.

**3c. The 1,580 KB bundle.** Confirmed decoded size of the single
`index-*.js` chunk on the live CDN. A visitor reading marketing copy downloads
the coach dashboard, the charts, and every route first.

- Route-split every page in `App.jsx` with `React.lazy` + `<Suspense>`. `Landing`
  should be the *only* eagerly-imported route.
- Add `manualChunks` in `vite.config.js` to split `supabase-js` and the charting
  library out of the entry chunk.
- Run a bundle visualizer first and **report the top 5 modules by size before
  changing anything** — measure, then cut.
- Target: the landing route pulls **under 300 KB decoded**. Report the actual
  before/after number.

Note the constraint: `App.jsx` imports `supabase` at module scope and calls
`getSession()` before first render, so supabase-js will land in the initial chunk
regardless. That's acceptable. Don't contort the auth bootstrap to avoid it.

**3d. Fonts.** Two families are loaded via CSS `@import` — Inter in
`src/index.css:1`, DM Sans in `src/pages/landing.css:1`. A CSS `@import` is a
chained, render-blocking request: stylesheet → discover import → font CSS → font
file. There is no `preconnect`.

Move both to `<link>` tags in `index.html` with
`<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`. Then
propose dropping to one family — flag it rather than deciding unilaterally, since
it's a design call.

**3e. The splash gates the marketing page.** `index.html:90` enforces `MIN = 900`
ms before the splash can begin a 1.5s fade, and `App.jsx:234` only calls
`hideSplash()` once the session check resolves. A first-time visitor evaluating
whether to trust you gets a black screen with a pulsing logo, and LCP cannot beat
900ms by construction.

Skip the splash entirely when there is no session and we're not in a PWA. In the
`index.html` inline script, before showing it: if `display-mode` is not standalone
**and** no Supabase auth token exists in `localStorage` (any key matching
`sb-*-auth-token`), don't render the splash at all.

⚠️ Changing the inline script **changes its SHA-256 hash**, which is pinned in the
CSP `script-src` in `vercel.json`. Recompute both hashes and update `vercel.json`
in the same commit, or you will ship a page that refuses to boot.

---

## Phase 4 — ~~Accessibility of the product preview~~ SUPERSEDED BY PHASE 5

**Do not implement this phase.** The interactive preview is being deleted, not
fixed — see Phase 5. This section is retained only to record the defect and why
the clean axe run was not evidence of its absence.

The three client rows in `ProductPreview` (`Landing.jsx:145-158`) are bare `<div>`s
with `onMouseEnter` and `onClick`, no `tabindex`, no `role`. Verified on the live
DOM. This fails **WCAG 2.2 SC 2.1.1 Keyboard (Level A)** — the floor, not the
ceiling. axe-core did not catch it; keyboard traps in custom widgets are a known
axe blind spot, which is why the clean axe run isn't a defence.

Rebuild as a proper tablist: `role="tablist"` on the container, `role="tab"` +
`aria-selected` + `tabIndex` on each row, arrow-key navigation between tabs,
`role="tabpanel"` on the detail side with `aria-labelledby` pointing at the active
tab. Keep the hover-to-select behavior for mouse users — just don't let it be the
*only* way in.

Keep `prefers-reduced-motion` support intact; it's already correct.

Re-run `@axe-core/playwright` (already a dependency) and additionally verify by
tabbing through the page with no mouse.

---

## Phase 5 — Replace the fabricated product preview with the real product

**DECIDED: do this instead of Phase 4. Skip the tablist rebuild entirely.**

The hero mock renders a browser chrome labelled "gardnr.fit — Coach dashboard"
showing a UI that is not our UI. It has to go, for a reason bigger than taste:
`App.jsx` renders `CoachPaywall` *instead of* the app for any coach without a paid
status, and Checkout collects a card up front. **A coach cannot see a single real
screen of Gardnr without paying.** That makes the landing page the only place
anyone sees the actual product before handing over a card, and a fabricated mock
is the wrong thing to put in that slot.

Replacing it also deletes the Phase 4 accessibility problem rather than
engineering around it, plus ~110 lines and the fake `clients` array.

### What "real" means here

Demo **data** is fine and expected — "Maya Chen" does not need to be a real
person. What is being deleted is the fabricated **UI**. Every pixel of the new
hero image must come from the real app rendering the real coach dashboard.

🛑 **Do not stub data into the component, mock the dashboard, or screenshot
anything hand-built.** That is the fabricated preview again with extra steps. If
the capture is blocked, stop and flag it — do not work around it.

### `scripts/shoot.mjs` cannot do this today

Read it before you plan. It signs up a **solo** account (`scripts/shoot.mjs:31`)
and seeds no data. A coach account hits the paywall, and an empty coach dashboard
is not a hero image.

You need a **new** capture script that:

1. Stands up a coach account that can actually reach the dashboard (disable
   `BILLING_ENABLED` locally, or seed a `trialing` subscription row directly —
   do **not** change the production billing gate).
2. Seeds a roster of three linked clients with ~2 weeks of logged data, with
   deliberate variety: one on target, one drifting, one lapsed for several days.
   The fake mock's story was good — keep the story and make it true. There is a
   `test-data.sql` at the repo root; check whether it is the seeding path.
3. Captures the real rendered coach dashboard at `deviceScaleFactor: 2`.

### Serving it

- `.webp`, with explicit `width`/`height` so it costs no CLS. `loading="eager"`
  and `fetchpriority="high"` — hero image only, nothing else on the page.
- **Art-direct the crop; do not scale one image down.** A 1440px dashboard
  rendered at 375px is illegible. Use `<picture>` with two sources: a tight crop
  (the triage list plus one client's compliance row) below 768px, the full
  dashboard above it.
- `alt` comes from `landingContent.js` → `heroShot.alt`. Do not write your own.
- Keeping a subtle browser-chrome frame is fine — the "gardnr.fit — Coach
  dashboard" label is now honest.

### If the real dashboard doesn't hold up

It might look worse than the mock. If it does, **flag it back — do not quietly
reinstate the fake preview.** A real product that photographs badly is a product
problem to fix, not a marketing problem to paper over.

### Cleanup

Delete the `clients` array, the `ProductPreview` and `StatusBadge` components, and
the now-dead `.lp-pp-*` rules in `landing.css`.

---

## Phase 6 — New sections (markup only; all copy comes from `landingContent.js`)

Two new sections, in this page order:

1. **Pricing** (`id="pricing"`) — from `pricing`. Place it after `workflow`. Needs
   the price card, the `includes` list, the CTA, the card-required `note`, and the
   `soloLine` / `soloCta` pointing at `/login?mode=signup&role=solo`.
2. **FAQ** (`id="faq"`) — from `faq`. Place it after `trial`, before `finalCta`.
   Use `<details>`/`<summary>` for native keyboard and screen-reader behavior;
   `summary:focus-visible` is already styled in `index.css`.
   Add `FAQPage` JSON-LD generated from the same `faq` array — one source, so the
   structured data can never drift from the visible text.

Also in this phase:

- **Unify the CTA color.** `.lp-trial-cta` is blue (`#2563eb`, `landing.css:227`)
  while every other primary CTA is green (`#22c55e`). Green is the brand primary.
  Make every "start the trial" action green; the page should have exactly one
  primary-action color.
- **Nav links** now come from `nav.links` (`Workflow`, `Pricing`, `FAQ`) and are
  currently `display: none` below 768px (`landing.css:283`). With mobile visitors
  now actually seeing this page, they need somewhere to go — a simple anchor row
  or a disclosure menu.
- **Instruments** drops from twelve cards to three (`instruments.items`), with the
  remaining nine rendered as a compact `alsoIncluded` chip list beneath them.

---

## Out of scope — deliberately

**Do not change the billing gate.** `App.jsx:353-358` renders `CoachPaywall`
instead of the app for any coach without a paid status, and Checkout collects a
card up front. That is a real conversion wall, and it is a *product* decision that
Jordan is making with eyes open — card-gating filters for intent, and a solo
founder cannot support a flood of no-card tire-kickers. The landing now discloses
it honestly (`hero.ctaNote`, `pricing.note`, `trial.note`, `faq`) and shows the
real product (Phase 5) so the decision is informed. Revisit once analytics has
data. Do not touch `create-checkout-session`.
