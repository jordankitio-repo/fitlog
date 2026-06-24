import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// The avatars bucket is PRIVATE (migration 20260624130000). profiles.avatar_url
// stores a storage PATH (`<uid>/avatar.jpg`), not a public URL — reads go through
// short-lived signed URLs that RLS only mints for the owner or an active coach/
// client counterpart. This module centralizes signing with a small cache so a
// roster of avatars doesn't re-sign on every render.

const BUCKET = 'avatars'
const TTL = 3600 // signed-URL validity, seconds
const SOFT_MS = (TTL - 120) * 1000 // re-sign a little before the URL actually expires

const cache = new Map() // path -> { url, exp }
const inflight = new Map() // path -> Promise<string|null>

const isHttp = (v) => typeof v === 'string' && /^https?:\/\//.test(v)

// Drop any cached signed URL for a path (call after re-upload/remove so the next
// render re-signs and fetches fresh bytes instead of a stale cached image).
export function invalidateAvatar(path) {
  cache.delete(path)
  inflight.delete(path)
}

// Resolve a stored avatar value to a usable <img> src. Accepts a storage path
// (signs it) or an already-signed/legacy http URL (returns as-is). Returns null
// when there's nothing to show or signing fails (caller falls back to initials).
export async function signAvatar(value) {
  if (!value) return null
  if (isHttp(value)) return value
  const hit = cache.get(value)
  if (hit && hit.exp > Date.now()) return hit.url
  if (inflight.has(value)) return inflight.get(value)
  const pending = (async () => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(value, TTL)
      if (error || !data?.signedUrl) return null
      cache.set(value, { url: data.signedUrl, exp: Date.now() + SOFT_MS })
      return data.signedUrl
    } catch {
      return null
    } finally {
      inflight.delete(value)
    }
  })()
  inflight.set(value, pending)
  return pending
}

// Synchronous resolution for the cases that need no network round-trip: nothing
// to show, an already-signed http URL, or a still-fresh cached signature.
function resolveImmediate(value) {
  if (!value) return null
  if (isHttp(value)) return value
  const hit = cache.get(value)
  return hit && hit.exp > Date.now() ? hit.url : null
}

// Hook form for components. Resolves synchronously from cache when possible (no
// flash for already-seen avatars), otherwise signs and updates when ready. State
// is re-derived during render when `value` changes (the codebase's adjust-state-
// during-render pattern) so we never call setState synchronously inside an effect.
export function useSignedAvatar(value) {
  const [signed, setSigned] = useState(() => resolveImmediate(value))
  const [tracked, setTracked] = useState(value)
  if (value !== tracked) {
    setTracked(value)
    setSigned(resolveImmediate(value))
  }
  useEffect(() => {
    if (!value || isHttp(value)) return
    const hit = cache.get(value)
    if (hit && hit.exp > Date.now()) return
    let alive = true
    signAvatar(value).then((u) => { if (alive) setSigned(u) })
    return () => { alive = false }
  }, [value])
  return signed
}
