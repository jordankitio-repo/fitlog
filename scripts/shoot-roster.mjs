// Screenshot the coach dashboard with the demo roster (run seed-demo-roster.mjs
// first, against the same Supabase the dev server points at).
//   node scripts/shoot-roster.mjs [baseUrl]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1120, height: 1100 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('Email').fill('demo.coach@gardnr.test')
await page.getByPlaceholder('Password').fill('Demo!Passw0rd123')
await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
await page.waitForSelector('text=Coach Dashboard', { timeout: 25000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/coach-roster.png`, fullPage: true })
console.log('shot ->', `${OUT}/coach-roster.png`)
await browser.close()
