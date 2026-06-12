import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const BASE = process.argv[2] || 'http://localhost:5181'
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
for (const [name, w, h] of [['landing-desktop', 1440, 900], ['landing-tablet', 820, 1180], ['landing-mobile', 390, 1500]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
  await p.screenshot({ path: `${OUT}/${name}.png` })
  await ctx.close(); console.log('shot', name)
}
await browser.close()
