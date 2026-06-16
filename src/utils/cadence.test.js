import { describe, it, expect } from 'vitest'
import { cadenceLabel, CADENCE_OPTIONS } from './cadence'

describe('cadenceLabel', () => {
  it('labels the common intervals', () => {
    expect(cadenceLabel(1)).toBe('Weekly')
    expect(cadenceLabel(2)).toBe('Biweekly')
    expect(cadenceLabel(3)).toBe('Every 3 weeks')
    expect(cadenceLabel(4)).toBe('Every 4 weeks')
  })

  it('defaults junk/empty values to Weekly', () => {
    expect(cadenceLabel(0)).toBe('Weekly')
    expect(cadenceLabel(undefined)).toBe('Weekly')
    expect(cadenceLabel(null)).toBe('Weekly')
  })
})

describe('CADENCE_OPTIONS', () => {
  it('offers weekly through every-4-weeks', () => {
    expect(CADENCE_OPTIONS.map(o => o.weeks)).toEqual([1, 2, 3, 4])
    CADENCE_OPTIONS.forEach(o => expect(o.label).toBe(cadenceLabel(o.weeks)))
  })
})
