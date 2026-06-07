const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAUSEABLE_STATUSES = ['active', 'trialing']

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

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

    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?solo_id=eq.${user.id}&select=id,status,stripe_subscription_id&limit=1`,
      { headers: restHeaders },
    )
    const subs = await subRes.json()
    if (!subRes.ok) return jsonResponse({ error: 'Unable to fetch subscription' }, 500)

    const sub = subs?.[0]
    if (!sub || !PAUSEABLE_STATUSES.includes(sub.status)) {
      return jsonResponse({ skipped: true, reason: 'no pauseable subscription' })
    }

    let canProceed = true
    let trialDaysRemaining: number | null = null

    // Active: pause Stripe collection before writing DB (no webhook guard needed here)
    if (sub.status === 'active' && sub.stripe_subscription_id) {
      if (!stripeSecretKey) {
        console.error('STRIPE_SECRET_KEY is not configured')
        canProceed = false
      } else {
        const stripeRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
          {
            method: 'POST',
            headers: stripeHeaders(stripeSecretKey),
            body: new URLSearchParams({
              'pause_collection[behavior]': 'void',
            }).toString(),
          },
        )

        if (!stripeRes.ok) {
          const err = await stripeRes.text()
          console.error('Stripe pause failed:', err)
          canProceed = false
        }
      }
    } else if (sub.status === 'trialing' && sub.stripe_subscription_id) {
      // Trialing: only GET trial_end here. The DELETE happens after the DB write
      // so the webhook guard (paused_for_coaching) is set before Stripe fires the event.
      if (!stripeSecretKey) {
        console.error('STRIPE_SECRET_KEY is not configured')
        canProceed = false
      } else {
        const getRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
          { headers: { Authorization: `Basic ${btoa(stripeSecretKey + ':')}` } },
        )
        if (!getRes.ok) {
          console.error('Failed to fetch trialing Stripe subscription:', await getRes.text())
          canProceed = false
        } else {
          const stripeSub = await getRes.json()
          const nowSecs = Math.floor(Date.now() / 1000)
          trialDaysRemaining = Math.max(1, Math.ceil((stripeSub.trial_end - nowSecs) / 86400))
        }
      }
    }

    if (!canProceed) {
      return jsonResponse({ error: 'Failed to pause Stripe subscription' }, 500)
    }

    // DB write first — the webhook guard reads paused_for_coaching before acting on deletion events
    const patchBody: Record<string, unknown> = { paused_for_coaching: true }
    if (trialDaysRemaining !== null) {
      patchBody.paused_trial_days_remaining = trialDaysRemaining
    }

    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}`,
      {
        method: 'PATCH',
        headers: { ...restHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify(patchBody),
      },
    )

    if (!patchRes.ok) {
      const err = await patchRes.text()
      console.error('Failed to set paused_for_coaching:', err)
      return jsonResponse({ error: 'Unable to pause subscription locally' }, 500)
    }

    // Trialing: cancel on Stripe now that the DB guard is committed
    if (sub.status === 'trialing' && sub.stripe_subscription_id && trialDaysRemaining !== null) {
      const cancelRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Basic ${btoa(stripeSecretKey! + ':')}` },
        },
      )
      if (!cancelRes.ok) {
        console.error('Failed to cancel trialing Stripe subscription:', await cancelRes.text())
        // Roll back the DB write so the sub doesn't stay in a phantom-paused state
        await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}`,
          {
            method: 'PATCH',
            headers: { ...restHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ paused_for_coaching: false, paused_trial_days_remaining: null }),
          },
        )
        return jsonResponse({ error: 'Failed to cancel Stripe subscription' }, 500)
      }
    }

    return jsonResponse({ ok: true, paused: sub.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('pause-solo-subscription error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
