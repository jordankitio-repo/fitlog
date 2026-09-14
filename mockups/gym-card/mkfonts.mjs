import fs from 'node:fs'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Only the `/* latin */` blocks — the card is English-only.
function latinFaces(css) {
  const out = []
  const re = /\/\*\s*latin\s*\*\/\s*(@font-face\s*\{[^}]*\})/g
  let m
  while ((m = re.exec(css))) out.push(m[1])
  return out
}

const files = ['dmsans', 'newsreader', 'dmmono']
let bundle = ''
let total = 0
for (const f of files) {
  const css = fs.readFileSync(`${f}.css`, 'utf8')
  for (const face of latinFaces(css)) {
    const url = face.match(/url\((https:[^)]*woff2)\)/)[1]
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    const buf = Buffer.from(await res.arrayBuffer())
    total += buf.length
    const props = face
      .replace(/@font-face\s*\{|\}$/g, '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('src:') && !s.startsWith('unicode-range') && !s.startsWith('font-display'))
    bundle += `@font-face{${props.join(';')};font-display:block;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')}\n`
    console.log(f, props.find((p) => p.startsWith('font-weight')) || '', props.find((p) => p.startsWith('font-style')) || '', (buf.length / 1024).toFixed(1) + 'kb')
  }
}
fs.writeFileSync('fonts.css', bundle)
console.log('raw total', (total / 1024).toFixed(0) + 'kb', '→ css', (bundle.length / 1024).toFixed(0) + 'kb')
