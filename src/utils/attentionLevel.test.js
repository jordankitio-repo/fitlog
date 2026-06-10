import { describe, it, expect } from 'vitest'
import { attentionLevel, compareByAttention } from './attentionLevel'

// Minimal stats factory — only the fields attentionLevel reads.
function stats(over = {}) {
  return {
    daysSinceLog: 0,
    checkIn: { adherence_rating: 8 },
    concerningReactions: [],
    complianceItems: [],
    lockInfo: { locked: false },
    ...over,
  }
}

const comp = (label, value, hasData = true) => ({ label, value, hasData })

describe('attentionLevel', () => {
  it('treats missing stats as green with no reasons', () => {
    expect(attentionLevel(null)).toEqual({ level: 'green', reasons: [] })
  })

  it('is green when logging is current, checked in, and compliance is healthy', () => {
    const r = attentionLevel(stats({ complianceItems: [comp('Calories', 6)] }))
    expect(r.level).toBe('green')
    expect(r.reasons).toEqual([])
  })

  it('flags never-logged as red', () => {
    const r = attentionLevel(stats({ daysSinceLog: null, checkIn: null }))
    expect(r.level).toBe('red')
    expect(r.reasons[0]).toBe('Never logged')
  })

  it('flags a stale log (>=4 days) as red with a day count', () => {
    const r = attentionLevel(stats({ daysSinceLog: 5 }))
    expect(r.level).toBe('red')
    expect(r.reasons[0]).toBe('5 days no log')
  })

  it('flags a locked client as red', () => {
    const r = attentionLevel(stats({ lockInfo: { locked: true } }))
    expect(r.level).toBe('red')
    expect(r.reasons).toContain('Locked')
  })

  it('flags negative reactions as red, pluralizing the count', () => {
    expect(attentionLevel(stats({ concerningReactions: [{}] })).reasons).toContain('Negative reaction')
    expect(attentionLevel(stats({ concerningReactions: [{}, {}] })).reasons).toContain('2 negative reactions')
  })

  it('treats 2-3 days since log as yellow, not red', () => {
    const r = attentionLevel(stats({ daysSinceLog: 3 }))
    expect(r.level).toBe('yellow')
    expect(r.reasons).toContain('3 days no log')
  })

  it('flags a missing check-in as yellow', () => {
    const r = attentionLevel(stats({ checkIn: null }))
    expect(r.level).toBe('yellow')
    expect(r.reasons).toContain('No check-in')
  })

  it('flags weak compliance (<3/7) as yellow but ignores metrics with no data', () => {
    const r = attentionLevel(stats({
      complianceItems: [comp('Calories', 2), comp('Protein', 0, false), comp('Steps', 5)],
    }))
    expect(r.level).toBe('yellow')
    expect(r.reasons).toContain('Calories 2/7')
    expect(r.reasons).not.toContain('Protein 0/7')
    expect(r.reasons).not.toContain('Steps 5/7')
  })

  it('appends yellow reasons after red ones when both are present', () => {
    const r = attentionLevel(stats({ daysSinceLog: 6, checkIn: null }))
    expect(r.level).toBe('red')
    expect(r.reasons[0]).toBe('6 days no log')
    expect(r.reasons).toContain('No check-in')
  })
})

describe('compareByAttention', () => {
  it('orders red before yellow before green', () => {
    const red = stats({ daysSinceLog: 5 })
    const yellow = stats({ checkIn: null })
    const green = stats({ complianceItems: [comp('Calories', 6)] })
    const sorted = [green, red, yellow].sort(compareByAttention)
    expect(sorted).toEqual([red, yellow, green])
  })

  it('within a level, ranks the client with more problems higher', () => {
    const oneIssue = stats({ checkIn: null })
    const twoIssues = stats({ checkIn: null, complianceItems: [comp('Calories', 1)] })
    const sorted = [oneIssue, twoIssues].sort(compareByAttention)
    expect(sorted).toEqual([twoIssues, oneIssue])
  })

  it('sorts null stats to the back as green', () => {
    const red = stats({ daysSinceLog: 9 })
    const sorted = [null, red].sort(compareByAttention)
    expect(sorted).toEqual([red, null])
  })
})
