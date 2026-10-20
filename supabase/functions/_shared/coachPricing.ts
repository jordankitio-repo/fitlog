// The coach billing ladder: three cadences, three Stripe prices, one mapping.
//
// It lived inside create-checkout-session as a local object, which was fine
// while checkout was the only place a cadence could be chosen. It is not any
// more: a coach can now change cadence from the Billing card, and the webhook
// has to work out which cadence a subscription ended up on.
//
// THE RULE THAT MADE THIS A MODULE. The price is resolved HERE, server-side,
// from a validated cadence LABEL — never taken from the request. `VITE_*` ships
// in the JS bundle, so a browser-supplied price ID once meant a coach could
// pass the cheapest one and get coach access at that rate. A tier whose price
// the client selects is not a tier.
//
// Env (server-side, NOT VITE_*):
//   STRIPE_COACH_PRICE_MONTHLY / _6MO / _ANNUAL
export const COACH_CADENCES = ['monthly', '6mo', 'annual'] as const
export type CoachCadence = (typeof COACH_CADENCES)[number]

export function isCoachCadence(value: unknown): value is CoachCadence {
  return typeof value === 'string' && (COACH_CADENCES as readonly string[]).includes(value)
}

const ENV_BY_CADENCE: Record<CoachCadence, string> = {
  monthly: 'STRIPE_COACH_PRICE_MONTHLY',
  '6mo': 'STRIPE_COACH_PRICE_6MO',
  annual: 'STRIPE_COACH_PRICE_ANNUAL',
}

// The Stripe Price for a cadence, or null when it is not configured. Callers
// must fail CLOSED on null: refuse the operation rather than fall back to
// another cadence, which would be choosing a price on the coach's behalf.
export function coachPriceId(cadence: CoachCadence): string | null {
  return Deno.env.get(ENV_BY_CADENCE[cadence]) ?? null
}

// The reverse: which cadence is this subscription actually on?
//
// This exists because `billing_interval` used to be written from
// `subscription.metadata.cadence`, which is stamped once at checkout and never
// again. The moment a subscription's PRICE could change without going through
// checkout — a cadence switch here, or a plan switch in Stripe's own billing
// portal — that metadata became a record of what the coach first bought rather
// than what they are paying now. A coach who moved monthly to annual would
// have kept `billing_interval: 'monthly'`, and the Billing card would have read
// "$49/month." while Stripe charged $490/year. The price ID is the fact; the
// metadata was a memory of one.
//
// Returns null for an unrecognised price (a legacy price, or an environment
// with no price env set), so a caller can leave the stored value alone rather
// than overwrite it with a guess.
export function cadenceForPrice(priceId: string | null | undefined): CoachCadence | null {
  if (!priceId) return null
  for (const cadence of COACH_CADENCES) {
    if (coachPriceId(cadence) === priceId) return cadence
  }
  return null
}
