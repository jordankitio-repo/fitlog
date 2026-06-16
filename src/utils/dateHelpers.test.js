import { describe, it, expect } from 'vitest'
import {
  toLocalDateString,
  getCurrentWeekSunday,
  parseLocalDateString,
  addDays,
  getCurrentWeekStart,
  getWeeklyReportRange,
  getDatesInRange,
  formatDateRange,
  checkinPeriod,
  checkinPeriodStart,
} from './dateHelpers'

describe('toLocalDateString', () => {
  it('formats a date object to YYYY-MM-DD', () => {
    expect(toLocalDateString(new Date(2026, 0, 15))).toBe('2026-01-15')
  })

  it('pads month and day with leading zeros', () => {
    expect(toLocalDateString(new Date(2026, 2, 5))).toBe('2026-03-05')
  })
})

describe('getCurrentWeekSunday', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(getCurrentWeekSunday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a Sunday', () => {
    const result = getCurrentWeekSunday()
    const [year, month, day] = result.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    expect(date.getDay()).toBe(0)
  })

  it('returned Sunday is not in the future', () => {
    const result = getCurrentWeekSunday()
    const [year, month, day] = result.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    expect(date <= new Date()).toBe(true)
  })
})

describe('parseLocalDateString', () => {
  it('parses YYYY-MM-DD to a Date at noon local time', () => {
    const d = parseLocalDateString('2026-06-15')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(12)
  })
})

describe('addDays', () => {
  it('adds positive days', () => {
    const base = new Date(2026, 0, 1)
    const result = addDays(base, 5)
    expect(result.getDate()).toBe(6)
    expect(result.getMonth()).toBe(0)
  })

  it('adds negative days', () => {
    const base = new Date(2026, 0, 10)
    const result = addDays(base, -3)
    expect(result.getDate()).toBe(7)
  })

  it('crosses month boundary', () => {
    const base = new Date(2026, 0, 30)
    const result = addDays(base, 3)
    expect(toLocalDateString(result)).toBe('2026-02-02')
  })

  it('normalizes result to noon local time', () => {
    const base = new Date(2026, 0, 1, 23, 59)
    const result = addDays(base, 1)
    expect(result.getHours()).toBe(12)
    expect(result.getMinutes()).toBe(0)
  })
})

describe('getCurrentWeekStart', () => {
  it('returns the Sunday for the provided week', () => {
    const result = getCurrentWeekStart(new Date(2026, 5, 17))
    expect(toLocalDateString(result)).toBe('2026-06-14')
    expect(result.getDay()).toBe(0)
  })

  it('returns the same date when provided date is Sunday', () => {
    const result = getCurrentWeekStart(new Date(2026, 5, 14))
    expect(toLocalDateString(result)).toBe('2026-06-14')
  })
})

describe('getWeeklyReportRange', () => {
  it('returns the previous Sunday through Saturday for the provided week', () => {
    const result = getWeeklyReportRange(new Date(2026, 5, 17))
    expect(result.startDate).toBe('2026-06-07')
    expect(result.endDate).toBe('2026-06-13')
    expect(result.label).toBe('June 7 - June 13, 2026')
  })

  it('includes Date objects for start and end', () => {
    const result = getWeeklyReportRange(new Date(2026, 5, 17))
    expect(result.start).toBeInstanceOf(Date)
    expect(result.end).toBeInstanceOf(Date)
  })
})

describe('getDatesInRange', () => {
  it('returns every date in an inclusive range', () => {
    const start = parseLocalDateString('2026-06-07')
    const end = parseLocalDateString('2026-06-10')
    expect(getDatesInRange(start, end)).toEqual([
      '2026-06-07',
      '2026-06-08',
      '2026-06-09',
      '2026-06-10',
    ])
  })

  it('returns one date when start and end are the same day', () => {
    const date = parseLocalDateString('2026-06-07')
    expect(getDatesInRange(date, date)).toEqual(['2026-06-07'])
  })
})

describe('formatDateRange', () => {
  it('formats a range in the same month', () => {
    expect(formatDateRange(new Date(2026, 5, 7), new Date(2026, 5, 13))).toBe('June 7 - June 13, 2026')
  })

  it('formats a range across months in the same year', () => {
    expect(formatDateRange(new Date(2026, 4, 31), new Date(2026, 5, 6))).toBe('May 31 - June 6, 2026')
  })

  it('formats a range across years', () => {
    expect(formatDateRange(new Date(2025, 11, 28), new Date(2026, 0, 3))).toBe('December 28, 2025 - January 3, 2026')
  })
})

describe('checkinPeriod / checkinPeriodStart', () => {
  it('weekly (interval 1) == the current calendar week, backward compatible', () => {
    const d = new Date(2026, 5, 17) // Wed Jun 17 2026
    expect(checkinPeriod(1, d).weekOf).toBe(toLocalDateString(getCurrentWeekStart(d)))
    expect(checkinPeriodStart(1, d).getDay()).toBe(0) // a Sunday
  })

  it('weekly due window opens Thursday (day 4), not before', () => {
    const sunday = checkinPeriodStart(1, new Date(2026, 5, 17))
    expect(checkinPeriod(1, sunday).dueWindow).toBe(false)            // Sun, day 0
    expect(checkinPeriod(1, addDays(sunday, 3)).dueWindow).toBe(false) // Wed, day 3
    expect(checkinPeriod(1, addDays(sunday, 4)).dueWindow).toBe(true)  // Thu, day 4
  })

  it('biweekly period starts on a Sunday and spans 14 days', () => {
    const s = checkinPeriodStart(2, new Date(2026, 5, 17))
    expect(s.getDay()).toBe(0)
    const p = checkinPeriod(2, s)
    expect(p.weekOf).toBe(toLocalDateString(s))
    expect(p.end.getTime()).toBe(addDays(s, 13).getTime())
  })

  it('biweekly folds two weeks into one period, then advances', () => {
    const s = checkinPeriodStart(2, new Date(2026, 5, 17))
    expect(checkinPeriod(2, addDays(s, 7)).weekOf).toBe(toLocalDateString(s))   // week 2, same period
    expect(checkinPeriod(2, addDays(s, 13)).weekOf).toBe(toLocalDateString(s))  // last day, same period
    expect(checkinPeriod(2, addDays(s, 14)).weekOf).toBe(toLocalDateString(addDays(s, 14))) // next period
  })

  it('biweekly due window opens on day 11 (Thu of the final week)', () => {
    const s = checkinPeriodStart(2, new Date(2026, 5, 17))
    expect(checkinPeriod(2, addDays(s, 10)).dueWindow).toBe(false)
    expect(checkinPeriod(2, addDays(s, 11)).dueWindow).toBe(true)
  })

  it('clamps junk intervals to weekly', () => {
    const d = new Date(2026, 5, 17)
    expect(checkinPeriod(0, d).weekOf).toBe(checkinPeriod(1, d).weekOf)
    expect(checkinPeriod(undefined, d).weekOf).toBe(checkinPeriod(1, d).weekOf)
  })
})
