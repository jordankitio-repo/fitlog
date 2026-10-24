// Notification dismissals: a per-reader acknowledgement of one bell entry.
//
// The table holds the bell's own synthetic event keys ('ci<uuid>', 'm<uuid>'),
// so the only thing RLS has to get right is that they are PRIVATE and
// UNFORGEABLE. Both matter, and they fail in opposite directions:
//
//   * Private, because the keys name events. A coach's dismissal list is the
//     set of client check-ins and messages they have opened, and the reverse
//     read — a client learning which of their messages the coach has looked at
//     — is a read-receipt the product does not offer and must not leak.
//
//   * Unforgeable, because a dismissal hides a notification. Writing a row
//     under somebody else's user_id silently suppresses their notice, which is
//     the one way this table could be used against its owner.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, cleanupUsers } from './helpers.js'

describe('notification_dismissals', () => {
  let a, b
  const created = []

  beforeAll(async () => {
    a = await makeUser('coach', 'disA')
    b = await makeUser('coach', 'disB')
    created.push(a, b)
  })

  afterAll(async () => {
    await admin.from('notification_dismissals').delete().in('user_id', created.map((u) => u.id))
    await cleanupUsers(created)
  })

  it('lets a reader acknowledge an entry and read it back', async () => {
    const { error } = await a.client
      .from('notification_dismissals')
      .insert({ user_id: a.id, key: 'ci-own-entry' })
    expect(error).toBeNull()

    const { data } = await a.client.from('notification_dismissals').select('key')
    expect(data.map((r) => r.key)).toContain('ci-own-entry')
  })

  it('re-acknowledging the same entry is not an error', async () => {
    // The bell's exact call. A row clicked twice before the panel closes, or
    // cleared in a batch that already holds it, must not surface a 409.
    //
    // This asserts the SPELLING, not just the outcome: the obvious upsert is
    // ON CONFLICT DO UPDATE, which needs an UPDATE policy this table does not
    // have and must not have, and it fails as a 403 on the second click only.
    const { error } = await a.client
      .from('notification_dismissals')
      .upsert({ user_id: a.id, key: 'ci-own-entry' }, { onConflict: 'user_id,key', ignoreDuplicates: true })
    expect(error).toBeNull()
  })

  it('refuses a DO UPDATE upsert, so the row cannot be rewritten', async () => {
    const { error } = await a.client
      .from('notification_dismissals')
      .upsert({ user_id: a.id, key: 'ci-own-entry', dismissed_at: '2000-01-01T00:00:00Z' }, { onConflict: 'user_id,key' })
    expect(error).not.toBeNull()
  })

  it('hides one reader\'s acknowledgements from another', async () => {
    const { data } = await b.client.from('notification_dismissals').select('key')
    expect(data).toEqual([])
  })

  it('refuses a dismissal written under another user, which would suppress their notice', async () => {
    const { error } = await b.client
      .from('notification_dismissals')
      .insert({ user_id: a.id, key: 'ci-forged' })
    expect(error).not.toBeNull()

    // And nothing landed: the check is the row count, not the error alone.
    const { data } = await admin
      .from('notification_dismissals').select('key').eq('key', 'ci-forged')
    expect(data).toEqual([])
  })

  it('refuses to delete another reader\'s acknowledgement, which would resurface it', async () => {
    await b.client.from('notification_dismissals').delete().eq('key', 'ci-own-entry')
    const { data } = await admin
      .from('notification_dismissals').select('key').eq('user_id', a.id).eq('key', 'ci-own-entry')
    expect(data).toHaveLength(1)
  })
})
