import { describe, it, expect } from 'vitest'
import { energyBalanceRead, linearFit } from './energyBalanceRead'
import { toLocalDateString } from './dateHelpers'

function dateAgo(days) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - days)
  return toLocalDateString(d)
}
// Calories: one entry per day for `days` days (0 = today), constant or fn(i).
function cals(days, cal) {
  return Array.from({ length: days }, (_, i) => ({ date: dateAgo(i), calories: typeof cal === 'function' ? cal(i) : cal }))
}
// Weights: linear from startLb (oldest) to endLb (today) across `days`, one/day.
function weights(days, startLb, endLb, unit = 'lbs') {
  return Array.from({ length: days }, (_, i) => {
    const t = (days - 1 - i) / (days - 1) // 0 oldest → 1 newest
    const lb = startLb + (endLb - startLb) * t
    return { date: dateAgo(i), weight: unit === 'kg' ? lb / 2.2046226218 : lb, unit }
  })
}

describe('linearFit', () => {
  it('returns null for <2 points or no x-variance', () => {
    expect(linearFit([{ x: 0, y: 1 }])).toBeNull()
    expect(linearFit([{ x: 5, y: 1 }, { x: 5, y: 2 }])).toBeNull()
  })
  it('recovers a known slope', () => {
    const f = linearFit([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }])
    expect(f.slope).toBeCloseTo(2, 6)
  })
})

describe('energyBalanceRead', () => {
  it('renders nothing without a target', () => {
    expect(energyBalanceRead({ calorieSeries: cals(21, 2000), weightSeries: weights(21, 183, 181), calorieTarget: 0 }).hasTarget).toBe(false)
  })

  it('is insufficient with too few weigh-ins', () => {
    const r = energyBalanceRead({ calorieSeries: cals(21, 2000), weightSeries: weights(6, 183, 182), calorieTarget: 2000 })
    expect(r.hasTarget).toBe(true)
    expect(r.hasData).toBe(false)
    expect(r.windowDays).toBe(21) // insufficient state still carries the window for the header
  })

  it('is insufficient when logging coverage is below 70%', () => {
    // 21-day window but only 10 logged days
    const r = energyBalanceRead({ calorieSeries: cals(10, 2000), weightSeries: weights(21, 183, 181), calorieTarget: 2000 })
    expect(r.hasData).toBe(false)
  })

  it('estimates maintenance above intake during a deficit', () => {
    // lose 2 lb over 20 days at 2,000 → deficit ~350/day → maintenance ~2,350
    const r = energyBalanceRead({ calorieSeries: cals(21, 2000), weightSeries: weights(21, 183, 181), calorieTarget: 2000 })
    expect(r.hasData).toBe(true)
    expect(r.maintenance.mid).toBeGreaterThanOrEqual(2300)
    expect(r.maintenance.mid).toBeLessThanOrEqual(2400)
    expect(r.rateLbPerWk).toBeCloseTo(-0.7, 1)
    expect(r.maintenance.low).toBeLessThan(r.maintenance.high)
  })

  it('reads maintenance ≈ intake when weight is flat', () => {
    const r = energyBalanceRead({ calorieSeries: cals(21, 2000), weightSeries: weights(21, 182, 182), calorieTarget: 2000 })
    expect(r.maintenance.mid).toBe(2000)
    expect(Math.abs(r.rateLbPerWk)).toBeLessThan(0.05)
  })

  it('estimates maintenance below intake during a gain', () => {
    const r = energyBalanceRead({ calorieSeries: cals(21, 2000), weightSeries: weights(21, 180, 182), calorieTarget: 2000 })
    expect(r.maintenance.mid).toBeLessThan(2000)
  })

  it('handles kg weigh-ins (same loss as the lb case → same maintenance)', () => {
    // helper takes lb values, stores them as kg; the util must convert back.
    // 183→181 lb expressed in kg should read maintenance ~2,350, like the lb test.
    const r = energyBalanceRead({ calorieSeries: cals(21, 2000), weightSeries: weights(21, 183, 181, 'kg'), calorieTarget: 2000 })
    expect(r.maintenance.mid).toBeGreaterThanOrEqual(2300)
    expect(r.maintenance.mid).toBeLessThanOrEqual(2400)
  })

  it('exposes logging coverage (logged days / window)', () => {
    // 16 of 21 days logged → ~0.76 coverage (passes the 70% floor)
    const r = energyBalanceRead({ calorieSeries: cals(16, 2000), weightSeries: weights(21, 183, 181), calorieTarget: 2000 })
    expect(r.hasData).toBe(true)
    expect(r.coverage).toBeCloseTo(16 / 21, 2)
  })

  it('computes trajectory when a prior window also qualifies', () => {
    const r = energyBalanceRead({ calorieSeries: cals(42, 2000), weightSeries: weights(42, 186, 182), calorieTarget: 2000 })
    expect(r.trajectory).not.toBeNull()
    expect(typeof r.trajectory.prevMaintenance).toBe('number')
  })

  it('tones the rate "toward" when losing toward a lower goal', () => {
    const r = energyBalanceRead({ calorieSeries: cals(21, 2000), weightSeries: weights(21, 183, 181), calorieTarget: 2000, weightGoal: 175 })
    expect(r.rateTone).toBe('toward')
  })

  it('tones the rate "away" when losing but the goal is above current', () => {
    const r = energyBalanceRead({ calorieSeries: cals(21, 1800), weightSeries: weights(21, 178, 176), calorieTarget: 2000, weightGoal: 185 })
    expect(r.rateTone).toBe('away')
  })

  it('tones the rate "neutral" with no goal set', () => {
    const r = energyBalanceRead({ calorieSeries: cals(21, 2000), weightSeries: weights(21, 183, 181), calorieTarget: 2000 })
    expect(r.rateTone).toBe('neutral')
  })

  it('reports loggedVsTarget', () => {
    const r = energyBalanceRead({ calorieSeries: cals(21, 2080), weightSeries: weights(21, 183, 181), calorieTarget: 2000 })
    expect(r.loggedVsTarget).toBe(80)
  })
})
