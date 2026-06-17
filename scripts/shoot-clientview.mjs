// Login as the demo coach and screenshot a client's full record (ClientView)
// at desktop + mobile. Needs the local seeded stack + dev server.
//   node scripts/shoot-clientview.mjs [baseUrl]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
for (const [name, vw] of [['cv-desktop', { width: 1480, height: 1400 }], ['cv-mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vw, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Email').fill('demo.coach@gardnr.test')
  await page.getByPlaceholder('Password').fill('Demo!Passw0rd123')
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
  await page.waitForSelector('text=Coach Dashboard', { timeout: 25000 })
  await page.waitForTimeout(1000)
  // Open the first client with data (Ava — on track)
  const link = page.getByRole('button', { name: /view data/i }).first()
  await link.click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log('shot', name)
  await ctx.close()
}
await browser.close()
console.log('done')
