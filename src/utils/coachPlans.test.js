import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { COACH_PLANS, planFor, isUpgrade } from './coachPlans'

const PRICING = 'supabase/functions/_shared/coachPricing.ts'

describe('coach plan ladder', () => {
  // The keys cross a process boundary: the browser sends one, the edge function
  // resolves a Stripe Price from it. A key that exists on one side and not the
  // other is a plan the coach can select and the server will refuse, and
  // nothing fails until someone clicks it.
  it('matches the cadences the server will price', () => {
    const ts = readFileSync(PRICING, 'utf8')
    const list = ts.match(/export const COACH_CADENCES = \[([^\]]+)\]/)
    expect(list, 'could not find COACH_CADENCES').not.toBeNull()
    const serverKeys = [...list[1].matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]).sort()
    expect(COACH_PLANS.map((p) => p.key).sort()).toEqual(serverKeys)
  })

  it('ranks the ladder by length of commitment', () => {
    const ranks = COACH_PLANS.map((p) => p.rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(ranks).size).toBe(ranks.length) // no ties, or direction is undefined
  })

  // The confirm step tells the coach whether money leaves today or comes back
  // as credit, and it chooses that sentence from this function. Getting the
  // direction wrong says the opposite of what is about to happen.
  it('reads longer commitments as upgrades and shorter ones as downgrades', () => {
    expect(isUpgrade('monthly', 'annual')).toBe(true)
    expect(isUpgrade('monthly', '6mo')).toBe(true)
    expect(isUpgrade('6mo', 'annual')).toBe(true)
    expect(isUpgrade('annual', 'monthly')).toBe(false)
    expect(isUpgrade('annual', '6mo')).toBe(false)
    expect(isUpgrade('6mo', 'monthly')).toBe(false)
  })

  it('returns null for a cadence it does not know, rather than guessing a direction', () => {
    expect(isUpgrade('monthly', 'weekly')).toBeNull()
    expect(isUpgrade(undefined, 'annual')).toBeNull()
    expect(planFor('weekly')).toBeNull()
    expect(planFor(undefined)).toBeNull()
  })

  it('gives every plan the display text both screens need', () => {
    for (const p of COACH_PLANS) {
      expect(p.name, `${p.key} name`).toBeTruthy()
      expect(p.amount, `${p.key} amount`).toMatch(/^\$\d+$/)
      expect(p.summary, `${p.key} summary`).toContain(p.amount)
    }
  })
})
