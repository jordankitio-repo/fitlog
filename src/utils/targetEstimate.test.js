import { describe, it, expect } from 'vitest'
import { estimateTargets, ACTIVITY_LEVELS, PACES } from './targetEstimate'

const baseMale = { sex: 'male', age: 30, height: 71, heightUnit: 'in', weightUnit: 'lbs', activity: 'moderate' }

describe('estimateTargets', () => {
  it('maintains when goal ≈ current weight', () => {
    const t = estimateTargets({ ...baseMale, weight: 176, goalWeight: 176, pace: 'moderate' })
    expect(t.direction).toBe('maintain')
    expect(t.calories).toBe(t.maintenanceCalories)
    expect(t.weeksToGoal).toBeNull()
  })

  it('cuts below maintenance when goal < current, with a timeline', () => {
    const t = estimateTargets({ ...baseMale, weight: 198, goalWeight: 176, pace: 'moderate' })
    expect(t.direction).toBe('lose')
    expect(t.calories).toBeLessThan(t.maintenanceCalories)
    expect(t.weeklyChange).toBeGreaterThan(0)
    expect(t.weeksToGoal).toBeGreaterThan(0)
  })

  it('surpluses above maintenance when goal > current', () => {
    const t = estimateTargets({ ...baseMale, weight: 154, goalWeight: 172, pace: 'moderate' })
    expect(t.direction).toBe('gain')
    expect(t.calories).toBeGreaterThan(t.maintenanceCalories)
  })

  it('bases protein on GOAL weight, not current (no overprescription for high-fat clients)', () => {
    // 100 kg now, goal 75 kg. Protein should track the 75 kg goal, not 100 kg.
    const t = estimateTargets({ sex: 'male', age: 35, height: 178, heightUnit: 'cm', weight: 100, goalWeight: 75, weightUnit: 'kg', activity: 'light', pace: 'moderate' })
    // 2.2 g/kg of 75 kg ≈ 165 g; current-weight basis would be ~220 g.
    expect(t.protein).toBeGreaterThan(150)
    expect(t.protein).toBeLessThan(185)
  })

  it('faster pace = bigger deficit = fewer weeks', () => {
    const gentle = estimateTargets({ ...baseMale, weight: 198, goalWeight: 176, pace: 'gentle' })
    const aggressive = estimateTargets({ ...baseMale, weight: 198, goalWeight: 176, pace: 'aggressive' })
    expect(aggressive.calories).toBeLessThan(gentle.calories)
    expect(aggressive.weeksToGoal).toBeLessThan(gentle.weeksToGoal)
  })

  it('never defaults below BMR / 1200 kcal floor', () => {
    // Small older woman, aggressive cut — would push very low without the floor.
    const t = estimateTargets({ sex: 'female', age: 60, height: 150, heightUnit: 'cm', weight: 60, goalWeight: 48, weightUnit: 'kg', activity: 'sedentary', pace: 'aggressive' })
    expect(t.calories).toBeGreaterThanOrEqual(1200)
  })

  it('macros reconcile to the calorie total (±6%)', () => {
    const t = estimateTargets({ ...baseMale, weight: 198, goalWeight: 176, pace: 'moderate' })
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9
    expect(Math.abs(fromMacros - t.calories) / t.calories).toBeLessThan(0.06)
  })

  it('female BMR < male, all else equal', () => {
    const common = { age: 30, height: 170, heightUnit: 'cm', weight: 70, goalWeight: 70, weightUnit: 'kg', activity: 'moderate' }
    expect(estimateTargets({ ...common, sex: 'female' }).maintenanceCalories)
      .toBeLessThan(estimateTargets({ ...common, sex: 'male' }).maintenanceCalories)
  })

  it('blank goal weight ⇒ maintenance', () => {
    const t = estimateTargets({ ...baseMale, weight: 176, goalWeight: '' })
    expect(t.direction).toBe('maintain')
    expect(t.calories).toBe(t.maintenanceCalories)
  })

  it('returns null on incomplete input', () => {
    expect(estimateTargets({ ...baseMale, weight: 0, goalWeight: 160 })).toBeNull()
    expect(estimateTargets({ sex: 'male', age: 30, weight: 80 })).toBeNull()
    expect(estimateTargets({})).toBeNull()
  })

  it('switches to Katch-McArdle when body fat % is given, protein on lean mass', () => {
    const common = { sex: 'male', age: 30, height: 180, heightUnit: 'cm', weight: 90, goalWeight: 80, weightUnit: 'kg', activity: 'moderate', pace: 'moderate' }
    const mifflin = estimateTargets(common)
    const katch = estimateTargets({ ...common, bodyFat: 25 })
    expect(mifflin.method).toBe('mifflin')
    expect(katch.method).toBe('katch')
    // 90kg @ 25% BF → 67.5kg LBM; protein 2.4 g/kg LBM ≈ 162 g.
    expect(katch.protein).toBeGreaterThan(150)
    expect(katch.protein).toBeLessThan(175)
  })

  it('ignores an out-of-range body fat % (falls back to Mifflin)', () => {
    const t = estimateTargets({ sex: 'male', age: 30, height: 180, heightUnit: 'cm', weight: 90, goalWeight: 80, weightUnit: 'kg', bodyFat: 0 })
    expect(t.method).toBe('mifflin')
  })

  it('exposes activity + pace option lists', () => {
    expect(ACTIVITY_LEVELS.length).toBe(5)
    expect(PACES.map((p) => p.key)).toEqual(['gentle', 'moderate', 'aggressive'])
  })
})
