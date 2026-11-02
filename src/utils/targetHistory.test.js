import { describe, expect, it } from 'vitest'
import { makeTargetLookup, targetFn, constantLookup, resolveDay, weekdayOf, weeklyAverage, targetRange, setsAnyDay, targetsOnDay, dayTypeLabel } from './targetHistory'

const versions = [
  { effective_date: '2026-10-15', calories: 1800, protein: 150 },
  { effective_date: '1970-01-01', calories: 2100, protein: 140 },
]

describe('makeTargetLookup', () => {
  const at = makeTargetLookup(versions)
  it('answers the first plan for days before any change', () => {
    expect(at('2026-09-01').calories).toBe(2100)
  })
  it('a change applies from its own date', () => {
    expect(at('2026-10-14').calories).toBe(2100)
    expect(at('2026-10-15').calories).toBe(1800)
    expect(at('2026-12-01').calories).toBe(1800)
  })
  it('is order-independent', () => {
    expect(makeTargetLookup([...versions].reverse())('2026-10-15').calories).toBe(1800)
  })
  it('answers null with no history', () => {
    expect(makeTargetLookup([])('2026-10-15')).toBeNull()
    expect(makeTargetLookup([{ effective_date: '2026-10-15', calories: 1 }])('2026-10-14')).toBeNull()
  })
})

describe('targetFn', () => {
  it('reads one field from a lookup, 0 where there is none', () => {
    const t = targetFn(makeTargetLookup(versions), 'protein')
    expect(t('2026-10-01')).toBe(140)
    expect(t('2026-10-20')).toBe(150)
    expect(targetFn(makeTargetLookup([]))('2026-10-20')).toBe(0)
  })
  it('passes a plain number through for every day', () => {
    expect(targetFn(2000)('2026-01-01')).toBe(2000)
    expect(targetFn('2000')('2026-01-01')).toBe(2000)
    expect(targetFn(null)('2026-01-01')).toBe(0)
  })
  it('constantLookup answers the current plan everywhere', () => {
    expect(targetFn(constantLookup({ calories: 1900 }))('1999-01-01')).toBe(1900)
    expect(targetFn(constantLookup(null))('1999-01-01')).toBe(0)
  })
})

// Per-weekday targets (targets.day_plans).
describe('resolveDay', () => {
  // 2026-11-02 is a Monday.
  const plan = {
    calories: 2000, protein: 150, carbs: 200, fat: 67, cardio_minutes: null, steps: 10000,
    day_plans: [
      { name: 'Training', days: [1, 3, 5], calories: 2400, carbs: 280, cardio_minutes: 30 },
      { name: 'Refeed', days: [6], carbs: 350, steps: '' },
    ],
  }
  it('reads the weekday off the calendar date', () => {
    expect(weekdayOf('2026-11-01')).toBe(0)
    expect(weekdayOf('2026-11-02')).toBe(1)
    expect(weekdayOf('2026-11-07')).toBe(6)
  })
  it('lays the day type over the base; blank fields inherit', () => {
    expect(resolveDay(plan, '2026-11-02')).toMatchObject({ day_type: 'Training', calories: 2400, protein: 150, carbs: 280, cardio_minutes: 30, steps: 10000 })
    expect(resolveDay(plan, '2026-11-07')).toMatchObject({ day_type: 'Refeed', calories: 2000, carbs: 350, steps: 10000 })
  })
  it('a day in no day type is the base', () => {
    expect(resolveDay(plan, '2026-11-03')).toMatchObject({ day_type: null, calories: 2000, carbs: 200 })
  })
  it('ignores malformed day_plans', () => {
    expect(resolveDay({ calories: 2000, day_plans: 'x' }, '2026-11-02').calories).toBe(2000)
    expect(resolveDay({ calories: 2000, day_plans: [{ name: 'X', days: 'y', calories: 9 }] }, '2026-11-02').calories).toBe(2000)
  })
  it('the history lookup applies the weekday of the asked date', () => {
    const at = makeTargetLookup([{ effective_date: '1970-01-01', ...plan }])
    expect(at('2026-11-02').calories).toBe(2400)
    expect(at('2026-11-03').calories).toBe(2000)
    expect(constantLookup(plan)('2026-11-04').calories).toBe(2400)
  })
  it('weeklyAverage and targetRange span the week', () => {
    expect(weeklyAverage(plan, 'calories')).toBe(Math.round((2400 * 3 + 2000 * 4) / 7))
    expect(targetRange(plan, 'carbs')).toEqual({ min: 200, max: 350 })
    expect(targetRange({ calories: 2000 }, 'calories')).toEqual({ min: 2000, max: 2000 })
    // Cardio is set only on training days: no single weekly number for it.
    expect(weeklyAverage(plan, 'cardio_minutes')).toBeNull()
  })
  it('setsAnyDay sees a target set only on a day type', () => {
    expect(setsAnyDay(plan, 'cardio_minutes')).toBe(true)
    expect(setsAnyDay({ calories: 2000, day_plans: [] }, 'cardio_minutes')).toBe(false)
  })
})

describe('targetsOnDay / dayTypeLabel', () => {
  const current = { calories: 2000, carbs: 200, weight_goal: 70, day_plans: [{ name: 'Training', days: [1], carbs: 280 }] }
  it('keeps the weight goal and applies the day', () => {
    expect(targetsOnDay(current, null, '2026-11-02')).toMatchObject({ weight_goal: 70, carbs: 280, day_type: 'Training' })
    expect(targetsOnDay(current, null, '2026-11-03')).toMatchObject({ carbs: 200, day_type: null })
  })
  it('prefers the history lookup for the day', () => {
    const lookup = makeTargetLookup([{ effective_date: '1970-01-01', calories: 2500, carbs: 300, day_plans: [] }])
    expect(targetsOnDay(current, lookup, '2026-11-02')).toMatchObject({ calories: 2500, carbs: 300, weight_goal: 70, day_type: null })
  })
  it('labels', () => {
    expect(dayTypeLabel('Training')).toBe('Training day')
    expect(dayTypeLabel('Rest day')).toBe('Rest day')
    expect(dayTypeLabel('')).toBe('')
  })
})

describe('a 0 in a day type', () => {
  const plan = { calories: 2000, cardio_minutes: 30, day_plans: [{ name: 'Rest', days: [0, 6], cardio_minutes: 0 }] }
  it('drops the target on those days', () => {
    expect(resolveDay(plan, '2026-11-01').cardio_minutes).toBe(0)
    expect(targetFn(constantLookup(plan), 'cardio_minutes')('2026-11-01')).toBe(0)
    expect(targetFn(constantLookup(plan), 'cardio_minutes')('2026-11-02')).toBe(30)
  })
  it('is not "this metric is graded"', () => {
    expect(setsAnyDay({ calories: 2000, day_plans: [{ name: 'Rest', days: [0], steps: 0 }] }, 'steps')).toBe(false)
  })
})
