// `logging_identity` — days logged, longest run, current run.
//
// It replaced a browser-side loop that pulled 60 days of dates and walked
// backwards through them. That loop was capped at 60 by its own query window
// while the page's MILESTONES list included 90, so a 90-day streak could not
// be reported and that celebration was unreachable. The cap is the first thing
// asserted here.
//
// The other reason this is in SQL is that one definition of "streak" has to
// serve the whole page. Two definitions on one screen is worse than no streak
// at all, so these tests pin the definition rather than the implementation:
// a run ends today or yesterday, and yesterday counts because a streak is not
// broken until a whole day passes without a log.
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, cleanupUsers } from './helpers.js'

const iso = (d) => d.toISOString().slice(0, 10)
const dayBefore = (today, n) => {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return iso(d)
}

// A fixed "today" so the tests do not drift across midnight, and so the dates
// below read as what they are. The function takes the caller's local date for
// exactly this reason — it never asks the server what day it is.
const TODAY = '2026-10-19'

describe('logging_identity', () => {
  let user
  const created = []

  beforeAll(async () => {
    user = await makeUser('solo', 'identity')
    created.push(user)
  })

  afterEach(async () => {
    await admin.from('nutrition_log').delete().eq('user_id', user.id)
  })

  afterAll(() => cleanupUsers(created))

  // Several entries on one day must count as one day, which is why the query
  // selects DISTINCT: a person who logs breakfast, lunch and dinner has not
  // logged a three-day streak.
  const logDays = async (offsets, perDay = 1) => {
    const rows = []
    for (const o of offsets) {
      for (let i = 0; i < perDay; i++) {
        rows.push({ user_id: user.id, food: `f${o}-${i}`, calories: 100, logged_date: dayBefore(TODAY, o) })
      }
    }
    const { error } = await admin.from('nutrition_log').insert(rows)
    if (error) throw new Error(`seed: ${error.message}`)
  }

  const identity = async () => {
    const { data, error } = await user.client.rpc('logging_identity', { p_today: TODAY })
    if (error) throw new Error(`logging_identity: ${error.message}`)
    return data[0]
  }

  it('reports nothing for someone who has never logged', async () => {
    expect(await identity()).toMatchObject({
      days_logged: 0, current_streak: 0, longest_streak: 0, logged_today: false,
    })
  })

  it('counts a day once however many times it was logged', async () => {
    await logDays([0, 1], 4)
    expect(await identity()).toMatchObject({ days_logged: 2, current_streak: 2 })
  })

  it('counts a run that ends today', async () => {
    await logDays([0, 1, 2])
    expect(await identity()).toMatchObject({ current_streak: 3, logged_today: true })
  })

  // The rule that stops everyone's streak reading 0 every morning.
  it('keeps the streak alive on a day not yet logged', async () => {
    await logDays([1, 2, 3])
    expect(await identity()).toMatchObject({ current_streak: 3, logged_today: false })
  })

  it('treats a run that ended two days ago as over', async () => {
    await logDays([2, 3, 4])
    expect(await identity()).toMatchObject({ current_streak: 0, longest_streak: 3 })
  })

  it('finds the longest run even when it is not the current one', async () => {
    await logDays([0, 1, 5, 6, 7, 8, 9])
    const r = await identity()
    expect(r.current_streak).toBe(2)
    expect(r.longest_streak).toBe(5)
    expect(r.days_logged).toBe(7)
  })

  // The bug this function exists to fix. The old loop could not return more
  // than 60, so the 90-day milestone on the page was unreachable.
  it('reports a streak longer than the old 60-day ceiling', async () => {
    await logDays(Array.from({ length: 95 }, (_, i) => i))
    const r = await identity()
    expect(r.current_streak, 'still capped').toBe(95)
    expect(r.longest_streak).toBe(95)
    expect(r.days_logged).toBe(95)
  })

  // A date in the future cannot extend a streak backwards from today, and must
  // not be counted as a logged day either.
  it('ignores anything logged after the day it was asked about', async () => {
    await logDays([0, 1])
    await admin.from('nutrition_log').insert({
      user_id: user.id, food: 'future', calories: 100, logged_date: dayBefore(TODAY, -3),
    })
    expect(await identity()).toMatchObject({ days_logged: 2, current_streak: 2 })
  })

  // It reads `auth.uid()`, so there is no argument that could point it at
  // someone else — but another user's rows must not leak into the count
  // either, which is RLS's job and worth proving rather than assuming.
  it('counts only the caller, never another user', async () => {
    const other = await makeUser('solo', 'identityOther')
    created.push(other)
    await logDays([0, 1])
    await admin.from('nutrition_log').insert(
      [0, 1, 2, 3, 4].map((o) => ({
        user_id: other.id, food: `other${o}`, calories: 100, logged_date: dayBefore(TODAY, o),
      })),
    )

    expect(await identity()).toMatchObject({ days_logged: 2, current_streak: 2 })

    const { data } = await other.client.rpc('logging_identity', { p_today: TODAY })
    expect(data[0]).toMatchObject({ days_logged: 5, current_streak: 5 })

    await admin.from('nutrition_log').delete().eq('user_id', other.id)
  })
})
