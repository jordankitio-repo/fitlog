import { describe, it, expect } from 'vitest'
import { bucketHistory, rangeByKey, RANGES, DEFAULT_RANGE } from './chartRange'

const ASOF = new Date(2026, 9, 15, 12, 0, 0) // 15 Oct 2026

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysBefore = (n) => { const d = new Date(ASOF); d.setDate(d.getDate() - n); return ymd(d) }

describe('RANGES', () => {
  it('offers W, M and Y and deliberately no D', () => {
    expect(RANGES.map((r) => r.key)).toEqual(['W', 'M', 'Y'])
  })

  it('falls back to the default for an unknown key', () => {
    expect(rangeByKey('D').key).toBe(DEFAULT_RANGE)
    expect(rangeByKey(undefined).key).toBe(DEFAULT_RANGE)
  })
})

describe('bucketHistory — W and M', () => {
  const history = Array.from({ length: 40 }, (_, i) => ({ iso: daysBefore(39 - i), steps: 1000 + i }))

  it('W keeps only the last 7 days', () => {
    const out = bucketHistory(history, 'steps', 'W', { asOf: ASOF })
    expect(out).toHaveLength(7)
    expect(out[out.length - 1].iso).toBe(daysBefore(0))
    expect(out[0].iso).toBe(daysBefore(6))
  })

  it('M keeps the last 30', () => {
    expect(bucketHistory(history, 'steps', 'M', { asOf: ASOF })).toHaveLength(30)
  })

  it('labels daily points MM-DD and leaves the values alone', () => {
    const out = bucketHistory(history, 'steps', 'W', { asOf: ASOF })
    expect(out[0].date).toBe(daysBefore(6).slice(5))
    expect(out[out.length - 1].steps).toBe(1039)
  })

  it('sorts, so an out-of-order history still plots left to right', () => {
    const jumbled = [
      { iso: daysBefore(1), steps: 2 },
      { iso: daysBefore(5), steps: 1 },
      { iso: daysBefore(0), steps: 3 },
    ]
    const out = bucketHistory(jumbled, 'steps', 'W', { asOf: ASOF })
    expect(out.map((r) => r.steps)).toEqual([1, 2, 3])
  })
})

describe('bucketHistory — Y', () => {
  it('AVERAGES each month rather than summing it', () => {
    // March: 2 days at 10,000. April: 4 days at 10,000. Identical behaviour,
    // different logging volume — the bars must match.
    const history = [
      { iso: '2026-03-04', steps: 10000 },
      { iso: '2026-03-19', steps: 10000 },
      { iso: '2026-04-02', steps: 10000 },
      { iso: '2026-04-09', steps: 10000 },
      { iso: '2026-04-16', steps: 10000 },
      { iso: '2026-04-23', steps: 10000 },
    ]
    const out = bucketHistory(history, 'steps', 'Y', { asOf: ASOF })
    expect(out.map((r) => r.steps)).toEqual([10000, 10000])
    expect(out.map((r) => r.days)).toEqual([2, 4])
  })

  it('gives one point per month, in order, labelled by month name', () => {
    const history = [
      { iso: '2026-08-10', calories: 2000 },
      { iso: '2026-09-10', calories: 2200 },
      { iso: '2026-10-10', calories: 2400 },
    ]
    const out = bucketHistory(history, 'calories', 'Y', { asOf: ASOF })
    expect(out.map((r) => r.date)).toEqual(['Aug', 'Sep', 'Oct'])
    expect(out.map((r) => r.calories)).toEqual([2000, 2200, 2400])
  })

  it('appends the year at a January boundary so two "Jan"s cannot appear bare', () => {
    const asOf = new Date(2027, 0, 20, 12, 0, 0)
    const history = [
      { iso: '2026-11-10', calories: 2000 },
      { iso: '2026-12-10', calories: 2100 },
      { iso: '2027-01-10', calories: 2200 },
    ]
    const out = bucketHistory(history, 'calories', 'Y', { asOf })
    expect(out.map((r) => r.date)).toEqual(['Nov', 'Dec', 'Jan 27'])
  })

  it('rounds to a whole unit, but keeps a decimal for weight', () => {
    const steps = bucketHistory([
      { iso: '2026-10-01', steps: 1000 }, { iso: '2026-10-02', steps: 1001 },
    ], 'steps', 'Y', { asOf: ASOF })
    expect(steps[0].steps).toBe(1001) // 1000.5 -> 1001

    const weight = bucketHistory([
      { iso: '2026-10-01', weight: 170.0 }, { iso: '2026-10-02', weight: 170.5 },
    ], 'weight', 'Y', { asOf: ASOF })
    expect(weight[0].weight).toBe(170.3) // 170.25 -> 170.3
  })

  it('excludes anything older than 12 months', () => {
    const history = [
      { iso: '2025-01-05', calories: 9999 },
      { iso: '2026-10-05', calories: 2000 },
    ]
    const out = bucketHistory(history, 'calories', 'Y', { asOf: ASOF })
    expect(out).toHaveLength(1)
    expect(out[0].calories).toBe(2000)
  })
})

describe('bucketHistory — edges', () => {
  it('ignores rows with no iso date', () => {
    expect(bucketHistory([{ date: '10-14', steps: 9000 }], 'steps', 'M', { asOf: ASOF })).toEqual([])
  })

  it('handles an empty or missing history', () => {
    expect(bucketHistory([], 'steps', 'M', { asOf: ASOF })).toEqual([])
    expect(bucketHistory(undefined, 'steps', 'Y', { asOf: ASOF })).toEqual([])
  })
})
