import { describe, it, expect } from 'vitest'
import { windowTrend, trendDirection, hasTrend } from './progressTrends'

// A fixed "today" so the windows are deterministic. Noon, because the util
// normalises to noon and a midnight anchor would sit on a boundary.
const ASOF = new Date(2026, 9, 15, 12, 0, 0) // 15 Oct 2026

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysBefore = (n) => { const d = new Date(ASOF); d.setDate(d.getDate() - n); return ymd(d) }

// n rows ending today, every row the same value.
const flatSeries = (n, value, key = 'steps') =>
  Array.from({ length: n }, (_, i) => ({ iso: daysBefore(n - 1 - i), [key]: value }))

describe('trendDirection', () => {
  it('calls a move inside the 2% dead band flat', () => {
    expect(trendDirection(1000, 1015)).toBe('flat')
    expect(trendDirection(1000, 990)).toBe('flat')
  })

  it('calls a move outside the dead band', () => {
    expect(trendDirection(1100, 1000)).toBe('up')
    expect(trendDirection(900, 1000)).toBe('down')
  })

  it('reports none rather than guessing when a side is missing', () => {
    expect(trendDirection(null, 1000)).toBe('none')
    expect(trendDirection(1000, null)).toBe('none')
    expect(trendDirection(1000, 0)).toBe('none')
  })
})

describe('windowTrend', () => {
  it('splits into two adjacent windows ending today', () => {
    // 28 days: the older 14 at 8000, the newer 14 at 10000.
    const history = [
      ...Array.from({ length: 14 }, (_, i) => ({ iso: daysBefore(27 - i), steps: 8000 })),
      ...Array.from({ length: 14 }, (_, i) => ({ iso: daysBefore(13 - i), steps: 10000 })),
    ]
    const t = windowTrend(history, 'steps', { asOf: ASOF })
    expect(t.current).toBe(10000)
    expect(t.prior).toBe(8000)
    expect(t.delta).toBe(2000)
    expect(t.direction).toBe('up')
    expect(t.nCurrent).toBe(14)
    expect(t.nPrior).toBe(14)
  })

  it('averages over LOGGED days, so a gap is not read as a decline', () => {
    // Four logged days in the current window, all on target; a full prior
    // window at the same value. Counting unlogged days as zero would make this
    // read as a 71% collapse — that is a consistency fact, not a trend.
    const history = [
      ...Array.from({ length: 14 }, (_, i) => ({ iso: daysBefore(27 - i), calories: 2100 })),
      ...[0, 1, 2, 3].map((i) => ({ iso: daysBefore(i), calories: 2100 })),
    ]
    const t = windowTrend(history, 'calories', { asOf: ASOF })
    expect(t.current).toBe(2100)
    expect(t.prior).toBe(2100)
    expect(t.direction).toBe('flat')
    expect(t.nCurrent).toBe(4)
  })

  it('windows by DATE, not by position, so sparse series still align', () => {
    // Two logged days in the current window and two in the prior. Taking "the
    // last 14 entries" would put all four in the current window and leave the
    // prior one empty.
    const history = [
      { iso: daysBefore(20), steps: 5000 },
      { iso: daysBefore(16), steps: 5000 },
      { iso: daysBefore(5), steps: 9000 },
      { iso: daysBefore(1), steps: 9000 },
    ]
    const t = windowTrend(history, 'steps', { asOf: ASOF })
    expect(t.nCurrent).toBe(2)
    expect(t.nPrior).toBe(2)
    expect(t.current).toBe(9000)
    expect(t.prior).toBe(5000)
  })

  it('excludes anything older than both windows', () => {
    const history = [
      { iso: daysBefore(90), steps: 100 },
      ...flatSeries(28, 9000),
    ]
    const t = windowTrend(history, 'steps', { asOf: ASOF })
    expect(t.nCurrent + t.nPrior).toBe(28)
    expect(t.prior).toBe(9000)
  })

  it('returns nulls rather than NaN when a window is empty', () => {
    const t = windowTrend([{ iso: daysBefore(2), steps: 9000 }], 'steps', { asOf: ASOF })
    expect(t.current).toBe(9000)
    expect(t.prior).toBeNull()
    expect(t.delta).toBeNull()
    expect(t.direction).toBe('none')
  })

  it('ignores rows with no iso date', () => {
    const t = windowTrend([{ date: '10-14', steps: 9000 }], 'steps', { asOf: ASOF })
    expect(t.current).toBeNull()
    expect(t.nCurrent).toBe(0)
  })

  it('handles an empty or missing history', () => {
    expect(windowTrend([], 'steps', { asOf: ASOF }).current).toBeNull()
    expect(windowTrend(undefined, 'steps', { asOf: ASOF }).current).toBeNull()
  })

  it('crosses a year boundary, which an MM-DD label cannot', () => {
    const asOf = new Date(2027, 0, 7, 12, 0, 0) // 7 Jan 2027
    const ymdOf = (n) => { const d = new Date(asOf); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
    const history = [
      ...Array.from({ length: 14 }, (_, i) => ({ iso: ymdOf(27 - i), steps: 6000 })), // Dec 2026
      ...Array.from({ length: 14 }, (_, i) => ({ iso: ymdOf(13 - i), steps: 9000 })), // late Dec–Jan
    ]
    const t = windowTrend(history, 'steps', { asOf })
    expect(t.nCurrent).toBe(14)
    expect(t.nPrior).toBe(14)
    expect(t.direction).toBe('up')
  })
})

describe('hasTrend', () => {
  it('needs three logged days on both sides', () => {
    const thin = { nCurrent: 2, nPrior: 9, direction: 'up' }
    const ok = { nCurrent: 3, nPrior: 3, direction: 'up' }
    expect(hasTrend(thin)).toBe(false)
    expect(hasTrend(ok)).toBe(true)
  })

  it('is false when there is no direction to report', () => {
    expect(hasTrend({ nCurrent: 9, nPrior: 9, direction: 'none' })).toBe(false)
    expect(hasTrend(null)).toBe(false)
  })
})
