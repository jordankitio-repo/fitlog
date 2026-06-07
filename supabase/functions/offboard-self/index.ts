const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function stripeHeaders(stripeSecretKey: string) {
  return {
    'Authorization': `Basic ${btoa(stripeSecretKey + ':')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  }
}

async function resumeSoloSubscription(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
) {
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'Content-Type': 'application/json',
  }

  const subRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?solo_id=eq.${userId}&paused_for_coaching=eq.true&select=id,status,stripe_subscription_id,paused_trial_days_remaining,stripe_customer_id,stripe_price_id&limit=1`,
    { headers },
  )
  const subText = await subRes.text()

  if (!subRes.ok) {
    console.error('Failed to fetch paused solo subscription:', subText)
    return
  }

  const sub = JSON.parse(subText || '[]')?.[0]
  if (!sub) return

  let canClearLocalPause = true
  let newStripeSubId: string | null = null

  if (sub.paused_trial_days_remaining != null) {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is not configured')
      canClearLocalPause = false
    } else {
      let defaultPm: string | null = null
      if (sub.stripe_customer_id) {
        const customerRes = await fetch(
          `https://api.stripe.com/v1/customers/${sub.stripe_customer_id}`,
          { headers: { Authorization: `Basic ${btoa(stripeSecretKey + ':')}` } },
        )
        if (customerRes.ok) {
          const customer = await customerRes.json()
          defaultPm = customer?.invoice_settings?.default_payment_method ?? null
        }
      }

      const subParams = new URLSearchParams({
        customer: sub.stripe_customer_id,
        'items[0][price]': sub.stripe_price_id,
        trial_period_days: String(sub.paused_trial_days_remaining),
        'metadata[solo_id]': userId,
        'metadata[plan_type]': 'solo',
      })
      if (defaultPm) subParams.set('default_payment_method', defaultPm)

      const newSubRes = await fetch('https://api.stripe.com/v1/subscriptions', {
        method: 'POST',
        headers: stripeHeaders(stripeSecretKey),
        body: subParams.toString(),
      })

      if (!newSubRes.ok) {
        console.error('Failed to recreate Stripe subscription:', await newSubRes.text())
        canClearLocalPause = false
      } else {
        const newSub = await newSubRes.json()
        newStripeSubId = newSub.id
      }
    }
  } else if (sub.status === 'active' && sub.stripe_subscription_id) {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is not configured')
      canClearLocalPause = false
    } else {
      const stripeRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`,
        {
          method: 'POST',
          headers: stripeHeaders(stripeSecretKey),
          body: new URLSearchParams({ pause_collection: '' }).toString(),
        },
      )

      if (!stripeRes.ok) {
        const err = await stripeRes.text()
        console.error('Stripe resume failed:', err)
        canClearLocalPause = false
      }
    }
  }

  if (!canClearLocalPause) return

  const patchPayload: Record<string, unknown> = { paused_for_coaching: false }
  if (newStripeSubId) {
    patchPayload.paused_trial_days_remaining = null
    patchPayload.stripe_subscription_id = newStripeSubId
    patchPayload.status = 'trialing'
  }

  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(patchPayload),
    },
  )

  if (!patchRes.ok) {
    const err = await patchRes.text()
    console.error('Failed to clear paused_for_coaching:', err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    })
    const user = await userRes.json()
    if (!user.id) throw new Error('Unauthorized')

    const headers = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
    }

    const now = new Date().toISOString()

    const offboardRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?client_id=eq.${user.id}&status=eq.active`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'offboarded', offboarded_at: now }),
      },
    )
    const offboardText = await offboardRes.text()

    if (!offboardRes.ok) {
      throw new Error(`Failed to offboard client: ${offboardText}`)
    }

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: 'solo' }),
      },
    )
    const profileText = await profileRes.text()

    if (!profileRes.ok) {
      throw new Error(`Failed to update profile: ${profileText}`)
    }

    await resumeSoloSubscription(supabaseUrl, serviceKey, user.id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
