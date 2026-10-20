// Moves a coach between the three billing cadences: $49/month, $264/6 months,
// $490/year.
//
// WHY THIS EXISTS. The ladder was selectable exactly once, at first checkout.
// `create-checkout-session` refuses a second checkout while a subscription is
// live, and CoachPaywall (the only cadence picker) renders only when there
// isn't one — so a coach on monthly had no way to reach annual, in the app or
// anywhere else. Annual is the cadence the business most wants people on, and
// it sat behind a control that did not exist.
//
// PRORATION: `always_invoice`, both directions, immediately.
//
// Stripe invoices the difference the moment the switch happens. Going up,
// monthly to annual, that charges the annual price less the unused part of the
// month, today. Going down, annual to monthly, the unused year becomes a
// CREDIT balance that eats future monthly invoices — free months rather than
// cash back, which is correct: they prepaid for time they still own.
//
// `create_prorations` (Stripe's default) was wrong here and the failure is
// quiet: it parks the adjustment on the NEXT invoice, and switching to annual
// makes the next invoice a year away. A coach would have got twelve months of
// annual access and been billed for the difference at the end of it.
//
// WHAT THIS FUNCTION DOES NOT TRUST. The caller sends a cadence LABEL. The
// Stripe Price is resolved server-side from that label via _shared/coachPricing,
// the same discipline as checkout — a tier whose price the client picks is not
// a tier. Unlike checkout, an unknown label is REJECTED rather than defaulted:
// defaulting to monthly at checkout costs nobody anything, but defaulting here
// would silently downgrade a paying coach who sent a typo.

import { coachPriceId, isCoachCadence } from '../_shared/coachPricing.ts'
import { idempotencyHeader } from '../_shared/stripeIdempotency.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function stripeHeaders(stripeSecretKey: string) {
  return {
    Authorization: `Basic ${btoa(stripeSecretKey + ':')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

// Cadence changes are not something a person does twice in a minute, and each
// one can move money. Tighter than the portal's limit, and it fails OPEN like
// every other caller of this RPC.
async function withinRateLimit(supabaseUrl: string, serviceKey: string, userId: string) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_bucket: 'change-cadence', p_limit: 5, p_window_seconds: 3600 }),
    })
    if (!res.ok) return true
    return (await res.json()) === true
  } catch {
    return true
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { cadence?: string; requestId?: string }
    if (!isCoachCadence(body.cadence)) {
      return jsonResponse({ error: 'Unknown billing cadence' }, 400)
    }
    const cadence = body.cadence

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    const user = await userRes.json()
    if (!user.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const restHeaders = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    }

    // Coach only. The ladder is the coach plan; solo billing is retired and
    // had a single price, so there is nothing for a solo user to move between.
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      { headers: restHeaders },
    )
    const profiles = await profileRes.json()
    if (!profileRes.ok || profiles?.[0]?.role !== 'coach') {
      return jsonResponse({ error: 'No billing cadence to change for this role' }, 403)
    }

    if (!(await withinRateLimit(supabaseUrl, serviceKey, user.id))) {
      return jsonResponse({ error: 'Too many changes. Try again later.' }, 429)
    }

    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?coach_id=eq.${user.id}&select=id,stripe_subscription_id,status,billing_interval,cancel_at_period_end&limit=1`,
      { headers: restHeaders },
    )
    const subs = await subRes.json()
    if (!subRes.ok) return jsonResponse({ error: 'Unable to fetch subscription' }, 500)

    const sub = subs?.[0]
    if (!sub?.stripe_subscription_id || !['trialing', 'active', 'past_due'].includes(sub.status)) {
      return jsonResponse({ error: 'No active subscription to change' }, 404)
    }

    // A subscription already scheduled to cancel has an end date the coach was
    // told about ("You'll keep access until <date>"). Repricing it would move
    // that date, or silently un-cancel it, and either way the promise on the
    // card stops being true. Resuming first is one click and makes the
    // intention explicit.
    if (sub.cancel_at_period_end) {
      return jsonResponse({ error: 'Resume your subscription before changing cadence.' }, 409)
    }

    if (sub.billing_interval === cadence) {
      return jsonResponse({ error: 'Already on that billing cadence' }, 400)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is not configured')
      return jsonResponse({ error: 'Billing is not configured' }, 500)
    }

    const priceId = coachPriceId(cadence)
    if (!priceId) {
      console.error(`No Stripe price configured for cadence "${cadence}"`)
      return jsonResponse({ error: 'That plan is not available right now' }, 500)
    }

    // The item id is required to REPLACE the price rather than ADD a second
    // one. Posting `items[0][price]` without `items[0][id]` appends a line, and
    // the coach ends up subscribed to two cadences at once — billed for both,
    // with nothing in our own tables showing it.
    const currentRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
      { headers: { Authorization: `Basic ${btoa(stripeSecretKey + ':')}` } },
    )
    const current = await currentRes.json().catch(() => null)
    if (!currentRes.ok || !current?.items?.data?.length) {
      console.error('Could not read subscription from Stripe:', current?.error?.message)
      return jsonResponse({ error: 'Could not read your subscription.' }, 502)
    }

    const itemId = current.items.data[0].id
    if (current.items.data[0].price?.id === priceId) {
      // Stripe and our row disagree. Stripe is the truth about what is being
      // charged, so refuse rather than issue a no-op invoice; the webhook will
      // reconcile `billing_interval` on the next event either way.
      return jsonResponse({ error: 'Already on that billing cadence' }, 400)
    }

    const params = new URLSearchParams({
      'items[0][id]': itemId,
      'items[0][price]': priceId,
      proration_behavior: 'always_invoice',
      // Keep the metadata honest even though nothing reads it for display any
      // more. The webhook derives the interval from the price now, precisely
      // because this field used to go stale the moment a price changed.
      'metadata[cadence]': cadence,
    })

    // This call invoices the coach immediately, so a retry that is really the
    // same tap must not become a second invoice. The key is scoped by user and
    // by subscription as well as by the browser's request id.
    const updateRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
      {
        method: 'POST',
        headers: {
          ...stripeHeaders(stripeSecretKey),
          ...idempotencyHeader(`cadence:${user.id}:${sub.stripe_subscription_id}`, body.requestId),
        },
        body: params.toString(),
      },
    )
    const updated = await updateRes.json().catch(() => null)

    if (!updateRes.ok) {
      const message = updated?.error?.message || 'Stripe subscription update failed'
      console.error('change-cadence failed:', message)
      // A declined card on an upgrade is the one failure a coach can act on,
      // so it says so instead of "something went wrong".
      if (updated?.error?.code === 'card_declined') {
        return jsonResponse({ error: 'Your card was declined. Update your payment method and try again.' }, 402)
      }
      return jsonResponse({ error: 'Could not change your plan.' }, 502)
    }

    // Write through immediately rather than waiting for the webhook. The coach
    // is looking at the Billing card right now, and `customer.subscription.updated`
    // arrives whenever it arrives — it will set the same value from the same
    // price, so the two cannot disagree.
    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}`,
      {
        method: 'PATCH',
        headers: { ...restHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({
          billing_interval: cadence,
          stripe_price_id: priceId,
          status: updated.status,
          current_period_end: updated.current_period_end
            ? new Date(updated.current_period_end * 1000).toISOString()
            : null,
        }),
      },
    )
    if (!patchRes.ok) {
      // Stripe already changed. Don't report failure to the coach for a local
      // bookkeeping miss the webhook will correct; log it loudly instead.
      console.error('Cadence changed in Stripe but local update failed:', await patchRes.text())
    }

    return jsonResponse({ ok: true, cadence })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('change-cadence error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
