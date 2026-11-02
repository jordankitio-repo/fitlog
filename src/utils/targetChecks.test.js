import { describe, it, expect } from 'vitest'
import { checkTargets, checkDayPlans, dayPlansHaveErrors, dayPlansToRow, dayPlansFromRow, emptyDayPlan, toggleDayPlanDay, sameDayPlans , dayPlanDaysLabel } from './targetChecks'

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

describe('day types', () => {
  const base = { calories: '2000', protein: '150', carbs: '200', fat: '67', cardio_minutes: '', steps: '10000' }
  const training = { ...emptyDayPlan(), name: 'Training', days: [1, 3], carbs: '280' }

  it('checks a type on its merged values', () => {
    const [c] = checkDayPlans(base, [training])
    expect(c.errors).toEqual({})
    // 150*4 + 280*4 + 67*9 = 2323 against the inherited 2000: off by more than 5%.
    expect(c.macroCalories).toBe(2323)
    expect(c.mismatch).toBe(true)
  })
  it('needs a name and a day', () => {
    const [c] = checkDayPlans(base, [{ ...emptyDayPlan() }])
    expect(c.errors.name).toBeTruthy()
    expect(c.errors.days).toBeTruthy()
    expect(dayPlansHaveErrors([c])).toBe(true)
  })
  it('range-checks only the fields the type sets', () => {
    const [c] = checkDayPlans({ ...base, fat: '-5' }, [{ ...training, steps: '-1' }])
    expect(c.errors.steps).toBeTruthy()
    expect(c.errors.fat).toBeUndefined()
  })
  it('round-trips form <-> row', () => {
    const row = dayPlansToRow([{ ...training, days: [3, 1], name: ' Training ' }])
    expect(row).toEqual([{ name: 'Training', days: [1, 3], calories: null, protein: null, carbs: 280, fat: null, cardio_minutes: null, steps: null }])
    expect(dayPlansFromRow(row)[0]).toMatchObject({ name: 'Training', days: [1, 3], carbs: '280', calories: '' })
    expect(sameDayPlans(dayPlansFromRow(row), [training])).toBe(true)
  })
  it('a weekday held by the other type cannot be picked', () => {
    const rest = { ...emptyDayPlan(), name: 'Rest', days: [0] }
    const plans = [training, rest]
    expect(toggleDayPlanDay(plans, 1, 3)).toBe(plans)
    // Free it on Training first, then Rest can take it.
    const freed = toggleDayPlanDay(plans, 0, 3)
    expect(freed[0].days).toEqual([1])
    expect(toggleDayPlanDay(freed, 1, 3)[1].days).toEqual([0, 3])
  })
})

describe('dayPlanDaysLabel', () => {
  it('lists the days Monday first', () => {
    expect(dayPlanDaysLabel([0, 5, 1, 3])).toBe('Mon, Wed, Fri, Sun')
  })
})
