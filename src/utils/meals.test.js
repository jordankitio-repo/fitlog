import { describe, it, expect } from 'vitest'
import { mealForHour, groupEntriesByMeal, groupLoggedMeals } from './meals'

describe('mealForHour', () => {
  it('maps the day into meal slots', () => {
    expect(mealForHour(7)).toBe('breakfast')
    expect(mealForHour(10)).toBe('breakfast')
    expect(mealForHour(11)).toBe('lunch')
    expect(mealForHour(14)).toBe('lunch')
    expect(mealForHour(15)).toBe('dinner')
    expect(mealForHour(20)).toBe('dinner')
    expect(mealForHour(21)).toBe('snack')
    expect(mealForHour(23)).toBe('snack')
  })
})

describe('groupEntriesByMeal', () => {
  const e = (meal, calories) => ({ meal, calories })

  it('returns ordered, non-empty meal sections with calorie subtotals', () => {
    const groups = groupEntriesByMeal([
      e('dinner', 600), e('breakfast', 300), e('breakfast', 100), e('snack', 150),
    ])
    expect(groups.map((g) => g.key)).toEqual(['breakfast', 'dinner', 'snack'])
    expect(groups[0]).toMatchObject({ label: 'Breakfast', calories: 400 })
    expect(groups[0].entries).toHaveLength(2)
  })

  it('buckets null/unknown meals into a trailing "Other" group', () => {
    const groups = groupEntriesByMeal([e('lunch', 500), e(null, 200), e('brunch', 99)])
    expect(groups.map((g) => g.key)).toEqual(['lunch', 'other'])
    expect(groups[1]).toMatchObject({ label: 'Other', calories: 299 })
    expect(groups[1].entries).toHaveLength(2)
  })

  it('handles an empty day', () => {
    expect(groupEntriesByMeal([])).toEqual([])
  })
})

describe('groupLoggedMeals', () => {
  it('folds shared logged_meal_id into one container, keeps loose foods, preserves order', () => {
    const out = groupLoggedMeals([
      { id: 'a', food: 'Apple', calories: 95 },
      { id: 'b', food: 'Oats', calories: 300, logged_meal_id: 'm1', logged_meal_name: 'Breakfast combo' },
      { id: 'c', food: 'Egg', calories: 70, logged_meal_id: 'm1', logged_meal_name: 'Breakfast combo' },
      { id: 'd', food: 'Coffee', calories: 5 },
    ])
    expect(out.map(i => i.type)).toEqual(['food', 'meal', 'food'])
    expect(out[1]).toMatchObject({ id: 'm1', name: 'Breakfast combo', calories: 370 })
    expect(out[1].entries).toHaveLength(2)
    expect(out[0].entry.food).toBe('Apple')
  })
  it('returns all loose foods when none are containers', () => {
    const out = groupLoggedMeals([{ id: 'a', food: 'Apple', calories: 95 }])
    expect(out).toEqual([{ type: 'food', entry: { id: 'a', food: 'Apple', calories: 95 } }])
  })
})
