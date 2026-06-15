// Meal grouping for the nutrition diary. Pure helpers so both the client Log
// page and the coach ClientView render the day the same way.

export const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
]

const ORDER = MEALS.map((m) => m.key)
const LABEL = Object.fromEntries(MEALS.map((m) => [m.key, m.label]))

// Sensible default so logging is one fewer decision.
export function mealForHour(hour) {
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

// Within a meal slot, fold entries that share a logged_meal_id into one
// container (a meal logged as a single expandable item); loose entries stay as
// they are. Order is preserved (a container appears where its first item is).
// Returns a list of { type:'food', entry } | { type:'meal', id, name, entries, calories }.
export function groupLoggedMeals(entries = []) {
  const out = []
  const at = new Map()
  for (const e of entries) {
    if (e.logged_meal_id) {
      if (!at.has(e.logged_meal_id)) {
        at.set(e.logged_meal_id, out.length)
        out.push({ type: 'meal', id: e.logged_meal_id, name: e.logged_meal_name || 'Meal', entries: [e] })
      } else {
        out[at.get(e.logged_meal_id)].entries.push(e)
      }
    } else {
      out.push({ type: 'food', entry: e })
    }
  }
  for (const item of out) {
    if (item.type === 'meal') item.calories = item.entries.reduce((s, e) => s + (e.calories || 0), 0)
  }
  return out
}

// Group a day's entries into ordered meal sections (only the non-empty ones),
// each with a calorie subtotal. Rows with no/unknown meal fall into a trailing
// "Other" bucket so legacy entries still show.
export function groupEntriesByMeal(entries = []) {
  const buckets = new Map(ORDER.map((k) => [k, []]))
  const other = []
  for (const e of entries) {
    if (buckets.has(e.meal)) buckets.get(e.meal).push(e)
    else other.push(e)
  }
  const sum = (items) => items.reduce((s, e) => s + (e.calories || 0), 0)
  const groups = []
  for (const key of ORDER) {
    const items = buckets.get(key)
    if (items.length) groups.push({ key, label: LABEL[key], entries: items, calories: sum(items) })
  }
  if (other.length) groups.push({ key: 'other', label: 'Other', entries: other, calories: sum(other) })
  return groups
}
