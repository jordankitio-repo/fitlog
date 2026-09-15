import { describe, it, expect } from 'vitest'
import { attentionLevel, compareByAttention, summarizeRoster } from './attentionLevel'

// Minimal stats factory — only the fields attentionLevel reads.
function stats(over = {}) {
  return {
    daysSinceLog: 0,
    checkIn: { adherence_rating: 8, reviewed_at: '2026-01-01' }, // reviewed = green
    complianceItems: [],
    lockInfo: { locked: false },
    ...over,
  }
}

const comp = (label, value, hasData = true) => ({ label, value, hasData })

describe('attentionLevel', () => {
  it('treats missing stats as green with no reasons', () => {
    expect(attentionLevel(null)).toEqual({ level: 'green', tone: 'green', reasons: [] })
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

  it('treats 2-3 days since log as yellow, not red', () => {
    const r = attentionLevel(stats({ daysSinceLog: 3 }))
    expect(r.level).toBe('yellow')
    expect(r.reasons).toContain('3 days no log')
  })

  it('flags a missing check-in as red, and an unreviewed one as yellow', () => {
    // red    not submitted — the client owes it
    // yellow submitted, unreviewed — the coach owes it
    // green  reviewed — the loop is closed
    const missing = attentionLevel(stats({ checkIn: null }))
    expect(missing.level).toBe('red')
    expect(missing.reasons).toContain('No check-in')

    const unreviewed = attentionLevel(stats({ checkIn: { adherence_rating: 8 } }))
    expect(unreviewed.level).toBe('yellow')
    expect(unreviewed.reasons).toContain('Awaiting your review')
  })

  // Compliance is reported in AGGREGATE now, matching the Compliance lens.
  // Per-metric reasons made the column show a different metric per client.
  it('reports compliance in aggregate, excluding metrics with no data', () => {
    const r = attentionLevel(stats({
      complianceItems: [comp('Calories', 2), comp('Protein', 0, false), comp('Steps', 5)],
    }))
    // Protein has no data, so it is out of the numerator AND the denominator.
    expect(r.reasons).toContain('7/14 days on target')
    expect(r.reasons).not.toContain('Calories 2/7 days')
    expect(r.level).toBe('yellow')
  })

  it('lets compliance reach RED on its own, without any logging problem', () => {
    // Logs every single day and hits almost nothing. This graded yellow before,
    // while a client four days quiet graded red — backwards.
    const r = attentionLevel(stats({
      daysSinceLog: 0,
      complianceItems: [comp('Calories', 1), comp('Protein', 1)],
    }))
    expect(r.level).toBe('red')
    expect(r.reasons[0]).toBe('2/14 days on target')
  })

  it('stays green when aggregate compliance is strong', () => {
    const r = attentionLevel(stats({ complianceItems: [comp('Calories', 6), comp('Protein', 5)] }))
    expect(r.level).toBe('green')
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
    // Both need targets, or the "one issue" client picks up "No targets set"
    // as a second reason and the two tie.
    const oneIssue = stats({ checkIn: null, complianceItems: [comp('Calories', 6)] })
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

  it('surfaces missing targets, ranked below any real client signal', () => {
    // Reasons are ordered worst tone first: red, then yellow, then grey setup.
    // A grey gap is the coach's onboarding to-do and must not outrank a client
    // who is actually slipping.
    const withRed = attentionLevel(stats({ checkIn: null }))
    expect(withRed.reasons[0]).toBe('No check-in')      // red
    expect(withRed.reasons).toContain('No targets set') // grey, but still listed

    const onlySetup = attentionLevel(stats())
    expect(onlySetup.reasons[0]).toBe('No targets set')
    expect(onlySetup.level).toBe('yellow')
  })

  it('paints a setup gap grey while still ranking it as yellow', () => {
    // Severity and grade-ability are different questions: the coach still has
    // to act, so it must not sink to the bottom — but there is no grade to give.
    const a = attentionLevel(stats())  // healthy except: no targets
    expect(a.level).toBe('yellow')
    expect(a.tone).toBe('setup')
  })

  it('keeps tone === level when the top reason is a real client signal', () => {
    const y = attentionLevel(stats({ daysSinceLog: 2, complianceItems: [comp('Calories', 6)] }))
    expect(y.level).toBe('yellow')
    expect(y.tone).toBe('yellow')
    const r = attentionLevel(stats({ daysSinceLog: 9, complianceItems: [comp('Calories', 6)] }))
    expect(r.tone).toBe('red')
  })

  it('does not flag targets when the client has them', () => {
    const a = attentionLevel(stats({ complianceItems: [comp('Calories', 6)] }))
    expect(a.reasons).not.toContain('No targets set')
    expect(a.level).toBe('green')
  })

describe('summarizeRoster', () => {
  it('counts levels and the data-quality facts the per-client triage cannot', () => {
    const s = summarizeRoster({
      a: stats({ daysSinceLog: 5 }),                          // red: stale log
      b: stats({ checkIn: null }),                            // red: no check-in
      c: stats({ complianceItems: [comp('Calories', 6)] }),  // green: has targets, all healthy
    })
    expect(s.total).toBe(3)
    expect(s.atRisk).toBe(2)
    expect(s.review).toBe(0)
    expect(s.onTrack).toBe(1)
    expect(s.noTargets).toBe(2)
    expect(s.notLogging).toBe(1)
  })

  // This used to assert the blind spot rather than fix it: a client with no
  // targets was counted in `noTargets` AND graded green, so the roster called
  // them "on track" against nothing. Missing targets is a triage reason now.
  it('grades a client with no targets as review, not on-track', () => {
    const s = summarizeRoster({ a: stats() }) // healthy but complianceItems []
    expect(s.onTrack).toBe(0)
    expect(s.review).toBe(1)
    expect(s.noTargets).toBe(1)
  })

  it('counts unreviewed check-ins as "to review" (coverage)', () => {
    const s = summarizeRoster({
      a: stats({ checkIn: { adherence_rating: 8 } }),                          // submitted, not reviewed
      b: stats({ checkIn: { adherence_rating: 7, reviewed_at: '2026-06-15' } }), // reviewed
      c: stats({ checkIn: null }),                                             // none submitted
    })
    expect(s.checkInsToReview).toBe(1)
  })

  it('handles an empty roster', () => {
    expect(summarizeRoster({})).toMatchObject({
      total: 0, atRisk: 0, review: 0, onTrack: 0, noTargets: 0, notLogging: 0,
    })
  })
})
