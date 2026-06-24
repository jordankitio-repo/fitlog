import { supabase } from '../supabase'
import { invalidateAvatar } from './avatarUrl'

const BUCKET = 'avatars'
const MAX_PX = 512

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// Downscale to a centered square (≤ MAX_PX) and re-encode as JPEG, so avatars
// stay small regardless of the source. Returns a Blob.
export function downscaleToBlob(file, max = MAX_PX) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2
      const out = Math.min(side, max)
      const canvas = document.createElement('canvas')
      canvas.width = out
      canvas.height = out
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process that image.'))), 'image/jpeg', 0.85)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Couldn't read that image — try a JPG or PNG."))
    }
    img.src = url
  })
}

// Upload to a fixed per-user path (upsert) and return the storage PATH to store on
// the profile. Path stays `<uid>/avatar.jpg` so re-uploads replace (no orphaned
// files). The bucket is private, so reads go through signed URLs (see avatarUrl.js)
// rather than a stored public URL; we invalidate the sign cache so the new image
// shows immediately instead of a stale cached signed URL.
export async function uploadAvatar(userId, file) {
  const blob = await downscaleToBlob(file)
  const path = `${userId}/avatar.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  })
  if (error) throw error
  invalidateAvatar(path)
  return path
}

export async function removeAvatar(userId) {
  const path = `${userId}/avatar.jpg`
  await supabase.storage.from(BUCKET).remove([path])
  invalidateAvatar(path)
}
