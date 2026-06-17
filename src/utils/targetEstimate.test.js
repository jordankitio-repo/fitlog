import { describe, it, expect } from 'vitest'
import { estimateTargets, ACTIVITY_LEVELS, GOALS } from './targetEstimate'

describe('estimateTargets', () => {
  it('computes sensible maintenance macros for a male (imperial)', () => {
    // 176 lb (~80 kg), 71 in (~180 cm), 30 yo, moderate, maintain.
    const t = estimateTargets({ sex: 'male', age: 30, weight: 176, weightUnit: 'lbs', height: 71, heightUnit: 'in', activity: 'moderate', goal: 'maintain' })
    expect(t.calories).toBeGreaterThan(2500)
    expect(t.calories).toBeLessThan(2900)
    expect(t.protein).toBeGreaterThan(130) // ~1.8 g/kg of ~80kg
    expect(t.protein).toBeLessThan(160)
    // macros should roughly reconcile to the calorie total (±5%)
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9
    expect(Math.abs(fromMacros - t.calories) / t.calories).toBeLessThan(0.05)
  })

  it('applies a deficit for lose and a surplus for gain', () => {
    const base = { sex: 'female', age: 28, weight: 65, weightUnit: 'kg', height: 165, heightUnit: 'cm', activity: 'light' }
    const lose = estimateTargets({ ...base, goal: 'lose' })
    const maintain = estimateTargets({ ...base, goal: 'maintain' })
    const gain = estimateTargets({ ...base, goal: 'gain' })
    expect(lose.calories).toBeLessThan(maintain.calories)
    expect(gain.calories).toBeGreaterThan(maintain.calories)
  })

  it('female BMR is lower than male, all else equal', () => {
    const common = { age: 30, weight: 70, weightUnit: 'kg', height: 170, heightUnit: 'cm', activity: 'moderate', goal: 'maintain' }
    const male = estimateTargets({ ...common, sex: 'male' })
    const female = estimateTargets({ ...common, sex: 'female' })
    expect(female.calories).toBeLessThan(male.calories)
  })

  it('respects activity multiplier ordering', () => {
    const common = { sex: 'male', age: 30, weight: 80, weightUnit: 'kg', height: 180, heightUnit: 'cm', goal: 'maintain' }
    const sed = estimateTargets({ ...common, activity: 'sedentary' })
    const ath = estimateTargets({ ...common, activity: 'athlete' })
    expect(ath.calories).toBeGreaterThan(sed.calories)
  })

  it('never drops below a 1200 kcal floor', () => {
    const t = estimateTargets({ sex: 'female', age: 60, weight: 45, weightUnit: 'kg', height: 150, heightUnit: 'cm', activity: 'sedentary', goal: 'lose' })
    expect(t.calories).toBeGreaterThanOrEqual(1200)
  })

  it('returns null on incomplete/invalid input', () => {
    expect(estimateTargets({ sex: 'male', age: 30, weight: 0, height: 180 })).toBeNull()
    expect(estimateTargets({ sex: 'male', age: 30, weight: 80 })).toBeNull() // no height
    expect(estimateTargets({})).toBeNull()
  })

  it('exposes activity + goal option lists', () => {
    expect(ACTIVITY_LEVELS.length).toBe(5)
    expect(GOALS.map((g) => g.key)).toEqual(['lose', 'maintain', 'gain'])
  })
})
