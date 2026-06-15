import { describe, it, expect } from 'vitest'
import { itemsFromEntries, entriesFromItems, mealTotals } from './savedMeals'

describe('itemsFromEntries', () => {
  it('snapshots entries into saved_meal_items with ids/defaults', () => {
    const items = itemsFromEntries(
      [{ food: 'Oats', calories: 300, protein: 10, carbs: 50, fat: 5, serving_size: 80, serving_unit: 'g' },
       { food: 'Egg', calories: 70 }],
      { savedMealId: 'm1', userId: 'u1' },
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ saved_meal_id: 'm1', user_id: 'u1', food: 'Oats', calories: 300 })
    expect(items[1]).toMatchObject({ food: 'Egg', calories: 70, protein: 0, carbs: 0, fat: 0, serving_size: 100, serving_unit: 'g' })
  })
})

describe('entriesFromItems', () => {
  it('expands items into nutrition_log rows for a day + meal', () => {
    const rows = entriesFromItems(
      [{ food: 'Oats', calories: 300, protein: 10 }],
      { userId: 'u1', date: '2026-06-15', meal: 'breakfast' },
    )
    expect(rows[0]).toMatchObject({
      food: 'Oats', calories: 300, protein: 10, carbs: 0, fat: 0,
      meal: 'breakfast', logged_date: '2026-06-15', user_id: 'u1',
      logged_meal_id: null, logged_meal_name: null,
    })
    expect(rows[0]).not.toHaveProperty('saved_meal_id')
  })

  it('stamps a container id/name when logged as a meal', () => {
    const rows = entriesFromItems(
      [{ food: 'Oats', calories: 300 }, { food: 'Egg', calories: 70 }],
      { userId: 'u1', date: '2026-06-15', meal: 'breakfast', loggedMealId: 'lm1', loggedMealName: 'My breakfast' },
    )
    expect(rows.every(r => r.logged_meal_id === 'lm1' && r.logged_meal_name === 'My breakfast')).toBe(true)
  })
})

describe('mealTotals', () => {
  it('sums macros across items', () => {
    expect(mealTotals([
      { calories: 300, protein: 10, carbs: 50, fat: 5 },
      { calories: 70, protein: 6, carbs: 0, fat: 5 },
    ])).toEqual({ calories: 370, protein: 16, carbs: 50, fat: 10 })
  })
  it('handles empty', () => {
    expect(mealTotals([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})
