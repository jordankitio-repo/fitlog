import { describe, it, expect } from 'vitest'
import { mergeOrder } from './cardOrder'

describe('mergeOrder', () => {
  const defaults = ['a', 'b', 'c', 'd']

  it('returns defaults when nothing is saved', () => {
    expect(mergeOrder(null, defaults)).toEqual(defaults)
    expect(mergeOrder([], defaults)).toEqual(defaults)
  })

  it('respects a saved reordering', () => {
    expect(mergeOrder(['c', 'a', 'd', 'b'], defaults)).toEqual(['c', 'a', 'd', 'b'])
  })

  it('appends new default keys the user has never seen, in default order', () => {
    // saved only knew a, c — b and d are new and append after, in default order
    expect(mergeOrder(['c', 'a'], defaults)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('drops saved keys that no longer exist', () => {
    expect(mergeOrder(['c', 'gone', 'a'], defaults)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('handles a fully saved order with a later-added key', () => {
    expect(mergeOrder(['d', 'c', 'b', 'a'], [...defaults, 'e'])).toEqual(['d', 'c', 'b', 'a', 'e'])
  })
})

// Reorderable's default order: the registry wins over JSX source order.
//
// Regression. REORDERABLE_KEYS was reordered to lift the charts above the
// targets form; the rail (built from that constant) moved, and the page did
// not, because Reorderable defaulted to the order its children were written
// in. The two lists have to be the same list.
describe('mergeOrder as Reorderable resolves defaults', () => {
  const resolve = (saved, registry, present) => {
    const defaults = Array.isArray(registry)
      ? [...registry.filter(k => present.includes(k)), ...present.filter(k => !registry.includes(k))]
      : present
    return mergeOrder(saved, defaults)
  }
  const JSX = ['consistency', 'targets', 'privateNotes', 'weightChart']
  const REGISTRY = ['consistency', 'weightChart', 'targets', 'privateNotes']

  it('uses the registry order, not the order the children are written in', () => {
    expect(resolve([], REGISTRY, JSX)).toEqual(REGISTRY)
  })

  it('still renders a section the registry forgot, rather than dropping it', () => {
    expect(resolve([], ['consistency'], JSX)).toEqual(['consistency', 'targets', 'privateNotes', 'weightChart'])
  })

  it('leaves a coach who has dragged their own layout alone', () => {
    const saved = ['privateNotes', 'consistency', 'targets', 'weightChart']
    expect(resolve(saved, REGISTRY, JSX)).toEqual(saved)
  })

  it('ignores registry keys that are not on the page', () => {
    expect(resolve([], ['sentReports', ...REGISTRY], JSX)).toEqual(REGISTRY)
  })
})
