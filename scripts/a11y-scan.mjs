// axe-core accessibility scan of the public pages (WCAG 2.0/2.1 levels A + AA).
//
// Usage:  node scripts/a11y-scan.mjs [baseUrl]
//   default baseUrl = http://localhost:4173 (vite preview). Start a target first:
//     npm run build && npm run preview &      # serves the production build on :4173
//   or pass a deployed URL:  node scripts/a11y-scan.mjs https://www.gardnr.fit
//
// Scans the logged-out surface (landing, auth, legal). Authenticated pages would
// need a throwaway login like scripts/shoot.mjs — a future extension.
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const base = process.argv[2] || 'http://localhost:4173'
const paths = ['/', '/login', '/login?mode=signup', '/privacy', '/terms', '/health-data-privacy']
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const browser = await chromium.launch()
const context = await browser.newContext()
let total = 0
for (const path of paths) {
  const page = await context.newPage()
  try {
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 15000 })
  } catch { /* SPA may keep a socket open; proceed once DOM is there */ }
  await page.waitForTimeout(800)
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  total += violations.length
  console.log(`\n=== ${path} === ${violations.length ? violations.length + ' violation type(s)' : 'clean ✓'}`)
  for (const v of violations) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node[s])`)
    console.log(`     ${v.helpUrl}`)
    v.nodes.slice(0, 4).forEach((n) => {
      const d = n.any?.[0]?.data
      const ratio = d?.contrastRatio ? ` ratio=${d.contrastRatio} fg=${d.fgColor} bg=${d.bgColor} size=${d.fontSize}` : ''
      console.log(`     → ${n.target.join(' ')}${ratio}`)
    })
  }
  await page.close()
}
await context.close()
await browser.close()
console.log(`\n${total === 0 ? '✓ no WCAG A/AA violations across the public pages' : `✗ ${total} violation type(s) total`}`)
process.exit(total === 0 ? 0 : 1)
