import { describe, it, expect } from 'vitest'
import { formatMinutes, stepsGoalSub, weightDeltaSub } from './metricRows'

describe('formatMinutes', () => {
  it('keeps minutes under an hour', () => {
    expect(formatMinutes(35)).toBe('35 min')
    expect(formatMinutes(0)).toBe('0 min')
  })
  it('switches to hours past 60', () => {
    expect(formatMinutes(78)).toBe('1 hr 18 min')
    expect(formatMinutes(113)).toBe('1 hr 53 min')
  })
  it('drops a zero remainder', () => {
    expect(formatMinutes(120)).toBe('2 hr')
  })
  it('survives junk', () => {
    expect(formatMinutes(null)).toBe('0 min')
    expect(formatMinutes('45')).toBe('45 min')
  })
})

describe('stepsGoalSub', () => {
  it('states progress against the target', () => {
    expect(stepsGoalSub(8800, 9000)).toBe('98% of 9,000')
    expect(stepsGoalSub(12000, 10000)).toBe('120% of 10,000')
  })
  it('is null with no usable target', () => {
    expect(stepsGoalSub(8800, null)).toBeNull()
    expect(stepsGoalSub(8800, 0)).toBeNull()
  })
})

describe('weightDeltaSub', () => {
  const today = (weight, unit = 'kg') => ({ weight, unit, logged_date: '2026-10-24' })

  it('names yesterday when the last weigh-in was yesterday', () => {
    expect(weightDeltaSub(today(70.5), { weight: 70.7, unit: 'kg', logged_date: '2026-10-23' }))
      .toBe('−0.2 kg vs yesterday')
  })
  it('dates an older weigh-in', () => {
    expect(weightDeltaSub(today(71.9), { weight: 70.5, unit: 'kg', logged_date: '2026-10-20' }))
      .toBe('+1.4 kg vs Oct 20')
  })
  it('converts the previous weigh-in into today’s unit', () => {
    // 155.4 lbs is 70.49 kg, so 70.5 kg reads as no change
    expect(weightDeltaSub(today(70.5), { weight: 155.4, unit: 'lbs', logged_date: '2026-10-23' }))
      .toBe('No change vs yesterday')
  })
  it('crosses a month boundary', () => {
    expect(weightDeltaSub({ weight: 70, unit: 'kg', logged_date: '2026-11-01' }, { weight: 70.3, unit: 'kg', logged_date: '2026-10-31' }))
      .toBe('−0.3 kg vs yesterday')
  })
  it('is null without a previous weigh-in', () => {
    expect(weightDeltaSub(today(70.5), null)).toBeNull()
  })
})
