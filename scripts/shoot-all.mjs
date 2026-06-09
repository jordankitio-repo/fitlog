// Full visual QA: auth pages, solo profile, coach paywall+dashboard, client view.
// Coach/client screens need a paid coach, so a throwaway coach gets a trialing
// subscriptions row injected via the service-role key (SK env), and a throwaway
// client gets linked via coach_clients. Everything is deleted at the end.
//
// Run: SK=$(supabase projects api-keys --project-ref <ref> | awk -F'|' '/service_role/{gsub(/[[:space:]]/,"",$2);print $2}') \
//      node scripts/shoot-all.mjs [baseUrl]
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5181'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const SUPA = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const PRICE = env.VITE_STRIPE_FOUNDING_PRICE_ID
const SK = process.env.SK
if (!SK) { console.error('Missing SK env (service role key)'); process.exit(1) }
const sh = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }
const rid = Math.random().toString(36).slice(2, 7)
const PW = 'Test!Passw0rd123'

const browser = await chromium.launch()
const M = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const shoot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name) }
const session = (page) => page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('sb-') && k.endsWith('-auth-token')) { try { const s = JSON.parse(localStorage.getItem(k)); return { id: s.user.id, token: s.access_token } } catch { /* */ } } }
  return null
})
async function signup(page, role, tag = role) {
  await page.goto(`${BASE}/login?mode=signup&role=${role}`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Full name').fill(`QA ${tag}`)
  await page.getByPlaceholder('Email').fill(`qa-${tag}-${rid}@example.com`)
  await page.getByPlaceholder('Password').fill(PW)
  await page.getByRole('button', { name: 'Create account' }).click()
  for (let i = 0; i < 30; i++) { const s = await session(page); if (s?.id) return s; await page.waitForTimeout(500) }
  console.warn('signup: no session for', tag); return null
}
const del = async (u) => { if (!u?.token) return; const r = await fetch(`${SUPA}/functions/v1/delete-account`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' } }); console.log('deleted', u.id?.slice(0, 8), r.status) }

const accounts = []
try {
  // ---------- Auth pages (no account) ----------
  const ctx0 = await browser.newContext(M); const p0 = await ctx0.newPage()
  await p0.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await shoot(p0, 'auth-signin')
  await p0.goto(`${BASE}/login?mode=signup&role=coach`, { waitUntil: 'networkidle' }); await shoot(p0, 'auth-signup')
  await p0.goto(`${BASE}/reset-password`, { waitUntil: 'networkidle' }); await shoot(p0, 'auth-reset')
  // show a password field with the toggle revealed
  await p0.goto(`${BASE}/login?mode=signup`, { waitUntil: 'networkidle' })
  await p0.getByPlaceholder('Password').fill('hunter2example')
  await p0.getByRole('button', { name: 'Show password' }).click()
  await shoot(p0, 'auth-password-shown')
  await ctx0.close()

  // ---------- Solo ----------
  const ctxA = await browser.newContext(M); const pA = await ctxA.newPage()
  const A = await signup(pA, 'solo'); accounts.push(A)
  await pA.goto(`${BASE}/profile`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(800); await shoot(pA, 'solo-profile')

  // ---------- Coach ----------
  const ctxC = await browser.newContext(M); const pC = await ctxC.newPage()
  const C = await signup(pC, 'coach'); accounts.push(C)
  await pC.waitForTimeout(800); await shoot(pC, 'coach-paywall')
  // inject a trialing subscription so the coach clears the paywall
  const future = new Date(Date.now() + 25 * 864e5).toISOString()
  await fetch(`${SUPA}/rest/v1/subscriptions`, { method: 'POST', headers: { ...sh, Prefer: 'return=minimal' }, body: JSON.stringify({ coach_id: C.id, status: 'trialing', trial_end: future, current_period_end: future, stripe_price_id: PRICE }) }).then(r => console.log('sub inject', r.status))
  await pC.reload({ waitUntil: 'networkidle' })
  await pC.waitForSelector('text=Coach Dashboard', { timeout: 15000 })
  await shoot(pC, 'coach-dashboard-empty')

  // ---------- Client linked to coach ----------
  const ctxD = await browser.newContext(M); const pD = await ctxD.newPage()
  const D = await signup(pD, 'solo', 'client'); accounts.push(D)
  if (D?.id) {
    await fetch(`${SUPA}/rest/v1/profiles?id=eq.${D.id}`, { method: 'PATCH', headers: { ...sh, Prefer: 'return=minimal' }, body: JSON.stringify({ role: 'client', full_name: 'QA Client' }) })
    // Insert the link as the client (its own token) — the real app path (Join.jsx),
    // allowed by the client's RLS INSERT policy. service_role has no INSERT grant here.
    await fetch(`${SUPA}/rest/v1/coach_clients`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${D.token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ coach_id: C.id, client_id: D.id, status: 'active' }) }).then(r => console.log('link', r.status))

    // coach dashboard with a client + the client view (also validates coach->client RLS)
    await pC.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(1000); await shoot(pC, 'coach-dashboard')
    await pC.goto(`${BASE}/client/${D.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(1500); await shoot(pC, 'client-view-top')
    await pC.setViewportSize({ width: 1366, height: 900 })
    await pC.goto(`${BASE}/client/${D.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(1200); await shoot(pC, 'client-view-desktop')
    await pC.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(800); await shoot(pC, 'coach-dashboard-desktop')
  } else {
    console.warn('skipping client/coach-with-client shots (no client session)')
  }
} finally {
  // cleanup (delete client before coach)
  for (const u of accounts.reverse()) await del(u)
  await browser.close()
  console.log('done ->', OUT)
}
