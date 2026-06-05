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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action } = await req.json()
    if (action !== 'cancel' && action !== 'resume') {
      return jsonResponse({ error: 'Invalid action' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

    if (!stripeSecretKey) {
      return jsonResponse({ error: 'STRIPE_SECRET_KEY is not configured' }, 500)
    }

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
    const role = profiles?.[0]?.role

    if (!profileRes.ok || (role !== 'coach' && role !== 'solo')) {
      return jsonResponse({ error: 'No subscription to manage for this role' }, 400)
    }

    const idColumn = role === 'coach' ? 'coach_id' : 'solo_id'
    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?${idColumn}=eq.${user.id}&select=id,stripe_subscription_id&limit=1`,
      { headers: restHeaders },
    )
    const subs = await subRes.json()
    const sub = subs?.[0]

    if (!subRes.ok) {
      return jsonResponse({ error: 'Unable to fetch subscription' }, 500)
    }

    if (!sub?.stripe_subscription_id) {
      return jsonResponse({ error: 'No active subscription found' }, 404)
    }

    const cancelAtPeriodEnd = action === 'cancel'
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
      {
        method: 'POST',
        headers: stripeHeaders(stripeSecretKey),
        body: new URLSearchParams({
          cancel_at_period_end: cancelAtPeriodEnd ? 'true' : 'false',
        }).toString(),
      },
    )

    if (!stripeRes.ok) {
      const err = await stripeRes.text()
      console.error(`Stripe ${action} failed:`, err)
      return jsonResponse({ error: `Failed to ${action} subscription` }, 500)
    }

    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}`,
      {
        method: 'PATCH',
        headers: { ...restHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ cancel_at_period_end: cancelAtPeriodEnd }),
      },
    )

    if (!patchRes.ok) {
      const err = await patchRes.text()
      console.error('Failed to update local cancellation flag:', err)
      return jsonResponse({ error: 'Failed to update subscription locally' }, 500)
    }

    return jsonResponse({ ok: true, action })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('cancel-subscription error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
