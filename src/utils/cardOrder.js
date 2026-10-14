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

// Fold a reordered DISPLAY list back into the full saved order.
//
// The phone's destination list is not the saved order: it hides the summary's
// own sections, and it shows one "trends" row standing in for six real chart
// keys. Dragging that row has to move all six, and dragging anything must not
// disturb the keys that are not on screen — reordering what you can see should
// never silently rearrange what you cannot.
//
// So the displayed keys are rewritten in their new sequence while every other
// key keeps its position, and `trends` expands to its members in whatever
// relative order they already had.
export function applyDisplayOrder(newDisplay, fullOrder, groups = {}) {
  const expand = (k) => {
    const members = groups[k]
    if (!members) return [k]
    // Keep the group's members in the order the saved layout already has them.
    return fullOrder.filter(x => members.includes(x))
  }
  const expanded = newDisplay.flatMap(expand)
  const movable = new Set(expanded)
  let i = 0
  return fullOrder.map(k => (movable.has(k) ? expanded[i++] : k))
}
