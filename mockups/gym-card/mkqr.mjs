import QRCode from 'qrcode'
import fs from 'node:fs'

const url = 'https://gardnr.fit/?ref=gym'
const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })
const n = qr.modules.size
const d = qr.modules.data
// One rect per dark module, merged into runs along each row → compact path.
let path = ''
for (let y = 0; y < n; y++) {
  let x = 0
  while (x < n) {
    if (d[y * n + x]) {
      let w = 1
      while (x + w < n && d[y * n + x + w]) w++
      path += `M${x} ${y}h${w}v1h-${w}z`
      x += w
    } else x++
  }
}
fs.writeFileSync('qr.txt', `${n}|${path}`)
console.log('version', qr.version, 'modules', n, 'path chars', path.length)
