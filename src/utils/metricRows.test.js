import { describe, it, expect } from 'vitest'
import { formatMinutes, stepsGoalSub, cardioGoalSub, convertLengthValue } from './metricRows'

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

describe('cardioGoalSub', () => {
  it('states the day against the target', () => {
    expect(cardioGoalSub(113, 35)).toBe('323% of 35 min')
    expect(cardioGoalSub(30, 90)).toBe('33% of 1 hr 30 min')
  })
  it('is null with no target', () => {
    expect(cardioGoalSub(113, null)).toBeNull()
  })
})

describe('convertLengthValue', () => {
  it('converts inches and centimetres both ways', () => {
    expect(convertLengthValue('30', 'in', 'cm')).toBe('76.2')
    expect(convertLengthValue('76.2', 'cm', 'in')).toBe('30')
  })
  it('leaves blank, partial and same-unit input alone', () => {
    expect(convertLengthValue('', 'in', 'cm')).toBe('')
    expect(convertLengthValue('-', 'in', 'cm')).toBe('-')
    expect(convertLengthValue('30', 'cm', 'cm')).toBe('30')
  })
})
