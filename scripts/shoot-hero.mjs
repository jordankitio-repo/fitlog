// Capture the landing-page hero image from the REAL coach dashboard.
//
// Run seed-hero-roster.mjs first, against the same Supabase the dev server points
// at. Writes two art-directed crops, because a 1440px dashboard scaled down to a
// 375px phone is illegible mush — the narrow one is a tight crop of the triage
// list, the wide one is the full dashboard.
//
//   node scripts/shoot-hero.mjs [baseUrl]
import { chromium } from 'playwright'
import { mkdirSync, rmSync } from 'node:fs'
import sharp from 'sharp'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = 'public/hero'
mkdirSync(OUT, { recursive: true })

const COACH = 'alex@gardnr.demo'
const PASSWORD = 'Demo!Passw0rd123'

const browser = await chromium.launch()

async function shoot({ name, width, height, clip }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2, // retina — the image is displayed at half these pixels
    colorScheme: 'dark',
  })

  // The landing page is dark. Without this the app boots in light mode (it
  // follows the OS) and we'd be dropping a white slab into a black page.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('gardnr-theme', 'dark') } catch { /* private mode */ }
  })

  const page = await ctx.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('Email').fill(COACH)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click()

  // Wait for real data, not just the shell — otherwise we photograph a spinner.
  await page.waitForSelector('text=Maya Chen', { timeout: 30000 })
  await page.waitForSelector('text=Sam Rivera', { timeout: 30000 })
  await page.waitForTimeout(2500) // let charts finish their entry animation

  const png = `${OUT}/${name}.png`
  const webp = `${OUT}/${name}.webp`
  await page.screenshot({ path: png, ...(clip ? { clip } : {}) })

  // WebP, because a PNG of a dark dashboard is several hundred KB and this is the
  // hero image — the one thing on the page that must not be slow.
  const info = await sharp(png).webp({ quality: 82 }).toFile(webp)
  rmSync(png)

  console.log(`  ${name.padEnd(18)} ${width}x${height}  ${(info.size / 1024).toFixed(0)}KB -> ${webp}`)
  await ctx.close()
}

console.log('Capturing the real coach dashboard:')
// Two art-directed crops, not one image scaled. A 1320px dashboard rendered into
// a 375px phone is illegible mush, so the narrow variant is a deliberately
// tighter frame rather than the same picture shrunk.
//
// wide   — the whole triage story: rollup, then all three clients (red/amber/green).
// narrow — the rollup and the two flagged clients, big enough to actually read.
await shoot({ name: 'dashboard-wide', width: 1320, height: 1010 })
await shoot({ name: 'dashboard-narrow', width: 760, height: 880 })

await browser.close()
console.log('\nDone.')
