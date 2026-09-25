import { describe, it, expect } from 'vitest'
import { leadOf, byMonth } from './reportFeed'
describe('leadOf', () => {
  it('returns the first paragraph with markdown stripped', () => {
    expect(leadOf('# Title\n\n**Great week.** Adherence held at ~94%.\n\n- a\n- b'))
      .toBe('Great week. Adherence held at ~94%.')
  })
  it('is empty when there is no paragraph', () => {
    expect(leadOf('# Only a heading')).toBe('')
  })
})

describe('byMonth', () => {
  const now = new Date('2026-09-18T12:00:00Z')
  const r = (iso, id) => ({ id, created_at: iso })

  it('emits one label per month, in row order', () => {
    const rows = byMonth([r('2026-09-16T10:00:00Z', 'a'), r('2026-09-02T10:00:00Z', 'b'), r('2026-08-20T10:00:00Z', 'c')], now)
    expect(rows.map(x => x.kind)).toEqual(['label', 'report', 'report', 'label', 'report'])
    expect(rows[0].label).toBe('September')
    expect(rows[3].label).toBe('August')
  })

  it('carries the year only for other years', () => {
    const rows = byMonth([r('2025-12-01T10:00:00Z', 'a')], now)
    expect(rows[0].label).toBe('December 2025')
  })

  it('is empty for no reports', () => {
    expect(byMonth([], now)).toEqual([])
  })
})
