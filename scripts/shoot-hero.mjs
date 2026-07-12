// Capture the frames behind the landing-page hero tour.
//
// Every frame is a photograph of the running app — no mocks. The hero this
// replaced was a hand-drawn dashboard with a "Review and send" button that did
// nothing, which is a poor thing to put in front of someone deciding whether to
// trust you. Interactivity is good; FAKE interactivity is worse than a static
// image, because it invites you to touch it and then lies to you.
//
//   supabase start && SERVICE_KEY=... node scripts/seed-hero-roster.mjs
//   npx vite --port 5173          # with .env.local pointing at the local stack
//   node scripts/shoot-hero.mjs
//
// Every frame is captured at the SAME size, so the tour doesn't jolt in height
// when you switch tabs. Two widths per frame, art-directed: a 1240px screen
// scaled into a 375px phone is illegible, so the narrow variant is a genuinely
// tighter crop rather than the same picture shrunk down.
import { chromium } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'
import sharp from 'sharp'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = 'public/hero'
mkdirSync(OUT, { recursive: true })

const COACH = 'alex@gardnr.demo'
const PASSWORD = 'Demo!Passw0rd123'

const WIDE = { w: 1240, h: 800 }
const NARROW = { w: 720, h: 620 }

const browser = await chromium.launch()

async function session({ w, h }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  })
  // The landing page is dark. Without this the app follows the OS and we'd be
  // dropping a white slab into a black page.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('gardnr-theme', 'dark') } catch { /* private mode */ }
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Email').fill(COACH)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()
  // Wait for real data, not just the app shell — otherwise we photograph a spinner.
  await page.waitForSelector('text=Sam Rivera', { timeout: 30000 })
  return { ctx, page }
}

async function save(page, name, variant) {
  const png = `${OUT}/${name}-${variant}.png`
  const webp = `${OUT}/${name}-${variant}.webp`
  await page.screenshot({ path: png })
  const info = await sharp(png).webp({ quality: 82 }).toFile(webp)
  rmSync(png)
  console.log(`  ${`${name}-${variant}`.padEnd(24)} ${(info.size / 1024).toFixed(0)}KB`)
}

// Scroll a ClientView section to the top of the viewport and hold still.
async function toSection(page, key, settle = 1200) {
  await page.evaluate((k) => {
    document.getElementById(`section-${k}`)?.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -14) // a sliver of breathing room above the card
  }, key)
  await page.waitForTimeout(settle)
}

async function capture(variant, size) {
  const { ctx, page } = await session(size)

  // 1 — Triage. The dashboard as it opens: who needs you first, and why.
  await page.waitForTimeout(1500)
  await save(page, 'triage', variant)

  // Open the subject's record for the evidence frames. "View data" is a <Button>
  // that calls navigate(), not a link, so we click through her card rather than
  // reading an href. Maya is the subject because she's the client with eight
  // weeks of near-complete logs — the only one whose charts have anything to say.
  // The roster is sorted by attention, and Maya is the only green client — so
  // she is last. Asserted below rather than assumed: if the sort ever changes we
  // fail loudly instead of quietly shipping a hero of the wrong client.
  await page.getByRole('button', { name: /view data/i }).last().click()
  await page.waitForURL(/\/client\//, { timeout: 15000 })

  // Confirm it's her record, and that the sections have actually rendered. Both
  // are retrying waits, not one-shot reads — a snapshot of the DOM races React.
  await page.waitForSelector('text=maya@gardnr.demo', { timeout: 20000 })
  await page.waitForSelector('#section-consistency', { timeout: 20000 })
  await page.waitForTimeout(4500) // charts animate in

  // 2 — The evidence. Logging consistency and the 90-day compliance heatmap:
  //     every day, every metric, coloured against target.
  await toSection(page, 'consistency')
  await save(page, 'evidence', variant)

  // 3 — What the scale hides. Body composition: six tape sessions, per-site
  //     trends, change since day one. Maya's waist is down 5.5cm and her arm is
  //     UP — a recomp the weight line alone would never show you.
  await toSection(page, 'measurements', 1600)
  await save(page, 'composition', variant)

  // NOT captured: the Progress overview / energy-balance section. The read
  // itself is one of the best things in the product — real empirical maintenance
  // from what the client actually ate and weighed — but the chart directly above
  // it plots the weight line over the full history while the calorie and cardio
  // bars only cover the last 30 days. With eight weeks of data its left half is
  // permanently blank, and it photographs as though the app is broken. Worth
  // fixing in the chart; not worth putting in the hero until it is.

  await ctx.close()
}

console.log('Capturing the real app:')
await capture('wide', WIDE)
await capture('narrow', NARROW)

await browser.close()
console.log('\nDone.')
