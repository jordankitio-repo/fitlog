import { describe, it, expect } from 'vitest'
import { GOALS, GOAL_KEYS, goalLabel } from './goals'

describe('goals', () => {
  // These four keys are also a CHECK inside set_client_primary_goal. If this
  // test is updated, that migration has to be updated in the same change or the
  // new option will be rejected at runtime.
  it('matches the keys the database will accept', () => {
    expect(GOAL_KEYS).toEqual(['lose', 'gain', 'maintain', 'recomp'])
  })

  it('has a unique key per option', () => {
    expect(new Set(GOAL_KEYS).size).toBe(GOALS.length)
  })

  it('resolves a label, and nothing for an unknown key', () => {
    expect(goalLabel('gain')).toBe('Build muscle')
    expect(goalLabel('become_a_bird')).toBeNull()
    expect(goalLabel(null)).toBeNull()
  })
})
