// Mobile pass: log in as the demo coach and screenshot the roster + a client
// record + the open chat bubble at phone width. Run seed-demo-roster.mjs first.
//   node scripts/shoot-mobile-coach.mjs [baseUrl]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = '/tmp/shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.getByPlaceholder('Email').fill('demo.coach@gardnr.test')
await page.getByPlaceholder('Password').fill('Demo!Passw0rd123')
await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
await page.waitForSelector('text=Coach Dashboard', { timeout: 25000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${OUT}/mc-roster.png`, fullPage: true })
console.log('shot mc-roster')

// Drill into the first client record.
const view = page.getByRole('button', { name: /view data|view|open/i }).first()
if (await view.count()) {
  await view.click()
} else {
  // Fallback: a link/card to a client
  await page.locator('a[href^="/client/"]').first().click()
}
await page.waitForTimeout(2000)
await page.screenshot({ path: `${OUT}/mc-client-top.png` })
console.log('shot mc-client-top (viewport)')
await page.screenshot({ path: `${OUT}/mc-client-full.png`, fullPage: true })
console.log('shot mc-client-full')

// Open the chat bubble (launcher bottom-right) to check overlap.
const launcher = page.locator('button[aria-label="Open messages"]')
if (await launcher.count()) {
  await launcher.click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/mc-client-chat.png` })
  console.log('shot mc-client-chat')
} else {
  console.log('no chat launcher found')
}

await browser.close()
