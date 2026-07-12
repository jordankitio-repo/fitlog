import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { hero } from '../src/pages/landingContent.js'
const BASE = process.argv[2] || 'http://localhost:5181'
const OUT = '/tmp/shots'; mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
for (const [name, w, h] of [['landing-desktop', 1440, 900], ['landing-tablet', 768, 1180], ['landing-mobile', 375, 1500]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  if (await p.locator('#splash').count()) throw new Error(`${name} rendered the app splash`)
  await p.waitForTimeout(900)
  await p.getByRole('heading', { level: 1, name: hero.h1 }).waitFor()
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (overflow > 0) throw new Error(`${name} has ${overflow}px horizontal overflow`)
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  await ctx.close(); console.log('shot', name)
}

const standalone = await browser.newContext({ viewport: { width: 375, height: 812 } })
await standalone.addInitScript(() => {
  Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })
})
const standalonePage = await standalone.newPage()
await standalonePage.goto(`${BASE}/`, { waitUntil: 'networkidle' })
await standalonePage.getByRole('heading', { level: 1, name: 'Sign in' }).waitFor()
await standalone.close()
console.log('verified standalone login')
await browser.close()
