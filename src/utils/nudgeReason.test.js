import { describe, it, expect } from 'vitest'
import { nudgeReason } from './nudgeReason'

const thursday = new Date('2026-06-11T12:00:00') // getDay() === 4
const monday = new Date('2026-06-08T12:00:00')   // getDay() === 1

describe('nudgeReason', () => {
  it('nudges to log when the client has gone quiet', () => {
    expect(nudgeReason({ daysSinceLog: 3, hasCheckIn: true })).toEqual({ key: 'log', days: 3 })
  })

  it('nudges to log when the client has never logged', () => {
    expect(nudgeReason({ daysSinceLog: null, hasCheckIn: true })).toEqual({ key: 'log', days: null })
  })

  it('returns null when logging is current and a check-in exists', () => {
    expect(nudgeReason({ daysSinceLog: 0, hasCheckIn: true, today: thursday })).toBeNull()
  })

  it('nudges to check in when logging is fine but no check-in, later in the week', () => {
    expect(nudgeReason({ daysSinceLog: 1, hasCheckIn: false, today: thursday })).toEqual({ key: 'checkin' })
  })

  it('does NOT nag about a missing check-in early in the week', () => {
    expect(nudgeReason({ daysSinceLog: 1, hasCheckIn: false, today: monday })).toBeNull()
  })

  it('quiet outranks a missing check-in', () => {
    expect(nudgeReason({ daysSinceLog: 4, hasCheckIn: false, today: thursday })).toEqual({ key: 'log', days: 4 })
  })
})
