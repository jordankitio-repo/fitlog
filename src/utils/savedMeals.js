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

// Expand a saved meal's items into nutrition_log insert rows for a day + meal
// slot. When loggedMealId/Name are given, the rows form one logged container
// (a meal logged as a single, expandable item).
export function entriesFromItems(items = [], { userId, date, meal, loggedMealId = null, loggedMealName = null }) {
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
    logged_meal_id: loggedMealId,
    logged_meal_name: loggedMealName,
  }))
}

// A stable fingerprint of a meal used to detect duplicates by name AND content
// (same name + same set of foods/macros). Item order doesn't matter, casing and
// surrounding whitespace are ignored, and the same per-item defaults as
// itemsFromEntries (serving_size 100, serving_unit 'g') are applied so an entry
// and its saved snapshot hash identically. Two meals are duplicates iff their
// signatures match.
export function mealSignature(name, items = []) {
  const txt = (s) => String(s ?? '').trim().toLowerCase()
  const num = (n) => Number(n ?? 0)
  const rows = items
    .map((i) => [
      txt(i.food),
      num(i.calories),
      num(i.protein),
      num(i.carbs),
      num(i.fat),
      num(i.serving_size ?? 100),
      txt(i.serving_unit ?? 'g'),
    ].join('|'))
    .sort()
  return txt(name) + '::' + rows.join('~')
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
