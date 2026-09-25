// Visual QA: sign up a throwaway account and screenshot real pages at phone +
// desktop widths (incl. a scrolled Log page to expose any sticky-nav
// bleed-through), then delete the account. Usage: node scripts/shoot.mjs [baseUrl]
//
// LOCAL ONLY, enforced below. This script creates a real account, and since
// delete-account was hardened it can no longer remove one from a live project:
// deletion requires a step-up code emailed to the account's own address, and
// the throwaway address is @example.com, a reserved domain that can never
// receive mail. Against production the cleanup returns 403 and the account
// stays. That is not a bug to fix in the flow — no code can read a mailbox
// that does not exist — so the tool is local-only and says so by refusing.
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const BASE = process.argv[2] || 'http://localhost:5181'
const OUT = '/tmp/shots'
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(BASE)) {
  console.error(`Refusing to run against ${BASE}.

This harness signs up a real account and cleans it up with the local stack's
service-role key. Against a live project it has neither that key nor any way
to pass delete-account's step-up check, so it would leave an orphaned user
behind — which is exactly what happened the one time it was pointed at prod.

To screenshot a deployed build, sign in as a real account instead.`)
  process.exit(1)
}

// Admin credentials come from the running stack, not from .env.
//
// They used to be read from .env/.env.local with vite's precedence mirrored by
// hand, and that was the footgun: the app under test and the cleanup could end
// up pointed at two DIFFERENT projects, so the delete fired somewhere the
// account had never been created. Asking the CLI removes the guess — there is
// one local stack, and this is it.
function localStack() {
  try {
    const raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const s = JSON.parse(raw)
    if (!s.API_URL || !s.SERVICE_ROLE_KEY) return null
    return { url: s.API_URL, key: s.SERVICE_ROLE_KEY }
  } catch { return null }
}

// Delete every throwaway this harness has ever left behind, not just this
// run's. Cleanup had been failing silently for long enough to accumulate nine
// of them, so removing only the newest would leave the pile in place.
async function purgeThrowaways(stack) {
  const h = { apikey: stack.key, Authorization: `Bearer ${stack.key}` }
  const res = await fetch(`${stack.url}/rest/v1/profiles?email=like.shoot-*&select=id,email`, { headers: h })
  if (!res.ok) { console.log('cleanup: could not list throwaways:', res.status); return }
  const rows = await res.json()
  let gone = 0
  for (const r of rows) {
    const d = await fetch(`${stack.url}/auth/v1/admin/users/${r.id}`, { method: 'DELETE', headers: h })
    if (d.ok) gone++
    else console.log(`  could not delete ${r.email}: ${d.status}`)
  }
  console.log(`cleanup: removed ${gone}/${rows.length} throwaway account(s)`)
}

const email = `shoot-${Math.random().toString(36).slice(2, 8)}@example.com`
const password = 'Test!Passw0rd123'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

// Wait out the cold-start splash before every shot.
//
// index.html holds it for a MIN of 900ms, then fades it over 1600ms before
// removing it — so for ~2.5s after load it covers the page completely. The
// waits below are all `waitForSelector` on page content, which resolves the
// instant the element is attached and visible UNDERNEATH the splash. Every
// desktop shot this harness produced was therefore a photograph of the
// loading screen, which is a silent failure: the files are there, they are
// the right size, and they contain no product.
//
// Lives inside shot() rather than at each call site so a shot added later
// cannot forget it.
async function settle() {
  await page.waitForFunction(() => {
    const s = document.getElementById('splash')
    return !s || s.hidden || getComputedStyle(s).opacity === '0'
  }, null, { timeout: 15000 }).catch(() => console.log('  (splash never cleared)'))
}

async function shot(name) {
  await settle()
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot', name)
}

// --- logged-out home on mobile: the sign-in form is the landing page ---
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Sign in', { timeout: 10000 })
await shot('m-login-home')

// --- sign up (solo) ---
await page.goto(`${BASE}/login?mode=signup&role=solo`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('Full name').fill('Shoot Tester')
await page.getByPlaceholder('Email').fill(email)
await page.getByPlaceholder('Password').fill(password)
// The 18+/ToS confirmation is required before the form will submit.
const consent = page.locator('input[type=checkbox]')
if (await consent.count()) await consent.first().check().catch(() => {})
await page.getByRole('button', { name: 'Create account' }).click()

// Signup lands on Onboarding, not the dashboard. Skip it — these shots are for
// visual QA of the steady state, not the first-run questionnaire. (Waiting
// straight for "Today's stats" here is what used to hang this script.)
await page.waitForTimeout(2500)
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
const skipOnboarding = page.getByText('Skip for now')
if (await skipOnboarding.count()) {
  await skipOnboarding.first().click()
  await page.waitForTimeout(2000)
  // Skipping drops you on /log, so come back to the dashboard.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
}
await page.waitForSelector('text=Today\'s stats', { timeout: 20000 })

// --- mobile shots ---
await page.waitForTimeout(500)
await shot('m-dashboard')
// Shorter viewport (like a real phone with Safari chrome) so the page scrolls,
// to prove scrolled content sits behind the opaque bar, not bleeding through.
await page.setViewportSize({ width: 390, height: 600 })
await page.waitForTimeout(200)
await page.mouse.move(200, 300)
await page.mouse.wheel(0, 260)
await page.waitForFunction(() => window.scrollY > 120, { timeout: 3000 }).catch(() => {})
await page.waitForTimeout(300)
console.log('scrollY =', await page.evaluate(() => window.scrollY))
await shot('m-dash-scrolled')
await page.setViewportSize({ width: 390, height: 844 })
await page.evaluate(() => window.scrollTo(0, 0))
await page.goto(`${BASE}/log`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Daily Log')
await shot('m-log-top')
await page.evaluate(() => window.scrollTo(0, 320))
await page.waitForTimeout(400)
await shot('m-log-scrolled')
// Profile tab — reached via the bottom tab bar; carries the mobile sign-out.
await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await shot('m-profile-top')
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(400)
await shot('m-profile-bottom')

// --- desktop shots (resize same page so nav media query flips) ---
await page.setViewportSize({ width: 1366, height: 900 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Today\'s stats')
await shot('d-dashboard')
await page.goto(`${BASE}/log`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=Daily Log')
await page.evaluate(() => window.scrollTo(0, 300))
await page.waitForTimeout(400)
await shot('d-log-scrolled')

// --- cleanup: delete the throwaway account(s) ---
const stack = localStack()
if (stack) {
  await purgeThrowaways(stack)
} else {
  console.log(`WARN: local Supabase stack not reachable, ${email} NOT deleted.`)
  console.log('      Start it with `supabase start`, then re-run to sweep leftovers.')
}

await browser.close()
console.log('done ->', OUT)
