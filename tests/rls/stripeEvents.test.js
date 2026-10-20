// Webhook de-duplication: Stripe delivers at least once, and two of our
// handlers cannot run twice.
//
// `customer.subscription.deleted` offboards every one of a coach's clients,
// flips their roles to solo and emails all of them. `checkout.session.completed`
// burns the free trial. Everything else in that switch is idempotent by luck
// rather than design — setting a status to `active` twice is harmless — which
// is exactly why the two that aren't went unnoticed.
//
// The claim is a four-state problem and the obvious implementations each get
// one of them wrong, so all four are asserted here:
//
//   first delivery              -> process
//   duplicate while in flight   -> skip        (or the roster is emailed twice)
//   duplicate after completion  -> skip
//   a previous attempt CRASHED  -> process     (or the work never happens)
//
// The last one is what rules out the simplest version, "insert the id and skip
// on conflict": it records the event before the work, so a crash halfway
// through means Stripe retries, we skip, and a coach's subscription silently
// never gets handled.
import { afterAll, describe, expect, it } from 'vitest'
import { admin } from './helpers.js'

const claim = async (id, type = 'customer.subscription.deleted') => {
  const { data, error } = await admin.rpc('claim_stripe_event', { p_event_id: id, p_type: type })
  if (error) throw new Error(`claim_stripe_event: ${error.message}`)
  return data
}

const complete = async (id) => {
  const { error } = await admin.rpc('complete_stripe_event', { p_event_id: id })
  if (error) throw new Error(`complete_stripe_event: ${error.message}`)
}

const ids = []
const freshId = () => {
  const id = `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  ids.push(id)
  return id
}

describe('stripe event de-duplication', () => {
  afterAll(async () => {
    await admin.from('stripe_events').delete().in('id', ids)
  })

  it('processes an event the first time it arrives', async () => {
    expect(await claim(freshId())).toBe(true)
  })

  it('skips a duplicate that arrives while the first is still running', async () => {
    const id = freshId()
    expect(await claim(id)).toBe(true)
    expect(await claim(id), 'the same event was handed out twice').toBe(false)
  })

  it('skips a duplicate that arrives after the work finished', async () => {
    const id = freshId()
    await claim(id)
    await complete(id)
    expect(await claim(id)).toBe(false)
  })

  // The case the naive implementation gets wrong. A claim that was never
  // completed and has gone quiet is a crashed attempt, and Stripe's retry is
  // the only thing that will ever pick it up again.
  it('re-processes an attempt that was claimed but never finished', async () => {
    const id = freshId()
    await admin.from('stripe_events').insert({
      id,
      type: 'customer.subscription.deleted',
      claimed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    })
    expect(await claim(id), 'a crashed attempt was never retried').toBe(true)
  })

  // ...but not one that finished, however long ago. Staleness must never
  // resurrect completed work: Stripe can re-send an old event, and offboarding
  // a roster a second time is not recoverable by apology.
  it('never re-processes a completed event, however old', async () => {
    const id = freshId()
    await admin.from('stripe_events').insert({
      id,
      type: 'customer.subscription.deleted',
      claimed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      processed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    expect(await claim(id)).toBe(false)
  })

  it('tracks each event id separately', async () => {
    const a = freshId()
    const b = freshId()
    expect(await claim(a)).toBe(true)
    expect(await claim(b), 'one event blocked an unrelated one').toBe(true)
  })

  // Same lockdown as every other SECURITY DEFINER function here. A signed-in
  // user who could call this would be able to mark a real Stripe event as
  // handled and make the webhook drop it on the floor.
  it('is not callable by anyone but the service role', async () => {
    const { makeUser, cleanupUsers } = await import('./helpers.js')
    const user = await makeUser('solo', 'evtProbe')
    const { error } = await user.client.rpc('claim_stripe_event', {
      p_event_id: 'evt_probe', p_type: 'x',
    })
    expect(error).not.toBeNull()
    const done = await user.client.rpc('complete_stripe_event', { p_event_id: 'evt_probe' })
    expect(done.error).not.toBeNull()
    await cleanupUsers([user])
  })
})
