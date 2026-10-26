import { describe, it, expect } from 'vitest'
import { checkTargets } from './targetChecks'

describe('checkTargets', () => {
  it('accepts blanks: a blank target is simply not tracked', () => {
    expect(checkTargets({}).errors).toEqual({})
  })

  it('refuses a negative macro, the bug that let -20 g of fat through', () => {
    expect(checkTargets({ fat: '-20' }).errors.fat).toBeTruthy()
  })

  it('refuses a fraction where the field takes whole numbers', () => {
    expect(checkTargets({ steps: '9000.5' }).errors.steps).toBeTruthy()
  })

  it('bounds the weight goal in the unit it is written in', () => {
    expect(checkTargets({ weight_goal: '30', weight_goal_unit: 'kg' }).errors.weight_goal).toBeUndefined()
    expect(checkTargets({ weight_goal: '30', weight_goal_unit: 'lbs' }).errors.weight_goal).toBeTruthy()
  })

  it('adds up the macros once all three are in', () => {
    expect(checkTargets({ protein: '120', carbs: '111' }).macroCalories).toBeNull()
    expect(checkTargets({ protein: '120', carbs: '111', fat: '44' }).macroCalories).toBe(1320)
  })

  it('flags calories that the macros do not add up to', () => {
    const macros = { protein: '120', carbs: '111', fat: '44' }
    expect(checkTargets({ ...macros, calories: '1320' }).mismatch).toBe(false)
    expect(checkTargets({ ...macros, calories: '1370' }).mismatch).toBe(false) // within 5%
    expect(checkTargets({ ...macros, calories: '2500' }).mismatch).toBe(true)
  })
})
