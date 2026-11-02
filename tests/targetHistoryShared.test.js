// The edge-function twin of src/utils/targetHistory.js must answer the same
// day the same way, or the coach's digest and the coach's screen disagree.
import { describe, it, expect } from 'vitest'
import { makeTargetLookup as edge, setsAnyDay as edgeSets } from '../supabase/functions/_shared/targetHistory.ts'
import { makeTargetLookup as app, setsAnyDay as appSets } from '../src/utils/targetHistory.js'

const training = { name: 'Training', days: [1, 3, 5], calories: 2400, cardio_minutes: 30 }
const versions = [
  { effective_date: '2026-10-20', calories: 1800, day_plans: [] },
  { effective_date: '1970-01-01', calories: 2100, day_plans: [] },
  { effective_date: '2026-10-25', calories: 1700, steps: 9000, day_plans: [training] },
]

describe('shared target lookup', () => {
  it.each([
    '1969-12-31', '2026-01-01', '2026-10-19', '2026-10-20', '2026-10-24', '2026-10-25',
    // Mon / Tue / Sat after the day type exists.
    '2026-10-26', '2026-10-27', '2026-10-31', '2027-01-01',
  ])('%s matches the app', (d) => {
    expect(edge(versions)(d)).toEqual(app(versions)(d))
  })
  it('setsAnyDay matches the app', () => {
    for (const key of ['calories', 'cardio_minutes', 'protein']) {
      expect(edgeSets(versions[2], key)).toBe(appSets(versions[2], key))
    }
  })
})
