import { describe, it, expect } from 'vitest'
import { summarizeCompliance } from './complianceSummary'
import { makeTargetLookup } from './targetHistory'
import { toLocalDateString } from './dateHelpers'

// Build a logsByDate map from {daysAgo: calories} offsets relative to today.
function logs(entries) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const map = {}
  for (const [daysAgo, calories] of entries) {
    const d = new Date(today)
    d.setDate(today.getDate() - daysAgo)
    map[toLocalDateString(d)] = { calories }
  }
  return map
}

describe('summarizeCompliance', () => {
  it('returns zeros for an empty log map', () => {
    const s = summarizeCompliance({}, 2000)
    expect(s).toMatchObject({ logged: 0, elapsed: 0, coverage: 0, avgOfTarget: null })
  })

  it('ramps the denominator from the first log for a new account', () => {
    // First log 11 days ago, logged every day since (12 days inclusive).
    const entries = Array.from({ length: 12 }, (_, i) => [i, 2000])
    const s = summarizeCompliance(logs(entries), 2000)
    expect(s.logged).toBe(12)
    expect(s.elapsed).toBe(12)
    expect(s.coverage).toBe(100)
  })

  it('caps the denominator at the window once history exceeds it', () => {
    // A log 120 days ago plus 64 logs inside the last 90 days.
    const entries = [[120, 2000], ...Array.from({ length: 64 }, (_, i) => [i, 2000])]
    const s = summarizeCompliance(logs(entries), 2000)
    expect(s.elapsed).toBe(90)
    expect(s.logged).toBe(64) // the 120-days-ago log is outside the window
    expect(s.coverage).toBe(71)
  })

  it('buckets days by the heatmap compliance thresholds', () => {
    const s = summarizeCompliance(
      logs([[0, 2000], [1, 1800], [2, 1500], [3, 1000]]),
      2000,
    )
    // 100% -> on-target, 90% -> on-target, 75% -> partial, 50% -> under
    expect(s.onTarget).toBe(2)
    expect(s.over).toBe(0)
    expect(s.partial).toBe(1)
    expect(s.under).toBe(1)
    expect(s.avgOfTarget).toBe(79) // mean of 1.0, 0.9, 0.75, 0.5
  })

  it('counts days above 110% of target as over, not on-target', () => {
    const s = summarizeCompliance(
      logs([[0, 2000], [1, 2200], [2, 2300], [3, 3000]]),
      2000,
    )
    // 100% -> on-target, 110% -> on-target (band is inclusive), 115% & 150% -> over
    expect(s.onTarget).toBe(2)
    expect(s.over).toBe(2)
    expect(s.partial).toBe(0)
    expect(s.under).toBe(0)
  })

  it('treats every logged day as on-target when no target is set', () => {
    const s = summarizeCompliance(logs([[0, 1200], [1, 3000]]), 0)
    expect(s.hasTarget).toBe(false)
    expect(s.onTarget).toBe(2)
    expect(s.partial).toBe(0)
    expect(s.under).toBe(0)
    expect(s.avgOfTarget).toBeNull()
  })
})

// Target history: a plan change mid-window regrades only the days after it.
describe('summarizeCompliance against a target history', () => {
  const ago = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return toLocalDateString(d) }
  const history = makeTargetLookup([
    { effective_date: '1970-01-01', calories: 2000 },
    { effective_date: ago(5), calories: 1600 },
  ])

  it('grades each day against the plan in force that day', () => {
    // 2000 cal every day: on target under the old plan, over under the new one.
    const s = summarizeCompliance(logs([[10, 2000], [9, 2000], [3, 2000], [2, 2000]]), history, 90)
    expect(s.onTarget).toBe(2)
    expect(s.over).toBe(2)
    // (100 + 100 + 125 + 125) / 4
    expect(s.avgOfTarget).toBe(113)
    expect(s.hasTarget).toBe(true)
  })

  it('a flat number still grades every day the same', () => {
    const s = summarizeCompliance(logs([[10, 2000], [2, 2000]]), 1600, 90)
    expect(s.over).toBe(2)
  })
})
