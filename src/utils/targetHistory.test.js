import { describe, expect, it } from 'vitest'
import { makeTargetLookup, targetFn, constantLookup } from './targetHistory'

const versions = [
  { effective_date: '2026-10-15', calories: 1800, protein: 150 },
  { effective_date: '1970-01-01', calories: 2100, protein: 140 },
]

describe('makeTargetLookup', () => {
  const at = makeTargetLookup(versions)
  it('answers the first plan for days before any change', () => {
    expect(at('2026-09-01').calories).toBe(2100)
  })
  it('a change applies from its own date', () => {
    expect(at('2026-10-14').calories).toBe(2100)
    expect(at('2026-10-15').calories).toBe(1800)
    expect(at('2026-12-01').calories).toBe(1800)
  })
  it('is order-independent', () => {
    expect(makeTargetLookup([...versions].reverse())('2026-10-15').calories).toBe(1800)
  })
  it('answers null with no history', () => {
    expect(makeTargetLookup([])('2026-10-15')).toBeNull()
    expect(makeTargetLookup([{ effective_date: '2026-10-15', calories: 1 }])('2026-10-14')).toBeNull()
  })
})

describe('targetFn', () => {
  it('reads one field from a lookup, 0 where there is none', () => {
    const t = targetFn(makeTargetLookup(versions), 'protein')
    expect(t('2026-10-01')).toBe(140)
    expect(t('2026-10-20')).toBe(150)
    expect(targetFn(makeTargetLookup([]))('2026-10-20')).toBe(0)
  })
  it('passes a plain number through for every day', () => {
    expect(targetFn(2000)('2026-01-01')).toBe(2000)
    expect(targetFn('2000')('2026-01-01')).toBe(2000)
    expect(targetFn(null)('2026-01-01')).toBe(0)
  })
  it('constantLookup answers the current plan everywhere', () => {
    expect(targetFn(constantLookup({ calories: 1900 }))('1999-01-01')).toBe(1900)
    expect(targetFn(constantLookup(null))('1999-01-01')).toBe(0)
  })
})
