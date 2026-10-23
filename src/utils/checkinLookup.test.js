import { describe, it, expect } from 'vitest'
import { latestCheckIn, coversPeriod } from './checkinLookup'
import { checkinPeriod } from './dateHelpers'

// Thursday 22 Oct 2026. That week's Sunday is Oct 18; the two-week block
// containing it starts Oct 11; the four-week block starts Sep 27.
const THU = new Date('2026-10-22T12:00:00')

describe('latestCheckIn', () => {
  it('takes the most recent regardless of the order it is given them', () => {
    const rows = [{ week_of: '2026-10-04' }, { week_of: '2026-10-18' }, { week_of: '2026-10-11' }]
    expect(latestCheckIn(rows).week_of).toBe('2026-10-18')
  })
  it('is null with nothing to pick from, and ignores rows with no week', () => {
    expect(latestCheckIn([])).toBeNull()
    expect(latestCheckIn([{ id: 1 }])).toBeNull()
  })
})

describe('coversPeriod', () => {
  // THE REGRESSION. Filed Thursday under weekly (week_of Oct 18); the coach
  // switches to biweekly the next day, whose period runs Oct 11-24. The old
  // `week_of === period.weekOf` test said no — it wanted Oct 11 — so a check-in
  // filed the day before read as missing.
  it('still counts a weekly check-in after the coach switches to biweekly', () => {
    const filed = { week_of: '2026-10-18' }
    expect(coversPeriod(filed, checkinPeriod(1, THU))).toBe(true)
    expect(coversPeriod(filed, checkinPeriod(2, THU))).toBe(true)
    expect(coversPeriod(filed, checkinPeriod(4, THU))).toBe(true)
  })

  it('does not count one filed before the current period began', () => {
    const old = { week_of: '2026-10-04' }
    expect(coversPeriod(old, checkinPeriod(1, THU))).toBe(false)  // period starts Oct 18
    expect(coversPeriod(old, checkinPeriod(2, THU))).toBe(false)  // period starts Oct 11
    expect(coversPeriod(old, checkinPeriod(4, THU))).toBe(true)   // period starts Sep 27
  })

  it('is false for nothing at all', () => {
    expect(coversPeriod(null, checkinPeriod(1, THU))).toBe(false)
    expect(coversPeriod({ week_of: '2026-10-18' }, null)).toBe(false)
  })
})
