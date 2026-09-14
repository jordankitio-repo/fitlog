import fs from 'node:fs'

const REPO = '/Users/jordankitio/fitlog'
const tpl = fs.readFileSync('card.tpl.html', 'utf8')
const fonts = fs.readFileSync('fonts.css', 'utf8')
const [size, qrPath] = fs.readFileSync('qr.txt', 'utf8').split('|')

// Logo mark, lifted verbatim from public/logo-icon.svg so the card can never
// drift from the app icon.
const icon = fs.readFileSync(`${REPO}/public/logo-icon.svg`, 'utf8')
const paths = [...icon.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]).join('')
if (paths.length < 1000) throw new Error('logo paths not found')

const VB = 'viewBox="0 0 1254 1254" xmlns="http://www.w3.org/2000/svg"'
// Side A sits on paper, so it keeps the dark squircle. Side B sits on the same
// forest as the icon's own counter-shapes, so the squircle is dropped and the
// mark reads straight out of the ground.
const markA = `<svg class="mark" ${VB} aria-hidden="true"><rect width="1254" height="1254" rx="280" fill="#062120"/>${paths}</svg>`
const markB = `<svg class="mark" ${VB} aria-hidden="true">${paths}</svg>`

const qr = (cls, label) =>
  `<svg class="qr ${cls}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="${label}"><path d="${qrPath}" fill="currentColor"/></svg>`

let out = tpl
  .replace('/*FONTS*/', fonts.trim())
  .replace('/*QR_LG*/', qr('', 'QR code linking to gardnr.fit'))
  .replace('/*QR_SM*/', `<div class="qr-tile">${qr('qr--sm', 'QR code linking to gardnr.fit')}</div>`)

// Two /*MARK*/ slots: first is side A (paper), second is side B (forest).
let seen = 0
out = out.replace(/\/\*MARK\*\//g, () => (seen++ === 0 ? markA : markB))
if (seen !== 2) throw new Error(`expected 2 mark slots, got ${seen}`)

// The QR inherits colour: ink on side A, paper-green on side B.
out = out.replace('.qr rect{fill:none}', '.card--a .qr{color:var(--ink)}\n.card--b .qr{color:var(--forest)}')

fs.writeFileSync('gardnr-gym-card.html', out)
console.log('built', (out.length / 1024).toFixed(0) + 'kb', '| marks', seen)
