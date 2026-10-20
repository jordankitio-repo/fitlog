// The failed-payment path, driven through the real webhook with a real
// signature.
//
// This is the churn loop, end to end: Stripe cannot take the card, the
// subscription goes `past_due`, the Billing card shows a recovery notice, and
// the coach is emailed because they may never open the app. Until today only
// the first of those happened.
//
// It signs its own payload the way Stripe does, so it exercises signature
// verification, event de-duplication and the handler together rather than
// calling the handler's parts in isolation. The email itself cannot be
// asserted here — a local stack holds no Resend key, and the helper returns
// early without one — so what is proven is everything up to the send, plus the
// recipient lookup that the send depends on.
//
// Requires edge-runtime (see redeemInviteFn.test.js for the EXCLUDES override)
// and STRIPE_WEBHOOK_SECRET in supabase/functions/.env; skips otherwise.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, makeUser, cleanupUsers } from './helpers.js'
import { localEnv } from './env.js'

const { url, anonKey } = localEnv()
const WEBHOOK_URL = `${url}/functions/v1/stripe-webhook`

function webhookSecret() {
  try {
    const env = readFileSync('supabase/functions/.env', 'utf8')
    return env.match(/^STRIPE_WEBHOOK_SECRET=(.+)$/m)?.[1]?.trim() || null
  } catch {
    return null
  }
}

const SECRET = webhookSecret()

// Stripe's scheme: the signed payload is "<timestamp>.<raw body>", and the
// header carries both. The function rejects anything older than its tolerance,
// so the timestamp has to be current rather than fixed.
function sign(rawBody, secret) {
  const ts = Math.floor(Date.now() / 1000)
  const v1 = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex')
  return `t=${ts},v1=${v1}`
}

async function deliver(event, { secret = SECRET } = {}) {
  const rawBody = JSON.stringify(event)
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      'stripe-signature': sign(rawBody, secret),
    },
    body: rawBody,
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function edgeRuntimeUp() {
  if (!SECRET) return false
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: '{}',
    })
    return res.status === 400 // reached the function, refused for no signature
  } catch {
    return false
  }
}

const serving = await edgeRuntimeUp()

describe.skipIf(!serving)('invoice.payment_failed', () => {
  let coach
  const created = []
  const eventIds = []
  const CUSTOMER = 'cus_test_dunning'
  const SUBSCRIPTION = 'sub_test_dunning'

  const failedEvent = (overrides = {}) => {
    const id = `evt_test_pf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    eventIds.push(id)
    return {
      id,
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: CUSTOMER,
          subscription: SUBSCRIPTION,
          amount_due: 4900,
          next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 86400,
          ...overrides,
        },
      },
    }
  }

  const statusNow = async () => {
    const { data } = await admin.from('subscriptions')
      .select('status').eq('coach_id', coach.id).single()
    return data.status
  }

  beforeAll(async () => {
    coach = await makeUser('coach', 'dunCoach')
    created.push(coach)
    await admin.from('subscriptions').insert({
      coach_id: coach.id,
      status: 'active',
      stripe_customer_id: CUSTOMER,
      stripe_subscription_id: SUBSCRIPTION,
      billing_interval: 'monthly',
    })
  })

  afterAll(async () => {
    await admin.from('stripe_events').delete().in('id', eventIds)
    await admin.from('subscriptions').delete().eq('coach_id', coach.id)
    await cleanupUsers(created)
  })

  it('rejects a payload that is not signed by Stripe', async () => {
    const before = await statusNow()
    const { status } = await deliver(failedEvent(), { secret: 'whsec_not_the_real_secret' })
    expect(status).toBe(400)
    expect(await statusNow(), 'an unsigned event changed real state').toBe(before)
  })

  it('marks the subscription past_due on a genuine failure', async () => {
    await admin.from('subscriptions').update({ status: 'active' }).eq('coach_id', coach.id)
    const { status, body } = await deliver(failedEvent())
    expect(status).toBe(200)
    expect(body.received).toBe(true)
    expect(await statusNow()).toBe('past_due')
  })

  // The dedupe guard, proven by its effect rather than its return value: the
  // row is put back to `active`, the SAME event is delivered again, and if it
  // were reprocessed the status would flip a second time.
  it('ignores a duplicate delivery of the same event', async () => {
    const event = failedEvent()
    await deliver(event)
    expect(await statusNow()).toBe('past_due')

    await admin.from('subscriptions').update({ status: 'active' }).eq('coach_id', coach.id)
    const second = await deliver(event)

    expect(second.status).toBe(200)
    expect(second.body.duplicate).toBe(true)
    expect(await statusNow(), 'a duplicate event was processed twice').toBe('active')
  })

  // The final retry is the one that matters most: `next_payment_attempt` is
  // null, which is the only moment "your subscription will end" is true. It
  // must still be handled rather than tripping over the missing field.
  it('handles the last attempt, where there is no next one', async () => {
    await admin.from('subscriptions').update({ status: 'active' }).eq('coach_id', coach.id)
    const { status } = await deliver(failedEvent({ next_payment_attempt: null }))
    expect(status).toBe(200)
    expect(await statusNow()).toBe('past_due')
  })

  // A failure for a customer we have no row for must not throw: Stripe sends
  // events for objects that predate us, and a 500 here makes Stripe retry
  // forever.
  it('survives an invoice for a subscription it does not know', async () => {
    const { status } = await deliver({
      id: `evt_test_pf_orphan_${Date.now()}`,
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_nobody', subscription: 'sub_nobody', amount_due: 100 } },
    })
    expect(status).toBe(200)
  })
})
