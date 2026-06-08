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

// Returns true only if the customer exists in Stripe and isn't deleted.
// A stored customer ID can be orphaned if the customer was removed in Stripe;
// reusing it would make checkout-session creation fail with "No such customer".
async function customerIsUsable(
  stripeCustomerId: string,
  stripeSecretKey: string,
) {
  const res = await fetch(
    `https://api.stripe.com/v1/customers/${stripeCustomerId}`,
    { headers: { Authorization: `Basic ${btoa(stripeSecretKey + ':')}` } },
  )
  if (!res.ok) return false
  const customer = await res.json().catch(() => null)
  return Boolean(customer) && customer.deleted !== true
}

async function hashEmail(email: string): Promise<string> {
  const pepper = Deno.env.get('EMAIL_HASH_PEPPER') ?? ''
  const data = new TextEncoder().encode(`${pepper}:${email.toLowerCase().trim()}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getLedgerEntry(
  supabaseUrl: string,
  headers: Record<string, string>,
  emailHash: string,
) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/trial_ledger?email_hash=eq.${emailHash}&select=coach_trial_used,solo_trial_used&limit=1`,
    { headers },
  )
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows[0] ?? null : null
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
    if (!stripePriceId) return jsonResponse({ error: 'priceId is required' }, 400)

    // Verify caller
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    })
    const user = await userRes.json()
    if (!user.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const restHeaders = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
    }

    // Get profile
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=id,email,role`,
      { headers: restHeaders },
    )
    const profiles = await profileRes.json()
    const profile = profiles?.[0]
    if (!profileRes.ok || !profile) return jsonResponse({ error: 'Profile not found' }, 404)

    const role = profile.role

    // Only coach and solo can subscribe
    if (role !== 'coach' && role !== 'solo') {
      return jsonResponse({ error: 'Only coaches and solo users can start checkout' }, 403)
    }

    const PAID_STATUSES = ['trialing', 'active', 'past_due']

    // --- COACH FLOW ---
    if (role === 'coach') {
      const existingSubRes = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?coach_id=eq.${user.id}&select=id,stripe_customer_id&limit=1`,
        { headers: restHeaders },
      )
      const existingSubs = await existingSubRes.json()
      if (!existingSubRes.ok) return jsonResponse({ error: 'Unable to fetch subscription' }, 500)

      const existingSub = existingSubs?.[0]
      let stripeCustomerId = existingSub?.stripe_customer_id

      if (stripeCustomerId && !(await customerIsUsable(stripeCustomerId, stripeSecretKey))) {
        stripeCustomerId = null
      }

      if (!stripeCustomerId) {
        const customer = await stripePost('customers', new URLSearchParams({
          email: profile.email || user.email || '',
          'metadata[coach_id]': user.id,
          'metadata[plan_type]': 'coach',
        }), stripeSecretKey)
        stripeCustomerId = customer.id
      }

      const emailHash = await hashEmail(profile.email || user.email || '')
      const ledger = await getLedgerEntry(supabaseUrl, restHeaders, emailHash)
      const coachTrialEligible = !ledger?.coach_trial_used

      const sessionParams = new URLSearchParams({
        customer: stripeCustomerId,
        mode: 'subscription',
        success_url: 'https://www.gardnr.fit/billing/success',
        cancel_url: 'https://www.gardnr.fit/profile',
        'line_items[0][price]': stripePriceId,
        'line_items[0][quantity]': '1',
        'metadata[coach_id]': user.id,
        'metadata[plan_type]': 'coach',
        'subscription_data[metadata][coach_id]': user.id,
        'subscription_data[metadata][plan_type]': 'coach',
      })
      if (coachTrialEligible) sessionParams.set('subscription_data[trial_period_days]', '30')

      const session = await stripePost('checkout/sessions', sessionParams, stripeSecretKey)

      // NOTE: trial usage is recorded by stripe-webhook when the subscription
      // actually enters `trialing` — not here. Marking it at session creation
      // burned the trial when a user opened then abandoned the Stripe page.

      const payload = {
        coach_id: user.id,
        stripe_customer_id: stripeCustomerId,
        stripe_price_id: stripePriceId,
        status: 'incomplete',
      }

      if (existingSub?.id) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?id=eq.${existingSub.id}`,
          {
            method: 'PATCH',
            headers: { ...restHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify(payload),
          },
        )
        if (!res.ok) throw new Error(`Failed to update subscription: ${await res.text()}`)
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
          method: 'POST',
          headers: { ...restHeaders, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(`Failed to create subscription: ${await res.text()}`)
      }

      return jsonResponse({ url: session.url })
    }

    // --- SOLO FLOW ---
    if (role === 'solo') {
      const existingSubRes = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?solo_id=eq.${user.id}&select=id,stripe_customer_id,status&limit=1`,
        { headers: restHeaders },
      )
      const existingSubs = await existingSubRes.json()
      if (!existingSubRes.ok) return jsonResponse({ error: 'Unable to fetch subscription' }, 500)

      const existingSub = existingSubs?.[0]

      const BLOCKED_STATUSES = [...PAID_STATUSES, 'canceled']
      if (existingSub && BLOCKED_STATUSES.includes(existingSub.status)) {
        return jsonResponse({ error: 'Solo subscription already exists' }, 400)
      }

      let stripeCustomerId = existingSub?.stripe_customer_id

      if (stripeCustomerId && !(await customerIsUsable(stripeCustomerId, stripeSecretKey))) {
        stripeCustomerId = null
      }

      if (!stripeCustomerId) {
        const customer = await stripePost('customers', new URLSearchParams({
          email: profile.email || user.email || '',
          'metadata[solo_id]': user.id,
          'metadata[plan_type]': 'solo',
        }), stripeSecretKey)
        stripeCustomerId = customer.id
      }

      const emailHash = await hashEmail(profile.email || user.email || '')
      const ledger = await getLedgerEntry(supabaseUrl, restHeaders, emailHash)
      const soloTrialEligible = !ledger?.solo_trial_used

      const sessionParams = new URLSearchParams({
        customer: stripeCustomerId,
        mode: 'subscription',
        success_url: 'https://www.gardnr.fit/billing/success',
        cancel_url: 'https://www.gardnr.fit/profile',
        'line_items[0][price]': stripePriceId,
        'line_items[0][quantity]': '1',
        'metadata[solo_id]': user.id,
        'metadata[plan_type]': 'solo',
        'subscription_data[metadata][solo_id]': user.id,
        'subscription_data[metadata][plan_type]': 'solo',
      })
      if (soloTrialEligible) sessionParams.set('subscription_data[trial_period_days]', '14')

      const session = await stripePost('checkout/sessions', sessionParams, stripeSecretKey)

      // NOTE: trial usage is recorded by stripe-webhook when the subscription
      // actually enters `trialing` — not here. See coach flow above.

      const payload = {
        solo_id: user.id,
        stripe_customer_id: stripeCustomerId,
        stripe_price_id: stripePriceId,
        status: 'incomplete',
      }

      if (existingSub?.id) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?id=eq.${existingSub.id}`,
          {
            method: 'PATCH',
            headers: { ...restHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify(payload),
          },
        )
        if (!res.ok) throw new Error(`Failed to update subscription: ${await res.text()}`)
      } else {
        const res = await fetch(`${supabaseUrl}/rest/v1/subscriptions`, {
          method: 'POST',
          headers: { ...restHeaders, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(`Failed to create subscription: ${await res.text()}`)
      }

      return jsonResponse({ url: session.url })
    }

    return jsonResponse({ error: 'Unhandled role' }, 400)

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('create-checkout-session error', message)
    return jsonResponse({ error: message }, 500)
  }
})
