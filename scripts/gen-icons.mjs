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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
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

// ---- iOS native assets ---------------------------------------------------
//
// The Capacitor template ships a placeholder icon (a blue X) and an off-white
// splash. Both are generated from the same marks as everything above, so the
// app cannot drift from the web.
//
// THE ICON MUST NOT HAVE ALPHA. logo-icon.svg bakes in its own squircle
// (`rect rx="280"`), which leaves the four corners transparent -- and iOS both
// applies its OWN mask and rejects icons carrying an alpha channel at
// submission. `flatten` fills those corners with the mark's own canvas colour,
// giving a full-bleed opaque square for iOS to round however it likes. Without
// it the icon is rejected by App Store Connect and double-rounded on screen.
const IOS_ICON_BG = '#062120'   // logo-icon.svg's own canvas
const IOS_SPLASH_BG = '#0a0a0a' // matches #splash in index.html, so the native
                                // splash does not flash a different colour into
                                // the web one it hands over to

const iosIcon = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
const iosSplashDir = join(root, 'ios/App/App/Assets.xcassets/Splash.imageset')

await sharp(icon, { density: 384 })
  .resize(1024, 1024)
  .flatten({ background: IOS_ICON_BG })
  .png()
  .toFile(iosIcon)
  .then(() => console.log('✓', 'ios AppIcon-512@2x.png', '1024×1024 (opaque)'))

// One splash, written to all three scale slots -- Capacitor's Contents.json
// maps 1x/2x/3x and ships the same bytes in each. The mark sits at ~19% of the
// canvas: the image is scaled to FILL the screen, so a larger mark crops.
const mark = await sharp(icon, { density: 384 }).resize(520, 520).png().toBuffer()
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: IOS_SPLASH_BG },
})
  .composite([{ input: mark, gravity: 'center' }])
  .png()
  .toBuffer()

await Promise.all(
  ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'].map((name) =>
    sharp(splash).toFile(join(iosSplashDir, name))
      .then(() => console.log('✓', 'ios ' + name, '2732×2732'))
  )
)
