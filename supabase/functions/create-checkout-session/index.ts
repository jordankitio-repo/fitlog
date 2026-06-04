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
    'Authorization': `Basic ${btoa(stripeSecretKey + ':')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

async function stripePost(
  path: string,
  params: URLSearchParams,
  stripeSecretKey: string,
) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: stripeHeaders(stripeSecretKey),
    body: params.toString(),
  })

  const data = await response.json()

  if (!response.ok) {
    const message = data?.error?.message || `Stripe ${path} request failed`
    throw new Error(message)
  }

  return data
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

    if (!stripeSecretKey) {
      return jsonResponse({ error: 'STRIPE_SECRET_KEY is not configured' }, 500)
    }

    const { priceId, price_id } = await req.json()
    const stripePriceId = priceId || price_id

    if (!stripePriceId) {
      return jsonResponse({ error: 'priceId is required' }, 400)
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    })
    const user = await userRes.json()

    if (!user.id) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const restHeaders = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
    }

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=id,email,role`,
      { headers: restHeaders },
    )
    const profiles = await profileRes.json()
    const profile = profiles?.[0]

    if (!profileRes.ok || !profile) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    if (profile.role !== 'coach') {
      return jsonResponse({ error: 'Only coaches can start checkout' }, 403)
    }

    const existingSubRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?coach_id=eq.${user.id}&select=id,stripe_customer_id&limit=1`,
      { headers: restHeaders },
    )
    const existingSubscriptions = await existingSubRes.json()

    if (!existingSubRes.ok) {
      return jsonResponse({ error: 'Unable to fetch subscription' }, 500)
    }

    const existingSubscription = existingSubscriptions?.[0]
    let stripeCustomerId = existingSubscription?.stripe_customer_id

    if (!stripeCustomerId) {
      const customerParams = new URLSearchParams({
        email: profile.email || user.email || '',
        'metadata[coach_id]': user.id,
      })

      const customer = await stripePost('customers', customerParams, stripeSecretKey)
      stripeCustomerId = customer.id
    }

    const sessionParams = new URLSearchParams({
      customer: stripeCustomerId,
      mode: 'subscription',
      success_url: 'https://www.tryfitlog.com/billing/success',
      cancel_url: 'https://www.tryfitlog.com/profile',
      'line_items[0][price]': stripePriceId,
      'line_items[0][quantity]': '1',
      'subscription_data[trial_period_days]': '30',
      'metadata[coach_id]': user.id,
      'subscription_data[metadata][coach_id]': user.id,
    })

    const checkoutSession = await stripePost(
      'checkout/sessions',
      sessionParams,
      stripeSecretKey,
    )

    const subscriptionPayload = {
      coach_id: user.id,
      stripe_customer_id: stripeCustomerId,
      stripe_price_id: stripePriceId,
      status: 'incomplete',
    }

    if (existingSubscription?.id) {
      const updateRes = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?id=eq.${existingSubscription.id}`,
        {
          method: 'PATCH',
          headers: { ...restHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify(subscriptionPayload),
        },
      )

      if (!updateRes.ok) {
        const error = await updateRes.text()
        throw new Error(`Failed to update subscription: ${error}`)
      }
    } else {
      const createRes = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
        method: 'POST',
        headers: { ...restHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify(subscriptionPayload),
      })

      if (!createRes.ok) {
        const error = await createRes.text()
        throw new Error(`Failed to create subscription: ${error}`)
      }
    }

    return jsonResponse({ url: checkoutSession.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 500)
  }
})
