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
