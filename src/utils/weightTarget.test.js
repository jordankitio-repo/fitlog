import { describe, it, expect } from 'vitest'
import { computeWeightTarget, convertWeight, normUnit } from './weightTarget'

// Ascending series helper: weights on consecutive days from 2026-07-01.
const series = (weights, unit = 'kg') =>
  weights.map((w, i) => {
    const d = String(i + 1).padStart(2, '0')
    return { iso: `2026-07-${d}`, date: `07-${d}`, weight: w, unit }
  })

describe('normUnit / convertWeight', () => {
  it('treats anything not kg as lbs', () => {
    expect(normUnit('kg')).toBe('kg')
    expect(normUnit('lb')).toBe('lbs')
    expect(normUnit('lbs')).toBe('lbs')
    expect(normUnit('')).toBe('lbs')
    expect(normUnit(undefined)).toBe('lbs')
  })

  it('converts lbs↔kg and is a no-op within a unit', () => {
    expect(convertWeight(175, 'lbs', 'kg')).toBeCloseTo(79.38, 1)
    expect(convertWeight(79.38, 'kg', 'lbs')).toBeCloseTo(175, 0)
    expect(convertWeight(80, 'kg', 'kg')).toBe(80)
  })
})

describe('computeWeightTarget', () => {
  it('returns null with no goal or no weigh-ins', () => {
    expect(computeWeightTarget({ weightHistory: series([78, 77]), weightGoal: '' })).toBeNull()
    expect(computeWeightTarget({ weightHistory: [], weightGoal: 75 })).toBeNull()
    expect(computeWeightTarget({ weightHistory: series([78]), weightGoal: 0 })).toBeNull()
  })

  it('converts a lbs goal into the kg series unit for the reference line', () => {
    // Weigh-ins in kg, goal set in lbs — the classic mismatch on the real data.
    const r = computeWeightTarget({ weightHistory: series([80, 79, 78]), weightGoal: 172, weightGoalUnit: 'lbs' })
    expect(r.displayUnit).toBe('kg')
    expect(r.goal).toBeCloseTo(78.0, 1) // 172 lb ≈ 78.0 kg
  })

  it('marks the first weigh-in that reaches a cut goal (moving down)', () => {
    const r = computeWeightTarget({ weightHistory: series([73, 72.5, 72, 71.4, 71, 70.6]), weightGoal: 71.5, weightGoalUnit: 'kg' })
    expect(r.direction).toBe('down')
    expect(r.reached).toBe(true)
    expect(r.reachedIndex).toBe(3) // 71.4 is the first ≤ 71.5
    expect(r.reachedIso).toBe('2026-07-04')
  })

  it('stays "reached" after overshooting past the goal', () => {
    // Dips to goal at index 2, then bounces back above it — still reached.
    const r = computeWeightTarget({ weightHistory: series([73, 72, 71, 71.8, 72]), weightGoal: 71, weightGoalUnit: 'kg' })
    expect(r.reached).toBe(true)
    expect(r.reachedIndex).toBe(2)
  })

  it('handles a gain goal (moving up) and reports remaining distance when not reached', () => {
    const r = computeWeightTarget({ weightHistory: series([80.8, 81, 81.2, 81.6]), weightGoal: 83, weightGoalUnit: 'kg' })
    expect(r.direction).toBe('up')
    expect(r.reached).toBe(false)
    expect(r.reachedIndex).toBe(-1)
    expect(r.remainingAbs).toBeCloseTo(1.4, 1) // 83 − 81.6
  })

  it('treats an at-goal maintenance series as reached immediately', () => {
    const r = computeWeightTarget({ weightHistory: series([78, 78.2, 77.9]), weightGoal: 78, weightGoalUnit: 'kg' })
    expect(r.direction).toBe('maintain')
    expect(r.reached).toBe(true)
    expect(r.reachedIndex).toBe(0)
  })
})
