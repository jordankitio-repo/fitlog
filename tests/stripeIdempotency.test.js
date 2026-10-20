// The idempotency key the billing functions attach to Stripe writes.
//
// The failure it prevents is invisible from both ends: Stripe does the work and
// then the RESPONSE is what goes missing. The coach taps again, a second
// subscription update goes out, and they are invoiced twice for one decision.
// Both requests were valid, both succeeded, and the only trace is on a card
// statement.
//
// These assert the properties the header has to have, because getting any one
// of them wrong produces something that looks like protection and isn't:
//
//   * a non-UUID is DROPPED, not passed through or sanitised
//   * no key at all means NO header, rather than a freshly invented one
//     (a key generated per call differs every call and protects nothing)
//   * the same request id in two different operations does not collide
//   * the same request id for the same operation DOES produce the same key
//
// The helper is imported from the shipped source rather than restated here. It
// is Deno TypeScript, but it touches no Deno API, so vite transpiles it like
// any other module — which is the only reason this can be a fast unit test
// instead of needing the stack up.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { idempotencyHeader } from '../supabase/functions/_shared/stripeIdempotency.ts'

const UUID = '3f1a9b2c-7d4e-4a6b-9c8d-0e1f2a3b4c5d'

describe('stripe idempotency key', () => {
  it('produces a header for a valid uuid', () => {
    const h = idempotencyHeader('cadence:user-1:sub_1', UUID)
    expect(h['Idempotency-Key']).toBe(`cadence:user-1:sub_1:${UUID}`)
  })

  it('is stable: the same attempt retried yields the same key', () => {
    expect(idempotencyHeader('checkout:user-1', UUID))
      .toEqual(idempotencyHeader('checkout:user-1', UUID))
  })

  // Two operations, one request id. Without the scope the second would replay
  // the first's response, and a coach would get a checkout session back from a
  // cadence change.
  it('does not let one request id collide across operations', () => {
    const a = idempotencyHeader('checkout:user-1', UUID)['Idempotency-Key']
    const b = idempotencyHeader('cadence:user-1:sub_1', UUID)['Idempotency-Key']
    expect(a).not.toBe(b)
  })

  it('does not let two users share a key', () => {
    const a = idempotencyHeader('checkout:user-1', UUID)['Idempotency-Key']
    const b = idempotencyHeader('checkout:user-2', UUID)['Idempotency-Key']
    expect(a).not.toBe(b)
  })

  // Absence must be absence. Inventing a key here would differ on every call,
  // so it would look like protection while providing none — worse than nothing,
  // because nobody would look again.
  it('returns no header at all when the caller sent nothing usable', () => {
    for (const bad of [undefined, null, '', 'not-a-uuid', 42, {}, [], `${UUID} `, `${UUID}x`]) {
      expect(idempotencyHeader('checkout:user-1', bad), `accepted ${JSON.stringify(bad)}`).toEqual({})
    }
  })

  it('accepts an uppercase uuid, since the format is case-insensitive', () => {
    const h = idempotencyHeader('checkout:user-1', UUID.toUpperCase())
    expect(h['Idempotency-Key']).toContain(UUID.toUpperCase())
  })

  // A header value cannot carry a newline without becoming two headers. The
  // UUID check already forbids it; this asserts the consequence rather than the
  // mechanism, so a looser check later still fails here.
  it('cannot be used to inject a second header', () => {
    expect(idempotencyHeader('checkout:user-1', `${UUID}\r\nX-Evil: 1`)).toEqual({})
  })
})

// A helper nobody calls is the whole failure mode this file exists to catch.
describe('the functions that move money attach one', () => {
  it.each([
    ['change-cadence', 'supabase/functions/change-cadence/index.ts'],
    ['create-checkout-session', 'supabase/functions/create-checkout-session/index.ts'],
  ])('%s imports and uses it', (_name, path) => {
    const fn = readFileSync(path, 'utf8')
    expect(fn).toContain("from '../_shared/stripeIdempotency.ts'")
    expect(fn).toContain('idempotencyHeader(')
  })

  it.each([
    ['SubscriptionManager', 'src/components/SubscriptionManager.jsx'],
    ['CoachPaywall', 'src/components/CoachPaywall.jsx'],
  ])('%s sends a fresh request id', (_name, path) => {
    const ui = readFileSync(path, 'utf8')
    expect(ui).toContain('crypto.randomUUID()')
    expect(ui).toMatch(/requestId/)
  })
})
