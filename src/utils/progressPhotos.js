import { supabase } from '../supabase'

// Progress photos (migration 20261026030000): a private bucket, a row per
// photo, one photo per pose per date. Read through short-lived signed URLs, so
// a coach's access ends with the relationship and a leaked link expires.

const BUCKET = 'progress-photos'
const MAX_EDGE = 1600
const TTL = 3600

export const POSES = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
]

// Re-encode as JPEG with the long edge at most MAX_EDGE, keeping the shape.
// Drawing through a canvas also drops the EXIF block, GPS position included,
// which a phone camera writes into every photo by default.
export function shrinkPhoto(file, maxEdge = MAX_EDGE) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that photo.'))), 'image/jpeg', 0.85)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't read that photo. Try a JPG or PNG."))
    }
    img.src = url
  })
}

const randomName = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

// Every photo of a user, newest date first.
export async function listPhotos(userId) {
  const { data, error } = await supabase.from('progress_photos')
    .select('id, taken_on, pose, path').eq('user_id', userId)
    .order('taken_on', { ascending: false })
  if (error) throw error
  return data || []
}

// Add (or replace) the photo for one pose on one date. The new file goes up
// first and the row second, so a failed upload changes nothing; the old file
// is removed last, best-effort.
export async function savePhoto(userId, takenOn, pose, file, existing = null) {
  const blob = await shrinkPhoto(file)
  const path = `${userId}/${randomName()}.jpg`
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' })
  if (up.error) throw up.error
  const { data, error } = await supabase.from('progress_photos')
    .upsert({ user_id: userId, taken_on: takenOn, pose, path }, { onConflict: 'user_id,taken_on,pose' })
    .select('id, taken_on, pose, path').single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  if (existing?.path && existing.path !== path) await supabase.storage.from(BUCKET).remove([existing.path])
  return data
}

export async function deletePhoto(photo) {
  const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([photo.path])
}

// path -> signed URL, for many at once (one request).
const cache = new Map() // path -> { url, exp }
export async function signPhotos(paths) {
  const now = Date.now()
  const out = {}
  const need = []
  for (const p of paths) {
    const hit = cache.get(p)
    if (hit && hit.exp > now) out[p] = hit.url
    else need.push(p)
  }
  if (need.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(need, TTL)
    if (error) throw error
    for (const d of data || []) {
      if (d.signedUrl) {
        out[d.path] = d.signedUrl
        cache.set(d.path, { url: d.signedUrl, exp: now + (TTL - 120) * 1000 })
      }
    }
  }
  return out
}

// The dates that have a photo of this pose, newest first.
export function datesFor(photos, pose) {
  return photos.filter(p => p.pose === pose).map(p => p.taken_on)
}

const DAY_MS = 86400000
const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS

// The weigh-in that belongs with a photo: the same day's, else the nearest
// within `within` days (people rarely weigh and photograph on the same
// morning). Ties go to the earlier one. Null when none is close enough, so a
// photo is never captioned with a weight from a different month.
export function weightNear(weights, date, within = 3) {
  let best = null
  let bestGap = Infinity
  for (const w of weights || []) {
    const gap = Math.abs(dayNum(w.logged_date) - dayNum(date))
    if (gap > within) continue
    if (gap < bestGap || (gap === bestGap && w.logged_date < best.logged_date)) { best = w; bestGap = gap }
  }
  return best
}

// Weigh-ins covering a set of photo dates (with the slack weightNear allows).
export async function weightsAround(userId, dates) {
  if (!dates.length) return []
  const sorted = [...dates].sort()
  const pad = (iso, n) => new Date((dayNum(iso) + n) * DAY_MS).toISOString().slice(0, 10)
  const { data, error } = await supabase.from('weight_log')
    .select('logged_date, weight, unit, weighed_at')
    .eq('user_id', userId)
    .gte('logged_date', pad(sorted[0], -3)).lte('logged_date', pad(sorted[sorted.length - 1], 3))
    .order('weighed_at', { ascending: true })
  if (error) throw error
  // One per day, the first of the morning: the comparable weigh-in.
  const byDay = new Map()
  for (const w of data || []) if (!byDay.has(w.logged_date)) byDay.set(w.logged_date, w)
  return [...byDay.values()]
}
