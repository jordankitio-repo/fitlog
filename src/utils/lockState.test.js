import { describe, it, expect } from 'vitest'
import { resolveLockState } from './lockState'

// Helper: returns a YYYY-MM-DD string offset by N days from today
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}


describe('resolveLockState', () => {

  describe('active - not enough lapse to lock', () => {
    it('returns active when logged today', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(0),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(false)
      expect(result.reason).toBe('active')
    })

    it('returns active when logged yesterday', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(1),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(false)
      expect(result.reason).toBe('active')
    })

    it('returns active when logged 2 days ago', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(2),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(false)
      expect(result.reason).toBe('active')
    })
  })

  describe('locked - lapse >= 3 days, within auto-unlock window', () => {
    it('locks at exactly 3 days', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(3),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(true)
      expect(result.reason).toBe('locked')
      expect(result.days).toBe(3)
    })

    it('locks at 5 days', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(5),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(true)
      expect(result.reason).toBe('locked')
    })

    it('locks at 9 days (one day before auto-unlock)', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(9),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(true)
      expect(result.reason).toBe('locked')
    })
  })

  describe('auto-unlocked - lapse >= 10 days', () => {
    it('auto-unlocks at exactly 10 days', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(10),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(false)
      expect(result.reason).toBe('auto-unlocked')
    })

    it('auto-unlocks at 30 days (long ghost)', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(30),
        connectionCreatedAt: daysAgo(60),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(false)
      expect(result.reason).toBe('auto-unlocked')
    })
  })

  describe('coach-unlocked - within 48hr grace window', () => {
    it('suppresses lock when coach cleared after last log', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(5),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: new Date().toISOString(), // cleared just now
      })
      expect(result.locked).toBe(false)
      expect(result.reason).toBe('coach-unlocked')
    })

    it('grace expires after 48hrs - re-locks', () => {
      const expiredClear = new Date()
      expiredClear.setHours(expiredClear.getHours() - 49)
      const result = resolveLockState({
        lastNutritionDate: daysAgo(5),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: expiredClear.toISOString(),
      })
      expect(result.locked).toBe(true)
      expect(result.reason).toBe('locked')
    })

    it('does not suppress if cleared before last log (stale clear)', () => {
      const staleClear = new Date()
      staleClear.setDate(staleClear.getDate() - 10) // cleared 10 days ago
      const result = resolveLockState({
        lastNutritionDate: daysAgo(4), // logged after the clear, then lapsed again
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: staleClear.toISOString(),
      })
      expect(result.locked).toBe(true)
      expect(result.reason).toBe('locked')
    })
  })

  describe('never logged - uses connectionCreatedAt as baseline', () => {
    it('active when connection is new (2 days old)', () => {
      const result = resolveLockState({
        lastNutritionDate: null,
        connectionCreatedAt: daysAgo(2),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(false)
      expect(result.reason).toBe('active')
    })

    it('locks when connection is 5 days old and never logged', () => {
      const result = resolveLockState({
        lastNutritionDate: null,
        connectionCreatedAt: daysAgo(5),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(true)
      expect(result.reason).toBe('locked')
    })

    it('auto-unlocks when connection is 10+ days old and never logged', () => {
      const result = resolveLockState({
        lastNutritionDate: null,
        connectionCreatedAt: daysAgo(10),
        lockClearedAt: null,
      })
      expect(result.locked).toBe(false)
      expect(result.reason).toBe('auto-unlocked')
    })
  })

  describe('days field accuracy', () => {
    it('reports correct days since last log', () => {
      const result = resolveLockState({
        lastNutritionDate: daysAgo(4),
        connectionCreatedAt: daysAgo(30),
        lockClearedAt: null,
      })
      expect(result.days).toBe(4)
    })
  })
})
