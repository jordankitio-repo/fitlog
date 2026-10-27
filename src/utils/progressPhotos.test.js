import { describe, it, expect, vi } from 'vitest'
vi.mock('../supabase', () => ({ supabase: {} }))
const { weightNear, datesFor } = await import('./progressPhotos')

const w = (logged_date, weight) => ({ logged_date, weight, unit: 'lbs' })

describe('weightNear', () => {
  it('takes the same day when there is one', () => {
    expect(weightNear([w('2026-10-01', 150), w('2026-10-02', 149)], '2026-10-02').weight).toBe(149)
  })
  it('falls back to the nearest within three days, earlier on a tie', () => {
    expect(weightNear([w('2026-09-29', 151), w('2026-10-03', 148)], '2026-10-01').weight).toBe(151)
    expect(weightNear([w('2026-10-03', 148)], '2026-10-01').weight).toBe(148)
  })
  it('gives nothing rather than a weight from weeks away', () => {
    expect(weightNear([w('2026-09-01', 160)], '2026-10-01')).toBeNull()
  })
  it('crosses a month and a year boundary by days, not by string', () => {
    expect(weightNear([w('2025-12-31', 155)], '2026-01-02').weight).toBe(155)
  })
})

describe('datesFor', () => {
  it('lists the dates that have that pose', () => {
    const photos = [{ pose: 'front', taken_on: '2026-10-02' }, { pose: 'side', taken_on: '2026-10-01' }, { pose: 'front', taken_on: '2026-09-01' }]
    expect(datesFor(photos, 'front')).toEqual(['2026-10-02', '2026-09-01'])
  })
})

describe('photoSets', () => {
  it('groups by date, newest first', async () => {
    const { photoSets } = await import('./progressPhotos')
    const sets = photoSets([
      { taken_on: '2026-09-01', pose: 'front' }, { taken_on: '2026-10-01', pose: 'side' }, { taken_on: '2026-09-01', pose: 'back' },
    ])
    expect(sets.map(s => s.date)).toEqual(['2026-10-01', '2026-09-01'])
    expect(Object.keys(sets[1].byPose).sort()).toEqual(['back', 'front'])
  })
})
