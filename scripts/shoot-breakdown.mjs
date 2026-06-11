// Visual QA for the weekday-vs-weekend ComplianceBreakdown viz. Creates a
// throwaway coach (injected trialing sub) + client, seeds the client with 6
// weeks of nutrition (weekdays on target, weekends ~900 over), then screenshots
// the coach's client view. Everything is deleted at the end.
//
// Run: SK=<service_role key> node scripts/shoot-breakdown.mjs [baseUrl]
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
  return null
}
const del = async (u) => { if (!u?.token) return; const r = await fetch(`${SUPA}/functions/v1/delete-account`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}`, 'Content-Type': 'application/json' } }); console.log('deleted', u.id?.slice(0, 8), r.status) }
const ymd = (d) => d.toISOString().slice(0, 10)

const accounts = []
try {
  const ctxC = await browser.newContext({ viewport: { width: 1366, height: 1000 }, deviceScaleFactor: 2 }); const pC = await ctxC.newPage()
  const C = await signup(pC, 'coach'); accounts.push(C)
  const future = new Date(Date.now() + 25 * 864e5).toISOString()
  await fetch(`${SUPA}/rest/v1/subscriptions`, { method: 'POST', headers: { ...sh, Prefer: 'return=minimal' }, body: JSON.stringify({ coach_id: C.id, status: 'trialing', trial_end: future, current_period_end: future, stripe_price_id: PRICE }) }).then(r => console.log('sub', r.status))

  const ctxD = await browser.newContext(M); const pD = await ctxD.newPage()
  const D = await signup(pD, 'solo', 'client'); accounts.push(D)
  const asClient = { apikey: ANON, Authorization: `Bearer ${D.token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  await fetch(`${SUPA}/rest/v1/profiles?id=eq.${D.id}`, { method: 'PATCH', headers: { ...sh, Prefer: 'return=minimal' }, body: JSON.stringify({ role: 'client', full_name: 'QA Client' }) })
  await fetch(`${SUPA}/rest/v1/coach_clients`, { method: 'POST', headers: asClient, body: JSON.stringify({ coach_id: C.id, client_id: D.id, status: 'active' }) }).then(r => console.log('link', r.status))

  // target + 6 weeks of nutrition (weekday 2000 = on target, weekend 2900 = +900)
  await fetch(`${SUPA}/rest/v1/targets?on_conflict=user_id`, { method: 'POST', headers: { ...asClient, Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ user_id: D.id, calories: 2000, weight_goal: 175, weight_goal_unit: 'lbs' }) }).then(r => console.log('target', r.status))
  const rows = []
  for (let i = 0; i <= 44; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const weekend = d.getDay() === 0 || d.getDay() === 6
    const cal = weekend ? (Number(process.env.WK) || 2900) : (Number(process.env.BASE) || 2000)
    rows.push({ user_id: D.id, logged_date: ymd(d), food: 'Test day total', calories: cal, protein: 150, carbs: Math.round(cal * 0.45 / 4), fat: Math.round(cal * 0.3 / 9), serving_size: 1, serving_unit: 'day' })
  }
  await fetch(`${SUPA}/rest/v1/nutrition_log`, { method: 'POST', headers: asClient, body: JSON.stringify(rows) }).then(r => console.log('nutrition', r.status, rows.length, 'rows'))

  // 45 days of weight, declining 186 → 182 lb with mild wobble (so the band has
  // realistic, non-zero width for the Energy Balance Read).
  const wrows = []
  for (let i = 0; i <= 44; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const base = 182 + (i / 44) * 4
    const wobble = (((i * 3) % 5) - 2) * 0.3
    wrows.push({ user_id: D.id, logged_date: ymd(d), weight: Math.round((base + wobble) * 10) / 10, unit: 'lbs', weighed_at: '08:00:00' })
  }
  await fetch(`${SUPA}/rest/v1/weight_log`, { method: 'POST', headers: asClient, body: JSON.stringify(wrows) }).then(r => console.log('weight', r.status, wrows.length, 'rows'))

  await pC.goto(`${BASE}/client/${D.id}`, { waitUntil: 'networkidle' }); await pC.waitForTimeout(1800)
  // Tight shot of just the breakdown panel (root = grandparent of the heading <p>).
  const panel = pC.getByText('Weekday vs weekend', { exact: true }).locator('xpath=../..')
  await panel.scrollIntoViewIfNeeded(); await pC.waitForTimeout(300)
  await panel.screenshot({ path: `${OUT}/breakdown-panel.png` }); console.log('shot breakdown-panel')
  // Also the whole compliance section for context.
  const section = pC.getByText('Calorie Compliance - Last 90 Days', { exact: true }).locator('xpath=..')
  await section.screenshot({ path: `${OUT}/breakdown-section.png` }); console.log('shot breakdown-section')
  // The Progress overview chart (calorie % bars + target line) — the chart canvas.
  const prog = pC.locator('canvas').first()
  await prog.scrollIntoViewIfNeeded(); await pC.waitForTimeout(500)
  await prog.screenshot({ path: `${OUT}/progress-chart.png` }); console.log('shot progress-chart')
  // Expand "Calories — last 30 days" and shoot its (raw calorie) chart.
  await pC.getByText('Calories — last 30 days', { exact: true }).click()
  await pC.waitForTimeout(600)
  const calChart = pC.locator('canvas').nth(1)
  await calChart.scrollIntoViewIfNeeded(); await pC.waitForTimeout(400)
  await calChart.screenshot({ path: `${OUT}/calorie-chart.png` }); console.log('shot calorie-chart')
  // Energy Balance Read panel (under the Progress overview chart).
  const ebr = pC.getByText('Energy balance read', { exact: true }).locator('xpath=../..')
  await ebr.scrollIntoViewIfNeeded(); await pC.waitForTimeout(400)
  await ebr.screenshot({ path: `${OUT}/energy-balance.png` }); console.log('shot energy-balance')
} finally {
  for (const u of accounts.reverse()) await del(u)
  await browser.close()
  console.log('done ->', OUT)
}
