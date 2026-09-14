import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateCoachSession, readStamp } from './useSessionPolicy'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0)

// Only the coach tier is evaluated here. Clients have no absolute cap and no
// idle timeout in-app on purpose (docs/passwordless-auth-design.md §4.6) — the
// hook returns before reaching this function for them, so "a client is never
// signed out by policy" is asserted by the hook's `if (!isCoach) return`, not
// by a case below.
describe('evaluateCoachSession', () => {
  it('keeps a fresh session', () => {
    const r = evaluateCoachSession({ started: NOW - DAY, seen: NOW - 60_000, now: NOW })
    expect(r).toEqual({ expired: false, reason: null })
  })

  it('expires a session older than 30 days, whatever the activity', () => {
    const r = evaluateCoachSession({ started: NOW - 31 * DAY, seen: NOW, now: NOW })
    expect(r.expired).toBe(true)
    expect(r.reason).toContain('30 days')
  })

  it('expires a session idle for more than 14 days', () => {
    const r = evaluateCoachSession({ started: NOW - 20 * DAY, seen: NOW - 15 * DAY, now: NOW })
    expect(r.expired).toBe(true)
    expect(r.reason).toContain('14 days without use')
  })

  // Age wins when both trip, so a coach returning to a months-old session is
  // told the truthful thing rather than blamed for being idle.
  it('reports age, not idleness, when both thresholds are past', () => {
    const r = evaluateCoachSession({ started: NOW - 40 * DAY, seen: NOW - 20 * DAY, now: NOW })
    expect(r.reason).toContain('30 days')
  })

  // Boundaries are strictly greater-than: a session exactly at the cap survives.
  it('does not expire exactly at either threshold', () => {
    expect(evaluateCoachSession({ started: NOW - 30 * DAY, seen: NOW, now: NOW }).expired).toBe(false)
    expect(evaluateCoachSession({ started: NOW, seen: NOW - 14 * DAY, now: NOW }).expired).toBe(false)
  })

  it('expires one millisecond past either threshold', () => {
    expect(evaluateCoachSession({ started: NOW - 30 * DAY - 1, seen: NOW, now: NOW }).expired).toBe(true)
    expect(evaluateCoachSession({ started: NOW, seen: NOW - 14 * DAY - 1, now: NOW }).expired).toBe(true)
  })

  // The release-day case: a coach already signed in when this shipped has no
  // stamps yet. Signing them all out would be a self-inflicted incident.
  it('never expires on missing stamps', () => {
    expect(evaluateCoachSession({ started: null, seen: null, now: NOW }).expired).toBe(false)
    expect(evaluateCoachSession({ started: null, seen: NOW - 99 * DAY, now: NOW }).expired).toBe(true)
    expect(evaluateCoachSession({ started: NOW - 99 * DAY, seen: null, now: NOW }).expired).toBe(true)
  })

  // A clock moved backwards (timezone change, NTP correction, a user fiddling)
  // produces a negative age. That must not read as "expired".
  it('tolerates stamps in the future', () => {
    const r = evaluateCoachSession({ started: NOW + 10 * DAY, seen: NOW + 10 * DAY, now: NOW })
    expect(r.expired).toBe(false)
  })
})

describe('readStamp', () => {
  beforeEach(() => localStorage.clear())

  it('reads a numeric stamp', () => {
    localStorage.setItem('k', String(NOW))
    expect(readStamp('k')).toBe(NOW)
  })

  it('returns null for absent, empty, non-numeric and non-positive values', () => {
    expect(readStamp('missing')).toBeNull()
    for (const bad of ['', '   ', 'abc', 'NaN', '0', '-1', 'Infinity']) {
      localStorage.setItem('k', bad)
      expect(readStamp('k'), `expected null for ${JSON.stringify(bad)}`).toBeNull()
    }
  })
})
