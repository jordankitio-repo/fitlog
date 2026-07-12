// Capture the frames behind the landing-page hero tour, and the hotspot map.
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
// Outputs, into public/hero/:
//   <frame>-wide.webp / <frame>-narrow.webp   the pictures
//   hotspots.json                             where the interesting bits ARE
//
// The landing overlays invisible regions on each screenshot, so hovering a
// client row lifts it and explains the signal — alive, the way the real app is,
// without pretending a click will do something it won't. Those regions are
// MEASURED off the live DOM here rather than eyeballed, so they cannot drift
// away from the picture. Change the app's layout, re-run this, and the map
// regenerates with it.
//
// Every frame is captured at the SAME size, so the tour doesn't jolt in height
// when you switch tabs. Two widths per frame, art-directed: a 1240px screen
// scaled into a 375px phone is illegible, so the narrow variant is a genuinely
// tighter crop rather than the same picture shrunk down.
import { chromium } from 'playwright'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const BASE = process.argv[2] || 'http://localhost:5173'
const OUT = 'public/hero'
mkdirSync(OUT, { recursive: true })

const COACH = 'alex@gardnr.demo'
const PASSWORD = 'Demo!Passw0rd123'

// Tall enough that ALL THREE clients land in the triage frame. At 800px Maya was
// cropped out — and she's the "on track" one whose caption says to leave her
// alone, so the picture was contradicting its own words.
const WIDE = { w: 1240, h: 1040 }
const NARROW = { w: 720, h: 900 }

const hotspots = {}
const browser = await chromium.launch()

async function session({ w, h }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  })
  // The landing page is dark. Without this the app follows the OS and we'd drop
  // a white slab into a black page.
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

// Find the element containing `text` and walk UP to the card that encloses it —
// the first ancestor wide and tall enough to be a card rather than a label. Done
// by measurement rather than by counting parentElement hops, which would break
// the first time someone wraps a div around something.
async function rectOf(page, text, minWidth) {
  return page.evaluate(({ text, minWidth }) => {
    // Match on "starts with", not equality: several of these labels carry an
    // InfoTip child, so their textContent is "Current streak i" rather than
    // "Current streak". Among the matches, take the one with the SHORTEST text —
    // that's the leaf label, not some ancestor that happens to contain it.
    const matches = [...document.querySelectorAll('p, span, div, h2, h3, h4')]
      .filter((e) => (e.textContent || '').trim().startsWith(text))
      .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length)
    const el = matches[0]
    if (!el) return null
    let n = el
    while (n.parentElement) {
      const r = n.getBoundingClientRect()
      if (r.width >= minWidth && r.height >= 48) break
      n = n.parentElement
    }
    const r = n.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }, { text, minWidth })
}

async function save(page, frame, variant, targets = []) {
  const png = `${OUT}/${frame}-${variant}.png`
  const webp = `${OUT}/${frame}-${variant}.webp`
  await page.screenshot({ path: png })
  const info = await sharp(png).webp({ quality: 82 }).toFile(webp)
  rmSync(png)

  // Positions as a percentage of the frame we just photographed, so they scale
  // with the rendered image at any display size.
  const vp = page.viewportSize()
  const boxes = []
  for (const t of targets) {
    const r = await rectOf(page, t.text, t.minWidth ?? 320)
    if (!r) {
      console.warn(`    ! hotspot "${t.id}" not found in ${frame}-${variant}`)
      continue
    }
    // Clip to the frame — an element running off the bottom would otherwise
    // produce a hotspot hanging outside the picture.
    const x = Math.max(0, r.x)
    const y = Math.max(0, r.y)
    const w = Math.min(r.width, vp.width - x)
    const h = Math.min(r.height, vp.height - y)
    if (w <= 8 || h <= 8 || y >= vp.height - 8) continue
    boxes.push({
      id: t.id,
      x: +((x / vp.width) * 100).toFixed(2),
      y: +((y / vp.height) * 100).toFixed(2),
      w: +((w / vp.width) * 100).toFixed(2),
      h: +((h / vp.height) * 100).toFixed(2),
    })
  }
  hotspots[frame] ??= {}
  hotspots[frame][variant] = boxes

  console.log(`  ${`${frame}-${variant}`.padEnd(24)} ${(info.size / 1024).toFixed(0)}KB  ${boxes.length} hotspots`)
}

// Scroll a ClientView section to the top of the viewport and let it settle.
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
  await save(page, 'triage', variant, [
    { id: 'sam', text: 'Sam Rivera' },
    { id: 'jordan', text: 'Jordan Lee' },
    { id: 'maya', text: 'Maya Chen' },
  ])

  // Open the subject's record. "View data" is a <Button> calling navigate(), not
  // a link. The roster is sorted by attention and Maya is the only green client,
  // so she is last — asserted below rather than assumed.
  await page.getByRole('button', { name: /view data/i }).last().click()
  await page.waitForURL(/\/client\//, { timeout: 15000 })
  await page.waitForSelector('text=maya@gardnr.demo', { timeout: 20000 })
  await page.waitForSelector('#section-consistency', { timeout: 20000 })
  await page.waitForTimeout(4500) // charts animate in

  // 2 — The evidence. Logging consistency, and the 90-day compliance heatmap:
  //     every day coloured against target.
  await toSection(page, 'consistency')
  await save(page, 'evidence', variant, [
    // NB: the DOM text is title-case; the SCREAMING CAPS you see is CSS
    // text-transform. Match what's in the DOM, not what's on the screen.
    { id: 'heatmap', text: 'Calorie Compliance - Last 90 Days', minWidth: 420 },
    { id: 'streak', text: 'Current streak', minWidth: 180 },
  ])

  // 3 — What the scale hides. Six tape sessions, per-site trends, change since
  //     day one. Maya's waist is down 5.2cm and her arm is UP — a recomp the
  //     weight line alone would never have shown you.
  await toSection(page, 'measurements', 1600)
  await save(page, 'composition', variant, [
    { id: 'waist', text: 'Waist', minWidth: 180 },
    { id: 'arm', text: 'Arm', minWidth: 180 },
  ])

  // NOT captured: the Progress overview / energy-balance section. The read itself
  // is one of the best things in the product — real empirical maintenance from
  // what the client actually ate and weighed — but the chart directly above it
  // plots the weight line across the full history while the calorie and cardio
  // bars cover only the last 30 days. With eight weeks of data its left half is
  // permanently blank, and it photographs as though the app is broken. Worth
  // fixing in the chart; not worth putting in the hero until it is.

  await ctx.close()
}

console.log('Capturing the real app:')
await capture('wide', WIDE)
await capture('narrow', NARROW)

writeFileSync(`${OUT}/hotspots.json`, `${JSON.stringify(hotspots, null, 2)}\n`)
console.log(`\nWrote ${OUT}/hotspots.json`)

await browser.close()
console.log('Done.')
