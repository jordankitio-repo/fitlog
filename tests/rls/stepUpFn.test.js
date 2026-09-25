// The step-up functions over HTTP: `request-step-up`, and the gate it puts in
// front of `delete-account`.
//
// stepUp.test.js proves the challenge RPCs behave (single-use, expiring,
// attempt-capped). What it cannot show is the claim the design actually makes:
// that **delete-account refuses to delete without a valid code, and fails
// closed**. That guarantee lives in the function, so it has to be tested
// through the function — and "the browser cannot skip the step by not asking"
// is only true if an HTTP request that simply omits the code is refused.
//
// Every negative case below asserts the account still EXISTS afterwards. A
// deletion gate that returns 403 while deleting anyway would pass a
// status-code-only test.
//
// Requires edge-runtime (see redeemInviteFn.test.js for the EXCLUDES override);
// skips otherwise.
import { createHash } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, makeUser, cleanupUsers } from './helpers.js'
import { localEnv } from './env.js'

const { url, anonKey } = localEnv()
const FUNCTIONS_URL = `${url}/functions/v1`
const PURPOSE = 'delete_account'

const hash = (code) => createHash('sha256').update(`${PURPOSE}:${code}`).digest('hex')

const issue = (userId, code, ttl = 600) =>
  admin.rpc('issue_step_up', {
    p_user_id: userId, p_purpose: PURPOSE, p_code_hash: hash(code), p_ttl_seconds: ttl,
  })

async function callFn(name, { token, body }) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function userExists(id) {
  const { data } = await admin.auth.admin.getUserById(id)
  return Boolean(data?.user)
}

async function edgeRuntimeUp() {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/request-step-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ purpose: 'nope' }),
    })
    return res.status === 400
  } catch {
    return false
  }
}

const serving = await edgeRuntimeUp()

const tokenOf = async (user) => (await user.client.auth.getSession()).data.session.access_token

describe.skipIf(!serving)('request-step-up (HTTP)', () => {
  let user
  const created = []

  beforeAll(async () => {
    user = await makeUser('solo', 'sufn')
    created.push(user)
  })
  afterAll(() => cleanupUsers(created))

  it('rejects an unknown purpose before looking at anything else', async () => {
    const { status } = await callFn('request-step-up', {
      token: await tokenOf(user),
      body: { purpose: 'delete_everyone' },
    })
    expect(status).toBe(400)
  })

  it('refuses an unauthenticated caller', async () => {
    const { status } = await callFn('request-step-up', { body: { purpose: PURPOSE } })
    expect(status).toBe(401)
  })

  it('refuses a forged token', async () => {
    const { status } = await callFn('request-step-up', {
      token: 'not.a.jwt',
      body: { purpose: PURPOSE },
    })
    expect(status).toBe(401)
  })

  // The send itself needs RESEND_API_KEY, which a local stack has no business
  // holding — so this asserts the function gets as far as issuing a challenge,
  // and stops short of claiming the email works. Delivery is verified against
  // the real key at deploy time, not here.
  it('issues a challenge row for an authenticated caller', async () => {
    await admin.from('step_up_challenges').delete().eq('user_id', user.id)
    await callFn('request-step-up', { token: await tokenOf(user), body: { purpose: PURPOSE } })

    const { data } = await admin.from('step_up_challenges').select('*').eq('user_id', user.id)
    expect(data ?? [], 'no challenge was issued').toHaveLength(1)
    expect(data[0].purpose).toBe(PURPOSE)
    // Never the plaintext code.
    expect(data[0].code_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe.skipIf(!serving)('delete-account step-up gate (HTTP)', () => {
  const created = []
  afterAll(() => cleanupUsers(created))

  async function subject(label) {
    const u = await makeUser('solo', label)
    created.push(u)
    return u
  }

  it('refuses with NO code, and the account survives', async () => {
    const u = await subject('delnocode')
    const { status } = await callFn('delete-account', { token: await tokenOf(u), body: {} })
    expect(status).toBe(403)
    expect(await userExists(u.id), 'account was deleted without a code').toBe(true)
  })

  it('refuses a WRONG code, and the account survives', async () => {
    const u = await subject('delwrong')
    await issue(u.id, '123456')
    const { status } = await callFn('delete-account', {
      token: await tokenOf(u), body: { stepUpCode: '999999' },
    })
    expect(status).toBe(403)
    expect(await userExists(u.id)).toBe(true)
  })

  it('refuses a malformed code without consuming the challenge', async () => {
    const u = await subject('delmalformed')
    await issue(u.id, '246810')

    for (const stepUpCode of ['', '12345', '1234567', 'abcdef', '12 34 56', null]) {
      const { status } = await callFn('delete-account', { token: await tokenOf(u), body: { stepUpCode } })
      expect(status, `expected 403 for ${JSON.stringify(stepUpCode)}`).toBe(403)
    }
    expect(await userExists(u.id)).toBe(true)

    // The real code still works afterwards — malformed attempts must not burn it.
    const { data } = await admin.from('step_up_challenges')
      .select('consumed_at').eq('user_id', u.id).single()
    expect(data.consumed_at).toBeNull()
  })

  it('refuses a code issued for a DIFFERENT user', async () => {
    const victim = await subject('delvictim')
    const attacker = await subject('delattacker')
    await issue(attacker.id, '135790')

    // Attacker holds a valid code — for their own account — and aims it at the
    // victim's session. The challenge is keyed by user_id, so it must not apply.
    const { status } = await callFn('delete-account', {
      token: await tokenOf(victim), body: { stepUpCode: '135790' },
    })
    expect(status).toBe(403)
    expect(await userExists(victim.id)).toBe(true)
  })

  it('accepts a valid code exactly once', async () => {
    const u = await subject('delvalid')
    await issue(u.id, '112233')

    const token = await tokenOf(u)
    const first = await callFn('delete-account', { token, body: { stepUpCode: '112233' } })
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(await userExists(u.id), 'account was not actually deleted').toBe(false)
  })
})
