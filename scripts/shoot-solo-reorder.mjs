// Verify drag-to-reorder on the SOLO-PREMIUM dashboard: a throwaway solo user
// gets an active solo subscription injected (→ hasSoloPremium) + seed data, then
// we check the grips render, a drag persists to profiles.layout.dashboard.
// Run: SK=<service_role key> node scripts/shoot-solo-reorder.mjs [baseUrl]
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5181'
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true })
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const SUPA = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SOLO_PRICE = env.VITE_STRIPE_SOLO_PRICE_ID
const SK = process.env.SK; if (!SK) { console.error('Missing SK'); process.exit(1) }
const sh = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }
const rid = Math.random().toString(36).slice(2, 7), PW = 'Test!Passw0rd123', ymd = d => d.toISOString().slice(0, 10)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const session = () => p.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('sb-') && k.endsWith('-auth-token')) { try { const s = JSON.parse(localStorage.getItem(k)); return { id: s.user.id, token: s.access_token } } catch { /* */ } } } return null })

let U = null
try {
  await p.goto(`${BASE}/login?mode=signup&role=solo`, { waitUntil: 'networkidle' })
  await p.getByPlaceholder('Full name').fill('QA Solo')
  await p.getByPlaceholder('Email').fill(`qa-solo-${rid}@example.com`)
  await p.getByPlaceholder('Password').fill(PW)
  await p.getByRole('button', { name: 'Create account' }).click()
  for (let i = 0; i < 30; i++) { U = await session(); if (U?.id) break; await p.waitForTimeout(500) }
  const asUser = { apikey: ANON, Authorization: `Bearer ${U.token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
  const future = new Date(Date.now() + 25 * 864e5).toISOString()
  await fetch(`${SUPA}/rest/v1/subscriptions`, { method: 'POST', headers: { ...sh, Prefer: 'return=minimal' }, body: JSON.stringify({ solo_id: U.id, status: 'active', current_period_end: future, stripe_price_id: SOLO_PRICE }) }).then(r => console.log('sub', r.status))
  await fetch(`${SUPA}/rest/v1/targets?on_conflict=user_id`, { method: 'POST', headers: { ...asUser, Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ user_id: U.id, calories: 2000 }) }).then(r => console.log('target', r.status))
  const nut = [], wt = []
  for (let i = 0; i <= 20; i++) { const d = new Date(); d.setDate(d.getDate() - i); nut.push({ user_id: U.id, logged_date: ymd(d), food: 't', calories: 2000, protein: 150, carbs: 200, fat: 60, serving_size: 1, serving_unit: 'day' }); wt.push({ user_id: U.id, logged_date: ymd(d), weight: Math.round((182 + i * 0.1) * 10) / 10, unit: 'lbs', weighed_at: '08:00:00' }) }
  await fetch(`${SUPA}/rest/v1/nutrition_log`, { method: 'POST', headers: asUser, body: JSON.stringify(nut) }).then(r => console.log('nut', r.status))
  await fetch(`${SUPA}/rest/v1/weight_log`, { method: 'POST', headers: asUser, body: JSON.stringify(wt) }).then(r => console.log('wt', r.status))

  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2200)
  const grips = await p.locator('[aria-label="Drag to reorder"]').count()
  console.log('grips on solo dashboard:', grips)
  if (grips > 0) {
    const grip = p.locator('[aria-label="Drag to reorder"]').first()
    await grip.scrollIntoViewIfNeeded(); await p.waitForTimeout(300)
    await grip.locator('xpath=..').screenshot({ path: `${OUT}/solo-reorder-grip.png` }); console.log('shot solo-reorder-grip')
    const box = await grip.boundingBox()
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down()
    await p.mouse.move(box.x, box.y + 120, { steps: 8 }); await p.mouse.move(box.x, box.y + 360, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(1200)
    const after = await fetch(`${SUPA}/rest/v1/profiles?id=eq.${U.id}&select=layout`, { headers: sh }).then(r => r.json())
    console.log('solo layout after drag:', JSON.stringify(after[0]?.layout))
  }
} finally {
  if (U?.token) await fetch(`${SUPA}/functions/v1/delete-account`, { method: 'POST', headers: { Authorization: `Bearer ${U.token}`, 'Content-Type': 'application/json' } }).then(r => console.log('deleted', r.status))
  await browser.close()
}
