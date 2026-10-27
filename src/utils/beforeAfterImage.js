// A before/after image of two photo sets, drawn on a canvas: one row per pose
// both sets have, the two dates (and weights) over the columns, a small
// "Gardnr" mark in the corner. What Trainerize coaches assemble by hand for a
// testimonial or a client's own record.
//
// `before` / `after`: { date, weight (text or null), urls: { front, side, back } }.
// Resolves a JPEG Blob.

const POSE_ORDER = ['front', 'side', 'back']
const COL_W = 540, ROW_H = 720, GAP = 16, PAD = 32, HEAD = 96

function load(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Couldn't load a photo for the image."))
    img.src = url
  })
}

// Draw `img` to cover the box (like object-fit: cover).
function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s, sh = h / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

export async function beforeAfterImage({ before, after, dateLabel }) {
  const poses = POSE_ORDER.filter(p => before.urls[p] && after.urls[p])
  if (!poses.length) throw new Error('No pose is in both sets.')
  const imgs = await Promise.all(poses.flatMap(p => [load(before.urls[p]), load(after.urls[p])]))
  const canvas = document.createElement('canvas')
  canvas.width = PAD * 2 + COL_W * 2 + GAP
  canvas.height = PAD * 2 + HEAD + poses.length * ROW_H + (poses.length - 1) * GAP + 40
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#111111'
  ctx.textBaseline = 'top'
  ;[before, after].forEach((set, i) => {
    const x = PAD + i * (COL_W + GAP)
    ctx.font = '600 34px -apple-system, Helvetica, Arial, sans-serif'
    ctx.fillText(i === 0 ? 'Before' : 'After', x, PAD)
    ctx.font = '400 26px -apple-system, Helvetica, Arial, sans-serif'
    ctx.fillStyle = '#555555'
    ctx.fillText([dateLabel(set.date), set.weight].filter(Boolean).join(' · '), x, PAD + 44)
    ctx.fillStyle = '#111111'
  })
  poses.forEach((_, r) => {
    const y = PAD + HEAD + r * (ROW_H + GAP)
    cover(ctx, imgs[r * 2], PAD, y, COL_W, ROW_H)
    cover(ctx, imgs[r * 2 + 1], PAD + COL_W + GAP, y, COL_W, ROW_H)
  })
  ctx.font = '500 22px -apple-system, Helvetica, Arial, sans-serif'
  ctx.fillStyle = '#9a9a9a'
  ctx.textBaseline = 'bottom'
  ctx.fillText('Gardnr', PAD, canvas.height - PAD / 2)
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't make the image."))), 'image/jpeg', 0.9))
}

// Save a Blob: the share sheet where there is one (the iPhone app has no
// Downloads), a download link otherwise.
export async function saveBlob(blob, filename) {
  const file = new File([blob], filename, { type: blob.type })
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return }
  } catch (e) {
    if (e?.name === 'AbortError') return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
