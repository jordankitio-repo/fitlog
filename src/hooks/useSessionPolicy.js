import { useEffect } from 'react'
import { supabase } from '../supabase'

// Session lifetime policy (docs/passwordless-auth-design.md §4.6).
//
// Deliberately NOT an idle timeout for clients. Idle timeouts exist to protect
// unattended SHARED terminals — the hospital floor PC, the bank branch desk —
// which is why they appear in HIPAA/FFIEC guidance. A client logging meals on
// their own phone behind Face ID is not that threat, and a short timer would
// only ever fire on the lapsed client we're trying to win back. What actually
// protects the account is step-up re-authentication on the dangerous actions
// (see request-step-up), not logging everyone out more often.
//
// Coaches are a different tier: one coach account reaches every one of their
// clients' health data, so it gets an absolute cap and a real inactivity limit.
// Supabase applies session limits per PROJECT, not per role — the project-wide
// setting carries the client tier (90-day time-box, no inactivity timeout) and
// the tighter coach policy is enforced here.
//
// This is client-side and therefore clearable. That's fine: the threat model is
// a lost or stolen device, not a coach evading their own timeout. The Supabase
// time-box is the backstop that a cleared localStorage cannot reach past.

const STARTED_KEY = 'gardnr-session-started'
const SEEN_KEY = 'gardnr-session-last-seen'
export const SIGNED_OUT_REASON_KEY = 'gardnr-signed-out-reason'

const DAY = 24 * 60 * 60 * 1000
const COACH_MAX_AGE = 30 * DAY
const COACH_MAX_IDLE = 14 * DAY

const CHECK_INTERVAL = 5 * 60 * 1000
const SEEN_THROTTLE = 60 * 1000

function readStamp(key) {
  const raw = Number(localStorage.getItem(key))
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

export function clearSessionStamps() {
  try {
    localStorage.removeItem(STARTED_KEY)
    localStorage.removeItem(SEEN_KEY)
  } catch { /* private mode */ }
}

export function useSessionPolicy(session, profile) {
  const isCoach = profile?.role === 'coach'

  useEffect(() => {
    if (!session) {
      clearSessionStamps()
      return
    }

    const now = Date.now()
    try {
      // First sighting of this session. An already-signed-in user at deploy time
      // starts their clock now rather than retroactively — they get at most one
      // extra policy window, which beats signing everyone out on release day.
      if (!readStamp(STARTED_KEY)) localStorage.setItem(STARTED_KEY, String(now))
      localStorage.setItem(SEEN_KEY, String(now))
    } catch { /* private mode */ }

    if (!isCoach) return

    let lastWrite = now

    function touch() {
      const t = Date.now()
      if (t - lastWrite < SEEN_THROTTLE) return
      lastWrite = t
      try { localStorage.setItem(SEEN_KEY, String(t)) } catch { /* private mode */ }
    }

    async function enforce() {
      const started = readStamp(STARTED_KEY)
      const seen = readStamp(SEEN_KEY)
      const t = Date.now()

      const tooOld = started !== null && t - started > COACH_MAX_AGE
      const tooIdle = seen !== null && t - seen > COACH_MAX_IDLE
      if (!tooOld && !tooIdle) return

      try {
        localStorage.setItem(
          SIGNED_OUT_REASON_KEY,
          tooOld
            ? 'For security, coach sessions end after 30 days. Please sign in again.'
            : 'For security, coach sessions end after 14 days without use. Please sign in again.',
        )
      } catch { /* private mode */ }
      clearSessionStamps()
      await supabase.auth.signOut()
    }

    // Checked on load, when the tab is brought back to the foreground (the case
    // that matters — a laptop reopened weeks later), and periodically while open.
    enforce()
    const timer = setInterval(enforce, CHECK_INTERVAL)

    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      enforce()
      touch()
    }

    document.addEventListener('visibilitychange', onVisibility)
    for (const evt of ['pointerdown', 'keydown']) {
      document.addEventListener(evt, touch, { passive: true })
    }

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const evt of ['pointerdown', 'keydown']) document.removeEventListener(evt, touch)
    }
  }, [session, isCoach])
}
