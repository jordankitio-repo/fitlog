// Pause and resume a coach's billing.
//
// See 20261019140000_subscription_pause.sql for what a pause is and why the
// two limits exist. The short version: billing stops, nothing else changes,
// three months maximum, once a year.
//
// NOT the same function as pause-solo-subscription. That one is automatic and
// fires when a solo user accepts a coaching invite, so they do not pay for
// their own subscription and their coach's at once. This one is a choice a
// coach makes, with limits, and the two should not be merged just because they
// both call pause_collection: a shared function would have to carry both sets
// of rules and apply neither clearly.

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

const MAX_MONTHS = 3
const COOLDOWN_MONTHS = 12

async function withinRateLimit(supabaseUrl: string, serviceKey: string, userId: string) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_bucket: 'pause-subscription', p_limit: 5, p_window_seconds: 3600 }),
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
    const body = (await req.json().catch(() => ({}))) as {
      action?: string
      months?: number
      requestId?: string
    }

    if (body.action !== 'pause' && body.action !== 'resume') {
      return jsonResponse({ error: 'Invalid action' }, 400)
    }
    const action = body.action

    // Validated as an integer in range, not coerced. `months: 36` arriving
    // from a tampered client must be a refusal, not a three-year free ride,
    // and `Number(x) || 3` would turn both 0 and "abc" into a default the
    // caller never asked for.
    const months = action === 'pause' ? body.months : null
    if (action === 'pause' && !(Number.isInteger(months) && months! >= 1 && months! <= MAX_MONTHS)) {
      return jsonResponse({ error: `Choose between 1 and ${MAX_MONTHS} months` }, 400)
    }

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

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      { headers: restHeaders },
    )
    const profiles = await profileRes.json()
    if (!profileRes.ok || profiles?.[0]?.role !== 'coach') {
      return jsonResponse({ error: 'No subscription to pause for this role' }, 403)
    }

    if (!(await withinRateLimit(supabaseUrl, serviceKey, user.id))) {
      return jsonResponse({ error: 'Too many requests. Try again later.' }, 429)
    }

    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?coach_id=eq.${user.id}&select=id,stripe_subscription_id,status,cancel_at_period_end,paused_until,last_paused_at&limit=1`,
      { headers: restHeaders },
    )
    const subs = await subRes.json()
    if (!subRes.ok) return jsonResponse({ error: 'Unable to fetch subscription' }, 500)

    const sub = subs?.[0]
    if (!sub?.stripe_subscription_id) {
      return jsonResponse({ error: 'No subscription to pause' }, 404)
    }

    const isPaused = Boolean(sub.paused_until) && new Date(sub.paused_until) > new Date()

    if (action === 'pause') {
      if (isPaused) return jsonResponse({ error: 'Your subscription is already paused' }, 409)

      // `active` only, and the two exclusions are both about not handing
      // someone a way out of something they owe.
      //
      //   trialing — a trial is already free. Pausing it would stack free time
      //              on free time, and there is no payment to defer.
      //   past_due — there is an unpaid invoice. `behavior: void` voids FUTURE
      //              invoices, so pausing here would look like it settled the
      //              debt while leaving it exactly where it was.
      if (sub.status !== 'active') {
        const why = sub.status === 'trialing'
          ? 'Your trial is already free. You can pause once billing starts.'
          : sub.status === 'past_due'
            ? 'Update your payment method before pausing.'
            : 'You need an active subscription to pause.'
        return jsonResponse({ error: why }, 409)
      }

      if (sub.cancel_at_period_end) {
        return jsonResponse({ error: 'Resume your subscription before pausing it.' }, 409)
      }

      // Once per twelve months, measured from the START of the last pause.
      // Enforced HERE and not only in the UI: a hidden button is a suggestion.
      if (sub.last_paused_at) {
        const eligibleFrom = new Date(sub.last_paused_at)
        eligibleFrom.setMonth(eligibleFrom.getMonth() + COOLDOWN_MONTHS)
        if (eligibleFrom > new Date()) {
          return jsonResponse({
            error: `Pausing is available once a year. You can pause again from ${eligibleFrom.toISOString().slice(0, 10)}.`,
            eligibleFrom: eligibleFrom.toISOString(),
          }, 409)
        }
      }
    }

    if (action === 'resume' && !isPaused) {
      return jsonResponse({ error: 'Your subscription is not paused' }, 409)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is not configured')
      return jsonResponse({ error: 'Billing is not configured' }, 500)
    }

    const params = new URLSearchParams()
    let resumesAt: Date | null = null

    if (action === 'pause') {
      resumesAt = new Date()
      resumesAt.setMonth(resumesAt.getMonth() + months!)
      params.set('pause_collection[behavior]', 'void')
      // Stripe ends the pause itself on this date. A pause that needs someone
      // to remember to end it ends when someone remembers.
      params.set('pause_collection[resumes_at]', String(Math.floor(resumesAt.getTime() / 1000)))
    } else {
      // An empty value is how Stripe is told to CLEAR pause_collection.
      // Omitting the key entirely leaves the pause exactly where it was, which
      // would make Resume a button that reported success and did nothing.
      params.set('pause_collection', '')
    }

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
      {
        method: 'POST',
        headers: {
          ...stripeHeaders(stripeSecretKey),
          ...idempotencyHeader(`pause:${user.id}:${sub.stripe_subscription_id}:${action}`, body.requestId),
        },
        body: params.toString(),
      },
    )
    const updated = await stripeRes.json().catch(() => null)

    if (!stripeRes.ok) {
      console.error(`${action} failed:`, updated?.error?.message)
      return jsonResponse({ error: `Could not ${action} your subscription.` }, 502)
    }

    // Read the pause back from Stripe's response rather than from what we
    // asked for. If Stripe normalised the date, the row records what will
    // actually happen instead of what we intended.
    const confirmedResumesAt = updated?.pause_collection?.resumes_at
      ? new Date(updated.pause_collection.resumes_at * 1000).toISOString()
      : null

    const patch: Record<string, unknown> = { paused_until: confirmedResumesAt }
    if (action === 'pause') patch.last_paused_at = new Date().toISOString()

    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}`,
      {
        method: 'PATCH',
        headers: { ...restHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      },
    )
    if (!patchRes.ok) {
      console.error('Pause changed in Stripe but local update failed:', await patchRes.text())
    }

    return jsonResponse({ ok: true, action, pausedUntil: confirmedResumesAt })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('pause-subscription error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
