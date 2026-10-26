import { describe, it, expect } from 'vitest'
import { todayCells } from './todayCells'

const totals = { calories: 1609, protein: 129, carbs: 169, fat: 47 }
const targets = { calories: 1850, protein: 140, carbs: 165, fat: 60, cardio_minutes: 35, steps: 9000, weight_goal: 69.5, weight_goal_unit: 'kg' }

describe('todayCells', () => {
  it('reads each macro against its target, short enough for a quarter of a phone', () => {
    const { macros } = todayCells({ totals, targets, cardioMinutes: 0, steps: null, weight: null })
    expect(macros.map(m => m.key)).toEqual(['calories', 'protein', 'carbs', 'fat'])
    expect(macros[0]).toMatchObject({ value: '1,609', sub: 'of 1,850', pct: 87 })
    expect(macros[1]).toMatchObject({ value: '129g', sub: 'of 140g' })
  })

  it('drops calories when the coach hides them', () => {
    const { macros } = todayCells({ totals, targets, hideCalories: true, cardioMinutes: 0, steps: null, weight: null })
    expect(macros.map(m => m.key)).toEqual(['protein', 'carbs', 'fat'])
  })

  it('says when there is no target rather than leaving the sub blank', () => {
    const { macros, activity } = todayCells({ totals, targets: null, cardioMinutes: 0, steps: null, weight: null })
    expect(macros.every(m => m.sub === 'No target' && m.pct === null)).toBe(true)
    expect(activity.find(a => a.key === 'cardio').sub).toBe('No target')
  })

  it('shows a missing reading as a dash, and no bar for it', () => {
    const { activity } = todayCells({ totals, targets, cardioMinutes: 0, steps: null, weight: null })
    const steps = activity.find(a => a.key === 'steps')
    const weight = activity.find(a => a.key === 'weight')
    expect(steps).toMatchObject({ value: '—', pct: null })
    expect(weight).toMatchObject({ value: '—', sub: 'Not logged' })
  })

  it('grades weight against the goal in the goal unit, within 1 counting as there', () => {
    const near = todayCells({ totals, targets, cardioMinutes: 0, steps: 0, weight: { weight: 70.2, unit: 'kg' } })
    expect(near.activity[2]).toMatchObject({ sub: 'At goal', subTone: 'success' })
    const far = todayCells({ totals, targets, cardioMinutes: 0, steps: 0, weight: { weight: 160, unit: 'lbs' } })
    // 160 lbs is 72.6 kg: 3.1 to go against a 69.5 kg goal.
    expect(far.activity[2]).toMatchObject({ sub: '3.1 to go', subTone: null })
  })
})
