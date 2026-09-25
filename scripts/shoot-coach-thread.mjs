// QA pass for the merged coach thread: sign in as the demo client (Maya, 26
// reports + a message exchange) and shoot /coach and /coach/reports at desktop
// and phone widths, in both themes.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:5181'
const OUT = '/tmp/coach-shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

async function pass(label, viewport, theme) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.evaluate((t) => localStorage.setItem('gardnr-theme', t), theme)
  await page.getByPlaceholder('Email').fill('maya@gardnr.demo')
  await page.getByPlaceholder('Password').fill('Demo!Passw0rd123')
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
  await page.waitForTimeout(4000)

  await page.goto(`${BASE}/coach`, { waitUntil: 'networkidle' })
  await page.mouse.move(2, 2)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/${label}-thread.png`, fullPage: true })
  console.log('shot', label, 'thread')

  // Hover the newest report card, to check the hover surface.
  const card = page.locator('.coach-report').last()
  if (await card.count()) {
    await card.scrollIntoViewIfNeeded()
    await card.hover()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/${label}-hover.png` })
    console.log('shot', label, 'hover')
  } else {
    console.log('!! no .coach-report on', label)
  }

  await page.goto(`${BASE}/coach/reports`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/${label}-archive.png`, fullPage: true })
  console.log('shot', label, 'archive')

  // And the reader. Scoped to the dialog: the rail behind it holds the same
  // rows, and an unscoped .rep-row resolves to one under the backdrop.
  const row = page.locator('[role=dialog] .rep-row').first()
  if (await row.count()) {
    await row.click()
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `${OUT}/${label}-reader.png` })
    const back = page.locator('.rep-reader a').first()
    if (await back.count()) { await back.click(); await page.waitForTimeout(1500) }
    console.log('after back:', page.url())
  }
  await ctx.close()
}

await pass('w-light', { width: 1700, height: 1000 }, 'light')
await pass('w-dark', { width: 1700, height: 1000 }, 'dark')
await pass('d-light', { width: 1280, height: 900 }, 'light')
await pass('d-dark', { width: 1280, height: 900 }, 'dark')
await pass('m-light', { width: 390, height: 844 }, 'light')
await browser.close()
