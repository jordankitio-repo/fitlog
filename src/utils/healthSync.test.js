// The parts of device sync that decide WHAT is read and HOW it is labelled.
// Each wrong answer here is silent: a gap in the windows is a day that never
// syncs, a wrong watermark is a day that is never re-read, and a missing
// tombstone key is a deleted number that comes back.
import { describe, it, expect, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
  registerPlugin: () => ({}),
}))
vi.mock('../supabase', () => ({ supabase: {} }))

const { syncWindows, toSyncPayload, deviceDedupeKey, isTypedWeighIn } = await import('./healthSync.js')

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1

describe('syncWindows', () => {
  it('backfills a year on first connect, with no gap and no overlap', () => {
    const w = syncWindows(null, '2026-10-25')
    expect(w[0].start).toBe('2025-10-26')
    expect(w.at(-1).end).toBe('2026-10-25')
    expect(w.reduce((n, x) => n + days(x.start, x.end), 0)).toBe(365)
    for (let i = 1; i < w.length; i++) {
      expect(days(w[i - 1].end, w[i].start)).toBe(2) // next day, exactly
    }
  })

  it('keeps every chunk inside the 400-day steps cap', () => {
    for (const x of syncWindows(null, '2026-10-25')) {
      expect(days(x.start, x.end)).toBeLessThanOrEqual(90)
    }
  })

  // Today is still being walked. Marking it complete would leave this
  // evening's steps behind the watermark for good.
  it('never marks today complete', () => {
    const w = syncWindows(null, '2026-10-25')
    expect(w.at(-1).watermark).toBe('2026-10-24')
    expect(w[0].watermark).toBe(w[0].end)
  })

  it('re-reads two days behind the watermark for late Watch data', () => {
    expect(syncWindows('2026-10-24', '2026-10-25')).toEqual([
      { start: '2026-10-22', end: '2026-10-25', watermark: '2026-10-24' },
    ])
  })

  it('still reads something when the watermark is in the future', () => {
    const w = syncWindows('2027-01-01', '2026-10-25')
    expect(w).toHaveLength(1)
    expect(w[0].end).toBe('2026-10-25')
  })

  it('crosses a month and year boundary on local dates', () => {
    expect(syncWindows('2026-12-31', '2027-01-02')[0]).toEqual(
      { start: '2026-12-29', end: '2027-01-02', watermark: '2027-01-01' },
    )
  })
})

describe('toSyncPayload', () => {
  const raw = {
    steps: [{ logged_date: '2026-10-24', steps: 8000 }],
    workouts: [],
    weights: [{ logged_date: '2026-10-24', weighed_at: '07:10:00', weight_kg: 80, external_id: 'A' }],
  }

  it('stores weight in the unit the client already uses', () => {
    expect(toSyncPayload(raw, 'lbs').weights[0]).toMatchObject({ weight: 176.4, unit: 'lbs' })
    expect(toSyncPayload(raw, 'kg').weights[0]).toMatchObject({ weight: 80, unit: 'kg' })
  })

  it('keeps the dedupe key and passes steps through untouched', () => {
    const p = toSyncPayload(raw, 'lbs')
    expect(p.weights[0].external_id).toBe('A')
    expect(p.steps).toBe(raw.steps)
  })

  it('tolerates an empty read', () => {
    expect(toSyncPayload({}, 'lbs')).toEqual({ steps: [], workouts: [], weights: [] })
  })
})

describe('deviceDedupeKey', () => {
  const conn = 'c1'

  it('keys steps by date and weight/cardio by the record id', () => {
    expect(deviceDedupeKey('steps_log', { source_connection_id: conn, logged_date: '2026-10-24' }))
      .toEqual({ metric: 'steps', key: '2026-10-24' })
    expect(deviceDedupeKey('weight_log', { source_connection_id: conn, external_id: 'W' }))
      .toEqual({ metric: 'weight', key: 'W' })
    expect(deviceDedupeKey('cardio_log', { source_connection_id: conn, external_id: 'C' }))
      .toEqual({ metric: 'cardio', key: 'C' })
  })

  // The trap: editing a synced row pins it as 'manual' but it is still the
  // device's record. Deleting it without a tombstone brings it back.
  it('tombstones a synced row the client edited before deleting', () => {
    expect(deviceDedupeKey('weight_log', { source: 'manual', source_connection_id: conn, external_id: 'W' }))
      .toEqual({ metric: 'weight', key: 'W' })
  })

  it('leaves hand-logged rows and other tables alone', () => {
    expect(deviceDedupeKey('weight_log', { source: 'manual', external_id: null })).toBeNull()
    expect(deviceDedupeKey('nutrition_log', { source_connection_id: conn })).toBeNull()
  })
})

// What may be written to Apple Health. Wrong-true writes a scale's reading back
// into Health as a second weigh-in; wrong-false leaves a typed one out.
describe('isTypedWeighIn', () => {
  it('writes a weigh-in typed into Gardnr', () => {
    expect(isTypedWeighIn({ source: 'manual', source_connection_id: null, external_id: null })).toBe(true)
  })

  it('never writes back a reading that came from Health (a scale)', () => {
    expect(isTypedWeighIn({ source: 'apple_health', source_connection_id: 'c1', external_id: 'S' })).toBe(false)
  })

  // Editing pins a synced row as 'manual', but it is still the scale's record:
  // Health already holds the original.
  it('does not write a synced reading the client edited', () => {
    expect(isTypedWeighIn({ source: 'manual', source_connection_id: 'c1', external_id: 'S' })).toBe(false)
  })

  it('handles a missing row', () => {
    expect(isTypedWeighIn(null)).toBe(false)
  })
})
