// Visual QA for the ComplianceSummary addition. Seeds ~88 days of varied
// calorie data so the heatmap + new summary tiles actually render, in both
// contexts: (1) a Premium solo's own Dashboard, (2) a coach viewing a client.
// Throwaway accounts, deleted at the end.
//
// Run: SK=$(supabase projects api-keys --project-ref mlqaurxefttbqsrllbyj \
//        | awk -F'|' '/service_role/{gsub(/[[:space:]]/,"",$2);print $2}') \
//      node scripts/shoot-consistency.mjs [baseUrl]
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
const SOLO_PRICE = env.VITE_STRIPE_SOLO_PRICE_ID
const SK = process.env.SK
if (!SK) { console.error('Missing SK env (service role key)'); process.exit(1) }
const sh = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }
const rid = Math.random().toString(36).slice(2, 7)
const PW = 'Test!Passw0rd123'
const TARGET = 2200

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

// Insert ~88 days of nutrition + a target, using the user's own token (real app
// RLS path). Varied compliance: mostly on-target, some partial/under, some gaps.
async function seed(user) {
  const userHdr = { apikey: ANON, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  await fetch(`${SUPA}/rest/v1/targets`, { method: 'POST', headers: { ...userHdr, Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: user.id, calories: TARGET, protein: 165 }) }).then(r => console.log('target', r.status))

  const rows = []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  for (let d = 88; d >= 0; d--) {
    const date = new Date(today); date.setDate(today.getDate() - d)
    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const roll = (d * 37 + 11) % 100 // deterministic pseudo-random
    if (roll < 18) continue // ~18% no-log gaps
    let cal
    if (roll < 30) cal = Math.round(TARGET * 0.5)      // under (<60%)
    else if (roll < 48) cal = Math.round(TARGET * 0.75) // partial (60-89%)
    else cal = Math.round(TARGET * (0.92 + (roll % 10) * 0.012)) // on-target
    rows.push({ user_id: user.id, logged_date: ds, food: 'QA seed', calories: cal })
  }
  const r = await fetch(`${SUPA}/rest/v1/nutrition_log`, { method: 'POST', headers: userHdr, body: JSON.stringify(rows) })
  console.log('nutrition seed', r.status, rows.length, 'days')
}

// Scroll the consistency card into view by its heading/label, then settle.
async function focusConsistency(page, label) {
  await page.getByText(label, { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(500)
}

const accounts = []
try {
  // ---------- Solo Premium dashboard ----------
  const ctxA = await browser.newContext(M); const pA = await ctxA.newPage()
  const A = await signup(pA, 'solo'); accounts.push(A)
  const future = new Date(Date.now() + 25 * 864e5).toISOString()
  await fetch(`${SUPA}/rest/v1/subscriptions`, { method: 'POST', headers: { ...sh, Prefer: 'return=minimal' }, body: JSON.stringify({ solo_id: A.id, status: 'trialing', trial_end: future, current_period_end: future, stripe_price_id: SOLO_PRICE }) }).then(r => console.log('solo sub', r.status))
  await seed(A)
  await pA.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1200)
  await focusConsistency(pA, 'Logging consistency')
  await shoot(pA, 'cs-solo-mobile')
  await pA.setViewportSize({ width: 1366, height: 900 })
  await pA.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await pA.waitForTimeout(1200)
  await focusConsistency(pA, 'Logging consistency')
  await shoot(pA, 'cs-solo-desktop')

  // ---------- Coach viewing a seeded client ----------
  const ctxC = await browser.newContext(M); const pC = await ctxC.newPage()
  const C = await signup(pC, 'coach'); accounts.push(C)
  await fetch(`${SUPA}/rest/v1/subscriptions`, { method: 'POST', headers: { ...sh, Prefer: 'return=minimal' }, body: JSON.stringify({ coach_id: C.id, status: 'trialing', trial_end: future, current_period_end: future, stripe_price_id: PRICE }) }).then(r => console.log('coach sub', r.status))
  await pC.reload({ waitUntil: 'networkidle' })
  await pC.waitForSelector('text=Coach Dashboard', { timeout: 15000 })

  const ctxD = await browser.newContext(M); const pD = await ctxD.newPage()
  const D = await signup(pD, 'solo', 'client'); accounts.push(D)
  await fetch(`${SUPA}/rest/v1/profiles?id=eq.${D.id}`, { method: 'PATCH', headers: { ...sh, Prefer: 'return=minimal' }, body: JSON.stringify({ role: 'client', full_name: 'QA Client' }) })
  await fetch(`${SUPA}/rest/v1/coach_clients`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${D.token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ coach_id: C.id, client_id: D.id, status: 'active' }) }).then(r => console.log('link', r.status))
  await seed(D)

  await pC.goto(`${BASE}/client/${D.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(1500)
  await focusConsistency(pC, 'Calorie Compliance')
  await shoot(pC, 'cs-coach-mobile')
  await pC.setViewportSize({ width: 1366, height: 900 })
  await pC.goto(`${BASE}/client/${D.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(1500)
  await focusConsistency(pC, 'Calorie Compliance')
  await shoot(pC, 'cs-coach-desktop')
} finally {
  for (const u of accounts.reverse()) await del(u)
  await browser.close()
  console.log('done ->', OUT)
}
