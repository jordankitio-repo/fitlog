// Notification preferences: who can read them, what can be stored, and what
// the send gate actually decides.
//
// Two separate claims, and they fail in opposite directions, so both are here:
//
//   * A preference row is PRIVATE. A coach can read a lot about a client, and
//     which emails that client muted is not part of it. There is deliberately
//     no coach policy on this table.
//
//   * The gate defaults to SEND. Absent row, absent key, null: all true. That
//     default is what lets a user who has never opened the screen receive
//     everything, and it is the one the six senders rely on — so it is asserted
//     rather than assumed.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, relate, cleanupUsers } from './helpers.js'

const gate = async (userId, category) => {
  const { data, error } = await admin.rpc('wants_email_notification', {
    p_user_id: userId,
    p_category: category,
  })
  if (error) throw new Error(`wants_email_notification: ${error.message}`)
  return data
}

describe('notification_preferences', () => {
  let coach, client, other
  const created = []

  beforeAll(async () => {
    coach = await makeUser('coach', 'prefCoach')
    client = await makeUser('client', 'prefClient')
    other = await makeUser('client', 'prefOther')
    created.push(coach, client, other)
    await relate(coach.id, client.id)
  })

  afterAll(async () => {
    await admin.from('notification_preferences').delete().in('user_id', created.map((u) => u.id))
    await cleanupUsers(created)
  })

  it('lets a user write and read back their own preferences', async () => {
    const { error } = await client.client
      .from('notification_preferences')
      .upsert({ user_id: client.id, email: { nudge: false } }, { onConflict: 'user_id' })
    expect(error).toBeNull()

    const { data } = await client.client
      .from('notification_preferences').select('email').eq('user_id', client.id).maybeSingle()
    expect(data.email).toEqual({ nudge: false })
  })

  // The upsert the screen performs hits the UPDATE policy on the second save,
  // not the INSERT one. A table with only an insert policy passes the test
  // above and then fails the first time anybody changes their mind.
  it('lets the same user change their mind (upsert hits the update policy)', async () => {
    const { error } = await client.client
      .from('notification_preferences')
      .upsert({ user_id: client.id, email: { nudge: false, report: false } }, { onConflict: 'user_id' })
    expect(error).toBeNull()
    const { data } = await client.client
      .from('notification_preferences').select('email').eq('user_id', client.id).maybeSingle()
    expect(data.email).toEqual({ nudge: false, report: false })
  })

  it("hides a client's preferences from their own coach", async () => {
    const { data, error } = await coach.client
      .from('notification_preferences').select('*').eq('user_id', client.id)
    // RLS filters rows rather than erroring on SELECT.
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('refuses to write a row belonging to someone else', async () => {
    const { error } = await other.client
      .from('notification_preferences')
      .insert({ user_id: client.id, email: { report: false } })
    expect(error).not.toBeNull()
  })

  // The constraint is the backstop for a typo in a sender or in the screen's
  // category list: a key nobody declared cannot be stored, so a toggle that
  // would silently mute nothing fails loudly on save instead.
  it('rejects a category nobody declared', async () => {
    const { error } = await other.client
      .from('notification_preferences')
      .insert({ user_id: other.id, email: { report: false, nope: true } })
    expect(error).not.toBeNull()
    expect(error.code).toBe('23514') // check_violation
  })

  describe('the send gate', () => {
    it('sends when there is no row at all', async () => {
      expect(await gate(other.id, 'report')).toBe(true)
    })

    it('sends for a category the user never touched', async () => {
      // client has { nudge: false, report: false } from above.
      expect(await gate(client.id, 'milestone')).toBe(true)
    })

    it('does not send for an explicit false', async () => {
      expect(await gate(client.id, 'nudge')).toBe(false)
      expect(await gate(client.id, 'report')).toBe(false)
    })

    it('sends for an unknown category rather than silently muting it', async () => {
      // A sender passing a category the table does not know is a bug, and the
      // safe failure is a delivered email, not a swallowed one.
      expect(await gate(client.id, 'not_a_category')).toBe(true)
    })

    // The gate is SECURITY DEFINER over a table the caller cannot read. If
    // `authenticated` could execute it, anyone could probe anyone else's
    // preferences one category at a time, which is the row-level privacy above
    // leaking back out through a function.
    it('is not callable by an ordinary signed-in user', async () => {
      const { error } = await client.client.rpc('wants_email_notification', {
        p_user_id: coach.id,
        p_category: 'weekly_digest',
      })
      expect(error).not.toBeNull()
    })
  })
})
