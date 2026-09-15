import { describe, it, expect } from 'vitest'
import { rosterStatus, LENS_HEADERS } from './rosterStatus'

const comp = (label, value, hasData = true) => ({ label, value, logged: 7, hasData })
const stats = (o = {}) => ({
  daysSinceLog: 0, checkIn: { adherence_rating: 8, energy_level: 7 },
  complianceItems: [], lockInfo: { locked: false }, ...o,
})

describe('rosterStatus', () => {
  it('has a header for every lens', () => {
    expect(Object.keys(LENS_HEADERS).sort()).toEqual(['attention', 'checkin', 'compliance', 'recent'])
  })

  describe('compliance lens', () => {
    it('reports days on target out of the possible total', () => {
      const r = rosterStatus('compliance', stats({ complianceItems: [comp('Calories', 6), comp('Protein', 5)] }))
      expect(r.text).toBe('11/14 days on target')
      expect(r.tone).toBe('green')
    })
    it('greys out when there are no targets — no grade exists', () => {
      expect(rosterStatus('compliance', stats())).toEqual({ text: 'No targets set', tone: 'setup' })
    })
    it('greys out when targets exist but nothing was logged against them', () => {
      const r = rosterStatus('compliance', stats({ complianceItems: [comp('Calories', 0, false)] }))
      expect(r).toEqual({ text: 'Nothing logged', tone: 'setup' })
    })
    it('grades down as the ratio falls', () => {
      expect(rosterStatus('compliance', stats({ complianceItems: [comp('Calories', 4)] })).tone).toBe('yellow')
      expect(rosterStatus('compliance', stats({ complianceItems: [comp('Calories', 1)] })).tone).toBe('red')
    })
  })

  describe('recent lens', () => {
    it('names the day and grades by staleness', () => {
      expect(rosterStatus('recent', stats({ daysSinceLog: 0 }))).toEqual({ text: 'Logged today', tone: 'green' })
      expect(rosterStatus('recent', stats({ daysSinceLog: 1 }))).toEqual({ text: 'Logged yesterday', tone: 'green' })
      expect(rosterStatus('recent', stats({ daysSinceLog: 2 }))).toEqual({ text: '2 days ago', tone: 'yellow' })
      expect(rosterStatus('recent', stats({ daysSinceLog: 6 }))).toEqual({ text: '6 days ago', tone: 'red' })
      expect(rosterStatus('recent', stats({ daysSinceLog: null }))).toEqual({ text: 'Never logged', tone: 'red' })
    })
  })

  describe('checkin lens', () => {
    it('separates not-submitted, awaiting review, and reviewed', () => {
      expect(rosterStatus('checkin', stats({ checkIn: null })).text).toBe('Not submitted')
      expect(rosterStatus('checkin', stats()).text).toBe('Awaiting your review')
      expect(rosterStatus('checkin', stats({ checkIn: { reviewed_at: '2026-09-01' } }))).toEqual({ text: 'Reviewed', tone: 'green' })
    })
  })

  describe('attention lens', () => {
    it('shows the most pressing reason, with the rest in the title', () => {
      const r = rosterStatus('attention', stats({ daysSinceLog: 5, checkIn: null, complianceItems: [comp('Calories', 6)] }))
      expect(r.text).toBe('5 days no log')
      expect(r.tone).toBe('red')
      expect(r.title).toContain('No check-in')
    })
    it('falls back to the log label when nothing is wrong', () => {
      const r = rosterStatus('attention', stats({ complianceItems: [comp('Calories', 6)] }))
      expect(r.text).toBe('Logged today')
      expect(r.tone).toBe('green')
    })
  })

  it('handles a client with no stats yet', () => {
    expect(rosterStatus('attention', null)).toEqual({ text: '—', tone: 'setup' })
  })
})
