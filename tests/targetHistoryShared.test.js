// The edge-function twin of src/utils/targetHistory.js must answer the same
// day the same way, or the coach's digest and the coach's screen disagree.
import { describe, it, expect } from 'vitest'
import { makeTargetLookup as edge } from '../supabase/functions/_shared/targetHistory.ts'
import { makeTargetLookup as app } from '../src/utils/targetHistory.js'

const versions = [
  { effective_date: '2026-10-20', calories: 1800 },
  { effective_date: '1970-01-01', calories: 2100 },
  { effective_date: '2026-10-25', calories: 1700 },
]

describe('shared target lookup', () => {
  it.each(['1969-12-31', '2026-01-01', '2026-10-19', '2026-10-20', '2026-10-24', '2026-10-25', '2027-01-01'])('%s matches the app', (d) => {
    expect(edge(versions)(d)).toEqual(app(versions)(d))
  })
})
