// Rhythm-pass baseline: fresh solo signup, screenshot the chrome-heavy app
// pages at desktop width, then delete the account.
//   node scripts/shoot-rhythm.mjs [baseUrl]
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

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1180, height: 1200 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const email = `rhythm-${Math.random().toString(36).slice(2, 8)}@example.com`

await page.goto(`${BASE}/login?mode=signup&role=solo`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('Full name').fill('Rhythm Tester')
await page.getByPlaceholder('Email').fill(email)
await page.getByPlaceholder(/password/i).first().fill('Test!Passw0rd123')
await page.getByRole('button', { name: /sign up|create account|continue/i }).first().click()
await page.waitForTimeout(3500)

for (const [path, name] of [['/profile', 'r-profile'], ['/', 'r-dashboard'], ['/log', 'r-log']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('shot', name)
}

try {
  // delete the throwaway account from Profile
  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
} catch { /* ignore */ }
await browser.close()
console.log('done')
