// Create a throwaway coach + invitation on the linked Supabase, then screenshot
// the invited-client Join page (desktop + mobile), then delete the account.
//   node scripts/shoot-join.mjs [baseUrl]
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }))
const SUPA = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY
const email = `dbg-coach-${Math.random().toString(36).slice(2, 8)}@example.com`
const H = (tok) => ({ 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${tok}` })

const su = await (await fetch(`${SUPA}/auth/v1/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ email, password: 'Test!Passw0rd123' }) })).json()
const token = su.access_token, uid = su.user?.id || su.id
await fetch(`${SUPA}/rest/v1/profiles?id=eq.${uid}`, { method: 'PATCH', headers: { ...H(token), Prefer: 'return=representation' }, body: JSON.stringify({ role: 'coach', full_name: 'Coach Riley' }) })
const inv = await (await fetch(`${SUPA}/rest/v1/invitations`, { method: 'POST', headers: { ...H(token), Prefer: 'return=representation' }, body: JSON.stringify({ coach_id: uid, client_email: `client-${Math.random().toString(36).slice(2, 7)}@example.com`, account_exists: false }) })).json()
const inviteToken = inv[0]?.token
console.log('invite token:', inviteToken)

const browser = await chromium.launch()
for (const [name, vw] of [['join-desktop', { width: 900, height: 1000 }], ['join-mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vw, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/join?token=${inviteToken}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500) // let invite-info resolve the coach name
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot', name)
  await ctx.close()
}
await browser.close()

try { await fetch(`${SUPA}/functions/v1/delete-account`, { method: 'POST', headers: H(token), body: '{}' }) } catch { /* ignore */ }
console.log('cleaned up')
