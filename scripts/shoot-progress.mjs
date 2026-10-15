// Visual QA for the client's My Progress page (src/pages/Dashboard.jsx).
//
// Signs in as the seeded model client — Nora Vance, 90 days of nutrition,
// weight, cardio, steps and measurements behind her — and shoots the page at
// desktop and phone widths in both themes, full height.
//
// Full height is the point. This page's problem is structural (the same metric
// rendered in three separate panels), and a viewport-sized screenshot cannot
// show that. The script prints the rendered page height so the before/after is
// measured rather than argued.
//
// Seed first:  node scripts/seed-model-client.mjs
// Run:         node scripts/shoot-progress.mjs [baseUrl]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { requireLocal, settle } from './shootkit.mjs'

const BASE = process.argv[2] || 'http://localhost:5181'
const OUT = process.env.OUT || '/tmp/progress-shots'
mkdirSync(OUT, { recursive: true })

requireLocal(BASE)

const CLIENT = { email: 'demo.nora@gardnr.test', password: 'Demo!Passw0rd123' }

const browser = await chromium.launch()

async function pass(label, viewport, theme, isMobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile, hasTouch: isMobile })
  const page = await ctx.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.evaluate((t) => localStorage.setItem('gardnr-theme', t), theme)
  await page.getByPlaceholder('Email').fill(CLIENT.email)
  await page.getByPlaceholder('Password').fill(CLIENT.password)
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
  await page.waitForTimeout(4000)

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  // settle() clears the cold-start splash, which otherwise covers the page for
  // ~2.5s and silently yields a screenshot of the loading screen.
  await settle(page)
  // Park the pointer off-page so nothing renders in a hover state.
  await page.mouse.move(2, 2)
  await page.waitForTimeout(2500)

  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true })

  // The structural measurements the design doc asks for: page height, and the
  // count of bordered non-control surfaces.
  const m = await page.evaluate(() => {
    const surfaces = [...document.querySelectorAll('main *, [class*=page] *')].filter((el) => {
      if (el.closest('button, input, select, textarea, [role=dialog]')) return false
      const s = getComputedStyle(el)
      return parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none'
    })
    return {
      height: Math.round(document.documentElement.scrollHeight),
      surfaces: surfaces.length,
      headings: [...document.querySelectorAll('h1, h2, h3')].map((h) => h.textContent.trim()).filter(Boolean),
    }
  })
  console.log(`shot ${label}  ${m.height}px  ${m.surfaces} bordered surfaces`)
  console.log(`     sections: ${m.headings.join(' | ')}`)

  // The two behaviours a full-page screenshot cannot show.
  if (!isMobile) {
    // 1. A Trends row opens its chart. One row at a time — the accordion-all
    //    this panel replaced is what made the page 4,000px.
    const row = page.locator('.trend-rowbtn').first()
    if (await row.count()) {
      await row.click()
      await page.waitForTimeout(1200)
      await page.screenshot({ path: `${OUT}/${label}-chart-open.png`, fullPage: true })
      const open = await page.locator('.trend-chart').count()
      console.log(`     chart disclosure: ${open} open (expect 1)`)
      await row.click()
      await page.waitForTimeout(400)
    } else {
      console.log('     !! no .trend-rowbtn found')
    }

    // 2. Stepping off today must rename the Today panel. It used to say
    //    "Today's stats" over a past day's numbers.
    const prev = page.getByRole('button', { name: 'Previous day' })
    if (await prev.count()) {
      await prev.click()
      await page.waitForTimeout(1500)
      const heading = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h2')].map((x) => x.textContent.trim())
        return h.find((t) => t && !/check-in|Trends|Coaching/i.test(t)) || '(none)'
      })
      console.log(`     heading after stepping back a day: "${heading}"`)
      await page.screenshot({ path: `${OUT}/${label}-prevday.png`, fullPage: true })
    }
  }

  await ctx.close()
  return m
}

await pass('desktop-dark', { width: 1440, height: 1000 }, 'dark', false)
await pass('desktop-light', { width: 1440, height: 1000 }, 'light', false)
await pass('phone-dark', { width: 390, height: 844 }, 'dark', true)
await pass('phone-light', { width: 390, height: 844 }, 'light', true)

await browser.close()
console.log(`\n${OUT}`)
