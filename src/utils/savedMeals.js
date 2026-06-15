// Pure helpers for saved meals — named bundles of foods a user logs in one tap.

// Snapshot a day's nutrition entries into saved_meal_item rows.
export function itemsFromEntries(entries = [], { savedMealId, userId }) {
  return entries.map((e) => ({
    saved_meal_id: savedMealId,
    user_id: userId,
    food: e.food,
    calories: e.calories,
    protein: e.protein ?? 0,
    carbs: e.carbs ?? 0,
    fat: e.fat ?? 0,
    serving_size: e.serving_size ?? 100,
    serving_unit: e.serving_unit ?? 'g',
  }))
}

// Expand a saved meal's items into nutrition_log insert rows for a day + meal slot.
export function entriesFromItems(items = [], { userId, date, meal }) {
  return items.map((i) => ({
    food: i.food,
    calories: i.calories,
    protein: i.protein ?? 0,
    carbs: i.carbs ?? 0,
    fat: i.fat ?? 0,
    serving_size: i.serving_size ?? 100,
    serving_unit: i.serving_unit ?? 'g',
    meal,
    logged_date: date,
    user_id: userId,
  }))
}

// Aggregate macros for a saved meal's items (for the list label).
export function mealTotals(items = []) {
  return items.reduce(
    (t, i) => ({
      calories: t.calories + (i.calories || 0),
      protein: t.protein + (i.protein || 0),
      carbs: t.carbs + (i.carbs || 0),
      fat: t.fat + (i.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
}
