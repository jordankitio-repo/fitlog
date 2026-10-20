// `change-cadence` over HTTP: who may reprice a subscription, and on what.
//
// The function moves a paying coach between $49/month, $264/6mo and $490/year
// and invoices the difference immediately, so every refusal below is a refusal
// to take or return money on a request that had no business asking.
//
// All of it runs on the near side of the Stripe call: the guards are ordered
// caller -> role -> rate limit -> subscription -> cancelling -> same-cadence ->
// Stripe config, so a local stack with no Stripe credentials can still prove
// every one of them. That ordering is deliberate and these tests are what keep
// it that way.
//
// The case worth naming: an unknown cadence is REJECTED here, where
// create-checkout-session defaults it to monthly. Defaulting at checkout costs
// nobody anything — the alternative is no subscription at all. Defaulting here
// would take a coach who sent a typo and silently move them down the ladder.
//
// Requires edge-runtime (see redeemInviteFn.test.js for the EXCLUDES override);
// skips otherwise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, makeUser, cleanupUsers } from './helpers.js'
import { localEnv } from './env.js'

const { url, anonKey } = localEnv()
const FUNCTIONS_URL = `${url}/functions/v1`

async function callFn(name, { token, body } = {}) {
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

async function edgeRuntimeUp() {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/change-cadence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({}),
    })
    // 400: the body carried no valid cadence, which is the first thing checked.
    return res.status === 400 || res.status === 401
  } catch {
    return false
  }
}

const serving = await edgeRuntimeUp()

const tokenOf = async (user) => (await user.client.auth.getSession()).data.session.access_token

describe.skipIf(!serving)('change-cadence (HTTP)', () => {
  let coach, bare, client
  const created = []

  const setSub = (patch) =>
    admin.from('subscriptions').update(patch).eq('coach_id', coach.id)

  beforeAll(async () => {
    coach = await makeUser('coach', 'cadCoach')     // has a live subscription
    bare = await makeUser('coach', 'cadBare')       // coach, no subscription
    client = await makeUser('client', 'cadClient')
    created.push(coach, bare, client)

    await admin.from('subscriptions').insert({
      coach_id: coach.id,
      status: 'active',
      stripe_customer_id: 'cus_test_cadence',
      stripe_subscription_id: 'sub_test_cadence',
      billing_interval: 'monthly',
      cancel_at_period_end: false,
    })
  })

  afterAll(async () => {
    await admin.from('subscriptions').delete().in('coach_id', [coach.id, bare.id])
    await cleanupUsers(created)
  })

  it('refuses an unauthenticated caller', async () => {
    const { status } = await callFn('change-cadence', { body: { cadence: 'annual' } })
    expect(status).toBe(401)
  })

  // Checked before auth, because an invalid cadence is a malformed request
  // rather than a forbidden one. It must never fall through to a default.
  it('rejects a cadence that is not on the ladder', async () => {
    for (const cadence of ['weekly', 'MONTHLY', '', 'monthly ', null, 42]) {
      const { status } = await callFn('change-cadence', {
        token: await tokenOf(coach),
        body: { cadence },
      })
      expect(status, `cadence ${JSON.stringify(cadence)} was not rejected`).toBe(400)
    }
  })

  it('rejects a request with no cadence at all rather than defaulting', async () => {
    const { status } = await callFn('change-cadence', { token: await tokenOf(coach) })
    expect(status).toBe(400)
  })

  it('refuses a client', async () => {
    const { status } = await callFn('change-cadence', {
      token: await tokenOf(client),
      body: { cadence: 'annual' },
    })
    expect(status).toBe(403)
  })

  it('refuses a coach with no subscription to reprice', async () => {
    const { status } = await callFn('change-cadence', {
      token: await tokenOf(bare),
      body: { cadence: 'annual' },
    })
    expect(status).toBe(404)
  })

  it('refuses to reprice the cadence the coach is already on', async () => {
    await setSub({ billing_interval: 'monthly', cancel_at_period_end: false, status: 'active' })
    const { status } = await callFn('change-cadence', {
      token: await tokenOf(coach),
      body: { cadence: 'monthly' },
    })
    expect(status).toBe(400)
  })

  // A subscription already scheduled to cancel carries a promise: "you'll keep
  // access until <date>". Repricing it moves that date or quietly un-cancels
  // it, and either way the card stops telling the truth.
  it('refuses while the subscription is scheduled to cancel', async () => {
    await setSub({ cancel_at_period_end: true })
    const { status, body } = await callFn('change-cadence', {
      token: await tokenOf(coach),
      body: { cadence: 'annual' },
    })
    expect(status).toBe(409)
    expect(body.error).toMatch(/resume/i)
    await setSub({ cancel_at_period_end: false })
  })

  it('refuses on a cancelled subscription', async () => {
    await setSub({ status: 'canceled' })
    const { status } = await callFn('change-cadence', {
      token: await tokenOf(coach),
      body: { cadence: 'annual' },
    })
    expect(status).toBe(404)
    await setSub({ status: 'active' })
  })

  // The last guard before Stripe. Reaching it proves every check above passed
  // for a legitimate request, which is what stops this file from being a list
  // of refusals that would also pass against a function that refused everyone.
  it('gets a legitimate request all the way to the Stripe call', async () => {
    await setSub({ billing_interval: 'monthly', status: 'active', cancel_at_period_end: false })
    const { status, body } = await callFn('change-cadence', {
      token: await tokenOf(coach),
      body: { cadence: 'annual' },
    })
    // Two acceptable landings, and which one depends on the machine rather
    // than on the code: with no STRIPE_SECRET_KEY it stops at the config check
    // (500), and with the test key in supabase/functions/.env it really calls
    // Stripe and is told there is no such subscription, because the id above is
    // fabricated (502). Asserting either exactly would make this test pass or
    // fail on local configuration. What it must prove is that no GUARD stopped
    // it — this request was legitimate and got as far as the money.
    expect([500, 502], `stopped early with: ${body.error}`).toContain(status)
    expect(status, 'a guard rejected a legitimate request').not.toBe(409)

    // And nothing was written on the way past.
    const { data } = await admin.from('subscriptions')
      .select('billing_interval').eq('coach_id', coach.id).single()
    expect(data.billing_interval).toBe('monthly')
  })
})
