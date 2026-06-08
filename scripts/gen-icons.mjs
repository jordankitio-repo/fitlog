// Rasterize the Gardnr SVG marks into the PNG sizes that iOS, PWA installs,
// and social scrapers require (they don't all accept SVG).
//
//   node scripts/gen-icons.mjs
//
// Requires `sharp` (installed on demand; not a committed dependency).
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const icon = readFileSync(join(pub, 'logo-icon.svg'))
const og = readFileSync(join(pub, 'og.svg'))

const jobs = [
  [icon, 'apple-touch-icon.png', 180, 180],
  [icon, 'icon-192.png', 192, 192],
  [icon, 'icon-512.png', 512, 512],
  [icon, 'favicon-32.png', 32, 32],
  [og, 'og.png', 1200, 630],
]

await Promise.all(
  jobs.map(([buf, name, w, h]) =>
    sharp(buf, { density: 384 })
      .resize(w, h)
      .png()
      .toFile(join(pub, name))
      .then(() => console.log('✓', name, `${w}×${h}`))
  )
)
