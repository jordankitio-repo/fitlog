// `create-portal-session` over HTTP: who is allowed to open a Stripe billing
// portal, and for whose customer.
//
// The function hands back a URL that shows someone's saved cards and their
// whole invoice history, so the only interesting question about it is
// authorization. Every case below is deliberately on the near side of the
// Stripe call: the function checks caller, role and customer-ownership BEFORE
// it reads STRIPE_SECRET_KEY, so this whole file runs against a local stack
// holding no Stripe credentials at all. The Stripe half (a real portal session,
// and the dashboard configuration it depends on) is verified against test keys
// at deploy time, not here.
//
// The claim worth testing more than once: a portal is scoped to the CALLER's
// own subscription row. The function selects on `coach_id=eq.<verified uid>`,
// and it runs as service_role — so RLS is not the guard here, that filter is.
// A client who shares a coach has the same auth to this endpoint as anyone
// else, and must still get nothing.
//
// Requires edge-runtime (see redeemInviteFn.test.js for the EXCLUDES override);
// skips otherwise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, makeUser, relate, cleanupUsers } from './helpers.js'
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
    const res = await fetch(`${FUNCTIONS_URL}/create-portal-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({}),
    })
    return res.status === 401 // reached the function and it refused us
  } catch {
    return false
  }
}

const serving = await edgeRuntimeUp()

const tokenOf = async (user) => (await user.client.auth.getSession()).data.session.access_token

describe.skipIf(!serving)('create-portal-session (HTTP)', () => {
  let coach, billedCoach, client, soloUser
  const created = []

  beforeAll(async () => {
    coach = await makeUser('coach', 'portalCoach')          // no subscription row
    billedCoach = await makeUser('coach', 'portalBilled')   // has a customer
    client = await makeUser('client', 'portalClient')
    soloUser = await makeUser('solo', 'portalSolo')
    created.push(coach, billedCoach, client, soloUser)

    await relate(billedCoach.id, client.id)
    await admin.from('subscriptions').insert({
      coach_id: billedCoach.id,
      status: 'active',
      stripe_customer_id: 'cus_test_portal',
      stripe_subscription_id: 'sub_test_portal',
    })
  })

  afterAll(async () => {
    await admin.from('subscriptions').delete().eq('coach_id', billedCoach.id)
    await cleanupUsers(created)
  })

  it('refuses an unauthenticated caller', async () => {
    const { status } = await callFn('create-portal-session')
    expect(status).toBe(401)
  })

  it('refuses a forged token', async () => {
    const { status } = await callFn('create-portal-session', { token: 'not.a.jwt' })
    expect(status).toBe(401)
  })

  // A client pays nothing and has no billing to manage. This is the case that
  // would leak a coach's cards and invoices if the role check went missing, and
  // this client is related to a coach who HAS a customer id — so the refusal is
  // about the role, not about there being nothing to find.
  it('refuses a client, even one whose coach has a live subscription', async () => {
    const { status, body } = await callFn('create-portal-session', {
      token: await tokenOf(client),
    })
    expect(status).toBe(403)
    expect(body.url).toBeUndefined()
  })

  // Reaches past the role check and stops at ownership: this coach is a coach,
  // but the row the function looks for is keyed on their own id and there isn't
  // one. 404 rather than a Stripe error is the proof that the lookup is scoped
  // to the caller and is not falling through to anyone else's customer.
  it('gives a coach with no billing account nothing to open', async () => {
    const { status, body } = await callFn('create-portal-session', {
      token: await tokenOf(coach),
    })
    expect(status).toBe(404)
    expect(body.url).toBeUndefined()
  })

  it('gives a solo user with no billing account nothing to open', async () => {
    const { status, body } = await callFn('create-portal-session', {
      token: await tokenOf(soloUser),
    })
    expect(status).toBe(404)
    expect(body.url).toBeUndefined()
  })

  // An `intent` is a label the function maps to a flow, never a destination it
  // follows. Garbage must fall back to the plain portal rather than be trusted,
  // and the return_url is built server-side — so a caller-supplied one is
  // ignored outright. Both callers below are refused at the same guard they
  // would be refused at with no body: the point is that nothing in the body
  // changes WHICH guard answers.
  it('does not let the request body choose a destination', async () => {
    const token = await tokenOf(coach)
    const injected = await callFn('create-portal-session', {
      token,
      body: { intent: 'portal', return_url: 'https://attacker.example/steal' },
    })
    expect(injected.status).toBe(404)
    expect(injected.body.url).toBeUndefined()

    const bogusIntent = await callFn('create-portal-session', {
      token,
      body: { intent: '../../admin' },
    })
    expect(bogusIntent.status).toBe(404)
    expect(bogusIntent.body.url).toBeUndefined()
  })
})
