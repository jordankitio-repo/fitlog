// `pause-subscription` over HTTP: who may stop paying, for how long, and how
// often.
//
// A pause here keeps every client's access while billing stops, which is the
// right call for a product where the person who would lose access is not the
// person who stopped paying — and it is exactly why the two limits have to be
// real. Three months, once a year. Both are enforced in the function and not
// only in the UI, because a hidden button is a suggestion.
//
// Everything below sits on the near side of the Stripe call, so a local stack
// with no Stripe credentials proves all of it. The last test is the one that
// stops the rest being a list of refusals that would also pass against a
// function that refused everyone.
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
    const res = await fetch(`${FUNCTIONS_URL}/pause-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({}),
    })
    return res.status === 400 || res.status === 401
  } catch {
    return false
  }
}

const serving = await edgeRuntimeUp()
const tokenOf = async (user) => (await user.client.auth.getSession()).data.session.access_token
const monthsAgo = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString()
}

describe.skipIf(!serving)('pause-subscription (HTTP)', () => {
  let coach, bare, client
  const created = []

  const setSub = (patch) => admin.from('subscriptions').update(patch).eq('coach_id', coach.id)

  // Clearing the limiter is part of resetting, not a workaround for it. A real
  // coach pauses once; this file calls the endpoint a dozen times in a second,
  // so without this the later cases all get a correct 429 and prove nothing.
  // That the limiter fires at all is asserted on purpose at the end.
  const clearLimiter = () => admin.from('rate_limits').delete().eq('user_id', coach.id)

  const resetSub = async () => {
    await clearLimiter()
    return setSub({
      status: 'active',
      cancel_at_period_end: false,
      paused_until: null,
      last_paused_at: null,
    })
  }

  beforeAll(async () => {
    coach = await makeUser('coach', 'pauseCoach')
    bare = await makeUser('coach', 'pauseBare')
    client = await makeUser('client', 'pauseClient')
    created.push(coach, bare, client)
    await admin.from('subscriptions').insert({
      coach_id: coach.id,
      status: 'active',
      stripe_customer_id: 'cus_test_pause',
      stripe_subscription_id: 'sub_test_pause',
      billing_interval: 'monthly',
    })
  })

  afterAll(async () => {
    await admin.from('subscriptions').delete().in('coach_id', [coach.id, bare.id])
    await cleanupUsers(created)
  })

  it('refuses an unauthenticated caller', async () => {
    const { status } = await callFn('pause-subscription', { body: { action: 'pause', months: 1 } })
    expect(status).toBe(401)
  })

  it('rejects an action it does not recognise', async () => {
    for (const action of ['stop', '', 'PAUSE', null, undefined]) {
      const { status } = await callFn('pause-subscription', {
        token: await tokenOf(coach), body: { action, months: 1 },
      })
      expect(status, `action ${JSON.stringify(action)} was accepted`).toBe(400)
    }
  })

  // The length is the limit. A tampered client sending 36 must be refused, not
  // quietly coerced to a default it never asked for — and 0, negative and
  // fractional months all have to fail rather than round into something.
  it('rejects a pause length outside one to three whole months', async () => {
    await resetSub()
    for (const months of [0, -1, 4, 36, 1.5, '2', null, undefined, Infinity]) {
      const { status } = await callFn('pause-subscription', {
        token: await tokenOf(coach), body: { action: 'pause', months },
      })
      expect(status, `months ${JSON.stringify(months)} was accepted`).toBe(400)
    }
  })

  it('refuses a client', async () => {
    await clearLimiter()
    const { status } = await callFn('pause-subscription', {
      token: await tokenOf(client), body: { action: 'pause', months: 1 },
    })
    expect(status).toBe(403)
  })

  it('refuses a coach with no subscription', async () => {
    await clearLimiter()
    const { status } = await callFn('pause-subscription', {
      token: await tokenOf(bare), body: { action: 'pause', months: 1 },
    })
    expect(status).toBe(404)
  })

  // A trial is already free, so pausing it would stack free time on free time.
  it('refuses to pause a trial', async () => {
    await clearLimiter()
    await setSub({ status: 'trialing' })
    const { status, body } = await callFn('pause-subscription', {
      token: await tokenOf(coach), body: { action: 'pause', months: 1 },
    })
    expect(status).toBe(409)
    expect(body.error).toMatch(/trial/i)
    await resetSub()
  })

  // `behavior: void` voids FUTURE invoices. Pausing while an invoice has
  // already failed would look like it settled the debt and leave it exactly
  // where it was.
  it('refuses to pause past an unpaid invoice', async () => {
    await clearLimiter()
    await setSub({ status: 'past_due' })
    const { status, body } = await callFn('pause-subscription', {
      token: await tokenOf(coach), body: { action: 'pause', months: 1 },
    })
    expect(status).toBe(409)
    expect(body.error).toMatch(/payment method/i)
    await resetSub()
  })

  it('refuses to pause a subscription already scheduled to cancel', async () => {
    await clearLimiter()
    await setSub({ cancel_at_period_end: true })
    const { status } = await callFn('pause-subscription', {
      token: await tokenOf(coach), body: { action: 'pause', months: 1 },
    })
    expect(status).toBe(409)
    await resetSub()
  })

  it('refuses to pause what is already paused', async () => {
    await clearLimiter()
    await setSub({ paused_until: new Date(Date.now() + 30 * 864e5).toISOString() })
    const { status } = await callFn('pause-subscription', {
      token: await tokenOf(coach), body: { action: 'pause', months: 1 },
    })
    expect(status).toBe(409)
    await resetSub()
  })

  // The once-a-year rule, which is the only thing standing between "a pause"
  // and "an indefinite free subscription assembled out of legal moves".
  it('refuses a second pause within twelve months', async () => {
    await clearLimiter()
    await setSub({ last_paused_at: monthsAgo(5) })
    const { status, body } = await callFn('pause-subscription', {
      token: await tokenOf(coach), body: { action: 'pause', months: 1 },
    })
    expect(status).toBe(409)
    expect(body.error).toMatch(/once a year/i)
    expect(body.eligibleFrom, 'the refusal does not say when they can').toBeTruthy()
    await resetSub()
  })

  it('allows a pause once the year is up', async () => {
    await clearLimiter()
    await setSub({ last_paused_at: monthsAgo(13) })
    const { status, body } = await callFn('pause-subscription', {
      token: await tokenOf(coach), body: { action: 'pause', months: 3 },
    })
    // Reached Stripe: no key locally, or a key and a subscription id Stripe has
    // never heard of. Either way no guard stopped it.
    expect([500, 502], `stopped early with: ${body.error}`).toContain(status)
    await resetSub()
  })

  it('refuses to resume what is not paused', async () => {
    await resetSub()
    const { status, body } = await callFn('pause-subscription', {
      token: await tokenOf(coach), body: { action: 'resume' },
    })
    expect(status).toBe(409)
    expect(body.error).toMatch(/not paused/i)
  })

  // An expired pause is not a pause. If this read the column as a flag rather
  // than as a date, a coach whose pause ended yesterday could neither pause
  // again nor resume.
  it('treats a pause whose date has passed as over', async () => {
    await clearLimiter()
    await setSub({ paused_until: monthsAgo(1), last_paused_at: monthsAgo(13) })
    const { status, body } = await callFn('pause-subscription', {
      token: await tokenOf(coach), body: { action: 'pause', months: 1 },
    })
    expect([500, 502], `an expired pause blocked a new one: ${body.error}`).toContain(status)
    await resetSub()
  })

  // Last, because it deliberately exhausts the budget. Pausing moves money and
  // is not something anyone does five times in an hour; the limiter exists so
  // a stuck client or a script cannot hammer Stripe on a coach's behalf. It
  // fails OPEN on a limiter error, so this also proves the RPC is reachable
  // rather than quietly waving everything through.
  it('stops a caller who will not stop asking', async () => {
    await resetSub()
    const token = await tokenOf(coach)
    const statuses = []
    for (let i = 0; i < 7; i++) {
      const { status } = await callFn('pause-subscription', {
        token, body: { action: 'resume' },
      })
      statuses.push(status)
    }
    expect(statuses, `never rate limited: ${statuses.join(',')}`).toContain(429)
    await clearLimiter()
  })
})
