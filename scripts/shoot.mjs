// Visual QA: sign up a throwaway account and screenshot real pages at phone +
// desktop widths (incl. a scrolled Log page to expose any sticky-nav
// bleed-through), then delete the account. Usage: node scripts/shoot.mjs [baseUrl]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5181'
const OUT = '/tmp/shots'
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })

function readEnv(name) {
  try {
    return Object.fromEntries(
      readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
        .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => {
          const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
        }))
  } catch { return {} }
}
// Mirror vite's precedence: .env.local overrides .env. Without this the APP
// talks to the local stack (via .env.local) while the cleanup below fired an
// authenticated delete at whatever .env names — i.e. PRODUCTION — using a local
// token. That returned 500 rather than deleting anything, but a throwaway-account
// cleanup should never be aimed at prod by accident.
const env = { ...readEnv('.env'), ...readEnv('.env.local') }
const SUPA = env.VITE_SUPABASE_URL
const email = `shoot-${Math.random().toString(36).slice(2, 8)}@example.com`
const password = 'Test!Passw0rd123'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

async function shot(name) { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }

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

// --- cleanup: delete the throwaway account ---
const token = await page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
      try { return JSON.parse(localStorage.getItem(k)).access_token } catch { /* */ }
    }
  }
  return null
})
if (token) {
  const r = await fetch(`${SUPA}/functions/v1/delete-account`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  console.log('cleanup delete-account:', r.status)
  if (!r.ok) console.log(`  ^ not deleted: ${email}. Against the default local stack this is expected — npm run rls:setup excludes edge-runtime/functions, so there is no delete-account to call. Harmless on the fake DB.`)
} else {
  console.log('WARN: no token found, account NOT deleted:', email)
}

await browser.close()
console.log('done ->', OUT)
