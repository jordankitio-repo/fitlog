// Merge a user's saved card order with the current set of default keys.
// - keeps saved keys that still exist, in the saved order
// - drops saved keys that no longer exist (a card we removed)
// - appends any new default keys the user has never seen, in default order
// So adding/removing cards later never breaks a saved layout.
export function mergeOrder(saved, defaults) {
  const def = Array.isArray(defaults) ? defaults : []
  const sv = Array.isArray(saved) ? saved : []
  const known = new Set(def)
  const kept = sv.filter(k => known.has(k))
  const keptSet = new Set(kept)
  return [...kept, ...def.filter(k => !keptSet.has(k))]
}
