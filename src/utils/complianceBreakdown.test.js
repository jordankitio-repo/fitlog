import { describe, it, expect } from 'vitest'
import { complianceBreakdown } from './complianceBreakdown'
import { makeTargetLookup } from './targetHistory'
import { toLocalDateString } from './dateHelpers'

// Build a logsByDate map from { daysAgo: calories } offsets relative to today.
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

// Find the most recent N days that fall on a given segment (weekday/weekend),
// returned as daysAgo offsets — so tests don't depend on what today happens to be.
function offsetsFor(segment, count) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const out = []
  for (let i = 0; out.length < count && i < 120; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const dow = d.getDay()
    const isWeekend = dow === 0 || dow === 6
    if ((segment === 'weekend') === isWeekend) out.push(i)
  }
  return out
}

describe('complianceBreakdown', () => {
  it('reports no target when none is set', () => {
    const r = complianceBreakdown(logs([[1, 2000]]), null)
    expect(r.hasTarget).toBe(false)
    expect(r.weaker).toBeNull()
  })

  it('is insufficient until each segment has the minimum logged days', () => {
    // Two weekend days only — weekday side is empty.
    const wk = offsetsFor('weekend', 2)
    const r = complianceBreakdown(logs(wk.map(d => [d, 3000])), 2000)
    expect(r.insufficient).toBe(true)
    expect(r.weaker).toBeNull()
    expect(r.weekend.logged).toBe(2)
  })

  it('buckets days as on-target / over / under against a +/-10% band', () => {
    const wkday = offsetsFor('weekday', 3)
    const r = complianceBreakdown(logs([
      [wkday[0], 2000], // exactly on target
      [wkday[1], 2400], // 20% over
      [wkday[2], 1500], // 25% under
    ]), 2000)
    expect(r.weekday.onTarget).toBe(1)
    expect(r.weekday.over).toBe(1)
    expect(r.weekday.under).toBe(1)
  })

  it('averages the overage only across days that ran over', () => {
    const wkend = offsetsFor('weekend', 3)
    const r = complianceBreakdown(logs([
      [wkend[0], 2800], // +800
      [wkend[1], 3000], // +1000
      [wkend[2], 2000], // on target, excluded from avg
    ]), 2000)
    expect(r.weekend.over).toBe(2)
    expect(r.weekend.avgOverDelta).toBe(900)
    // Signed avg across all 3 logged days: (+800 +1000 +0) / 3 = 600.
    expect(r.weekend.avgDelta).toBe(600)
  })

  it('reports a negative avgDelta when a segment runs under target', () => {
    const wkday = offsetsFor('weekday', 3)
    const r = complianceBreakdown(logs(wkday.map(d => [d, 1500])), 2000)
    expect(r.weekday.under).toBe(3)
    expect(r.weekday.avgDelta).toBe(-500)
  })

  it('names weekends as weaker when weekend on-target rate is lower', () => {
    const wkday = offsetsFor('weekday', 4)
    const wkend = offsetsFor('weekend', 4)
    const r = complianceBreakdown(logs([
      ...wkday.map(d => [d, 2000]),       // all on target
      ...wkend.map(d => [d, 3000]),       // all over
    ]), 2000)
    expect(r.insufficient).toBe(false)
    expect(r.weaker).toBe('weekend')
    expect(r.weekday.onTarget).toBe(4)
    expect(r.weekend.over).toBe(4)
    expect(r.weekend.avgOverDelta).toBe(1000)
  })

  it('names neither when both segments are equally on target', () => {
    const wkday = offsetsFor('weekday', 3)
    const wkend = offsetsFor('weekend', 3)
    const r = complianceBreakdown(logs([
      ...wkday.map(d => [d, 2000]),
      ...wkend.map(d => [d, 2000]),
    ]), 2000)
    expect(r.weaker).toBeNull()
    expect(r.insufficient).toBe(false)
  })
})

describe('calorieDayOnTarget', () => {
  it('is the heatmap band: 90 to 110 percent, inclusive', async () => {
    const { calorieDayOnTarget } = await import('./complianceBreakdown')
    expect(calorieDayOnTarget(1800, 2000)).toBe(true)
    expect(calorieDayOnTarget(2200, 2000)).toBe(true)
    expect(calorieDayOnTarget(2800, 2000)).toBe(false) // 140%: over, not on target
    expect(calorieDayOnTarget(1700, 2000)).toBe(false)
    expect(calorieDayOnTarget(0, 2000)).toBe(false)
  })
})

describe('averages for the rings', () => {
  it('gives each segment its average day in calories, and each weekday its own', () => {
    const logs = {}
    // Two weeks: weekdays at 2,000, weekends at 2,400, against a 2,000 target.
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i)
      const dow = d.getDay()
      logs[toLocalDateString(d)] = { calories: dow === 0 || dow === 6 ? 2400 : 2000 }
    }
    const b = complianceBreakdown(logs, 2000, 14)
    expect(b.weekday.avgCal).toBe(2000)
    expect(b.weekend.avgCal).toBe(2400)
    expect(b.byDow[6].avgCal).toBe(2400)
    expect(b.byDow[3].avgCal).toBe(2000)
    expect(b.byDow.every(x => x.logged === 2)).toBe(true)
  })
})


describe('complianceBreakdown against a target history', () => {
  const ago = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return toLocalDateString(d) }

  it('grades each day against its own plan, and names today\'s plan', () => {
    const history = makeTargetLookup([
      { effective_date: '1970-01-01', calories: 2000 },
      { effective_date: ago(13), calories: 1600 },
    ])
    // 2000 a day for 28 days: on target for the old 14, over for the new 14.
    const entries = Array.from({ length: 28 }, (_, i) => [i, 2000])
    const b = complianceBreakdown(logs(entries), history, 90)
    const total = (x) => x.onTarget + x.over + x.under
    expect(b.weekday.onTarget + b.weekend.onTarget).toBe(14)
    expect(b.weekday.over + b.weekend.over).toBe(14)
    expect(total(b.weekday) + total(b.weekend)).toBe(28)
    expect(b.currentTarget).toBe(1600)
    // The average day is the days themselves, not the plan plus a deviation.
    expect(b.weekday.avgCal).toBe(2000)
    expect(b.weekday.avgTarget).toBeGreaterThan(1600)
    expect(b.weekday.avgTarget).toBeLessThan(2000)
  })

  it('avgCal is unchanged for a constant target', () => {
    const entries = Array.from({ length: 28 }, (_, i) => [i, 1800 + (i % 3) * 100])
    const b = complianceBreakdown(logs(entries), 2000, 90)
    const days = entries.filter(([i]) => { const d = new Date(); d.setDate(d.getDate() - i); return d.getDay() !== 0 && d.getDay() !== 6 })
    const mean = Math.round(days.reduce((s, [, c]) => s + c, 0) / days.length)
    expect(b.weekday.avgCal).toBe(mean)
    expect(b.weekday.avgTarget).toBe(2000)
  })

  it('no plan at all is no target', () => {
    expect(complianceBreakdown(logs([[1, 2000]]), makeTargetLookup([]), 90).hasTarget).toBe(false)
  })
})
