// Step-up re-authentication for irreversible actions — see
// docs/passwordless-auth-design.md §4.5.
//
// What this protects: holding a live session is no longer enough to erase an
// account. That hole existed with passwords too — nothing ever re-checked the
// person at the keyboard before deletion — and it is the reason we added
// step-up instead of shortening sessions, which only punishes the legitimate
// user.
//
// The challenge is a credential, so the properties that matter are: single-use,
// expiring, attempt-capped, invisible to the browser, and not forgeable by a
// concurrent request.
import { createHash } from 'node:crypto'
import pg from 'pg'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, makeUser, cleanupUsers } from './helpers.js'
import { localEnv } from './env.js'

const PURPOSE = 'delete_account'

// Mirrors hashCode() in the request-step-up function: the database only ever
// holds SHA-256("<purpose>:<code>"), never the code itself.
const hash = (code) => createHash('sha256').update(`${PURPOSE}:${code}`).digest('hex')

const issue = (userId, code, ttl = 600) =>
  admin.rpc('issue_step_up', {
    p_user_id: userId, p_purpose: PURPOSE, p_code_hash: hash(code), p_ttl_seconds: ttl,
  })

const verify = (userId, code) =>
  admin.rpc('verify_step_up', { p_user_id: userId, p_purpose: PURPOSE, p_code_hash: hash(code) })

async function directConnection() {
  const conn = new pg.Client({ connectionString: localEnv().dbUrl })
  await conn.connect()
  return conn
}

describe('step-up challenges', () => {
  let user
  const created = []

  beforeAll(async () => {
    user = await makeUser('solo', 'stepup')
    created.push(user)
  })

  afterAll(async () => {
    await cleanupUsers(created)
  })

  it('accepts the right code exactly once', async () => {
    await issue(user.id, '123456')

    const first = await verify(user.id, '123456')
    expect(first.data).toBe(true)

    // Single-use: a replayed code (from a forwarded email, a shoulder-surfer,
    // a double-submitted form) must not authorise a second deletion.
    const second = await verify(user.id, '123456')
    expect(second.data).toBe(false)
  })

  it('rejects a wrong code', async () => {
    await issue(user.id, '111111')
    const { data } = await verify(user.id, '999999')
    expect(data).toBe(false)
  })

  it('dies after 5 attempts, even if the right code arrives later', async () => {
    // 6 digits is only a million options; without a cap it is walkable.
    await issue(user.id, '222222')
    for (let i = 0; i < 5; i++) {
      const { data } = await verify(user.id, '000000')
      expect(data).toBe(false)
    }
    const { data } = await verify(user.id, '222222')
    expect(data).toBe(false)
  })

  it('rejects an expired challenge', async () => {
    await issue(user.id, '333333', -10) // already expired on arrival
    const { data } = await verify(user.id, '333333')
    expect(data).toBe(false)
  })

  it('re-issuing invalidates the previous code and clears the attempt count', async () => {
    await issue(user.id, '444444')
    for (let i = 0; i < 3; i++) await verify(user.id, '000000')

    await issue(user.id, '555555')

    const old = await verify(user.id, '444444')
    expect(old.data).toBe(false)          // superseded
    const fresh = await verify(user.id, '555555')
    expect(fresh.data).toBe(true)         // attempts were reset, not carried over
  })

  it('is invisible and uncallable from the browser', async () => {
    // The challenge row is a credential. A signed-in user must not be able to
    // read their own code hash, nor mint or check a challenge directly.
    const read = await user.client.from('step_up_challenges').select('*')
    expect(read.data ?? []).toHaveLength(0)

    const issued = await user.client.rpc('issue_step_up', {
      p_user_id: user.id, p_purpose: PURPOSE, p_code_hash: hash('123456'), p_ttl_seconds: 600,
    })
    expect(issued.error).not.toBeNull()

    const verified = await user.client.rpc('verify_step_up', {
      p_user_id: user.id, p_purpose: PURPOSE, p_code_hash: hash('123456'),
    })
    expect(verified.error).not.toBeNull()
  })

  it('refuses a code another transaction is already consuming', async () => {
    // Same shape as the invite-claim test, and the same reason: without the row
    // lock in verify_step_up, two requests carrying one code can both observe it
    // unconsumed and both succeed — a single-use credential becomes reusable.
    await issue(user.id, '666666')

    const conn = await directConnection()
    let pending
    try {
      await conn.query('begin')
      await conn.query(
        'update public.step_up_challenges set consumed_at = now() where user_id = $1 and purpose = $2',
        [user.id, PURPOSE],
      )

      // .then() forces the request onto the wire now: supabase-js builders are
      // lazy, so without it the call would not reach the database until the
      // await below — after the commit — and would pass even unlocked.
      pending = verify(user.id, '666666').then((r) => r)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await conn.query('commit')
    } finally {
      await conn.query('rollback').catch(() => {})
      await conn.end()
    }

    const { data } = await pending
    expect(data).toBe(false)
  })
})
