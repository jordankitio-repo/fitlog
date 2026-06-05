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

    let canSetLocalPause = true

    if (sub.status === 'active' && sub.stripe_subscription_id) {
      if (!stripeSecretKey) {
        console.error('STRIPE_SECRET_KEY is not configured')
        canSetLocalPause = false
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
          canSetLocalPause = false
        }
      }
    }

    if (!canSetLocalPause) {
      return jsonResponse({ error: 'Failed to pause Stripe subscription' }, 500)
    }

    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}`,
      {
        method: 'PATCH',
        headers: { ...restHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ paused_for_coaching: true }),
      },
    )

    if (!patchRes.ok) {
      const err = await patchRes.text()
      console.error('Failed to set paused_for_coaching:', err)
      return jsonResponse({ error: 'Unable to pause subscription locally' }, 500)
    }

    return jsonResponse({ ok: true, paused: sub.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('pause-solo-subscription error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
