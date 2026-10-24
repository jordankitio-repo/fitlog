import { describe, it, expect } from 'vitest'
import { waitingFrom, latestPerClient } from './reviewQueue'

const ci = (week_of, reviewed_at = null, created_at = `${week_of}T09:00:00Z`) =>
  ({ client_id: 'x', week_of, reviewed_at, created_at })

describe('latestPerClient', () => {
  it('keeps only the newest row per client', () => {
    const rows = [
      { client_id: 'a', week_of: '2026-10-04' },
      { client_id: 'a', week_of: '2026-10-18' },
      { client_id: 'b', week_of: '2026-10-11' },
    ]
    const out = latestPerClient(rows)
    expect(out.a.week_of).toBe('2026-10-18')
    expect(out.b.week_of).toBe('2026-10-11')
  })
  it('ignores rows with no client or no week', () => {
    expect(latestPerClient([{ week_of: '2026-10-18' }, { client_id: 'a' }])).toEqual({})
  })
})

describe('waitingFrom', () => {
  it('returns only clients whose LATEST check-in is unreviewed', () => {
    expect(waitingFrom({
      a: ci('2026-10-18'),                       // waiting
      b: ci('2026-10-18', '2026-10-19T10:00:00Z'), // reviewed
      c: null,                                   // never checked in
    })).toEqual(['a'])
  })

  // A reviewed LATEST settles the client. An older unreviewed one behind it is
  // not work: the coach answered the current period, which is what the card
  // shows and what the client is waiting on.
  it('does not resurrect an older unreviewed check-in', () => {
    expect(waitingFrom({ a: ci('2026-10-18', '2026-10-19T10:00:00Z') })).toEqual([])
  })

  it('orders by submission, oldest first', () => {
    const q = waitingFrom({
      newest: { ...ci('2026-10-18'), created_at: '2026-10-18T09:00:00Z' },
      oldest: { ...ci('2026-10-04'), created_at: '2026-10-04T09:00:00Z' },
      middle: { ...ci('2026-10-11'), created_at: '2026-10-11T09:00:00Z' },
    })
    expect(q).toEqual(['oldest', 'middle', 'newest'])
  })

  it('is empty for an empty roster', () => {
    expect(waitingFrom({})).toEqual([])
    expect(waitingFrom()).toEqual([])
  })
})
