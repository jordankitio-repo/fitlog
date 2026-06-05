// v2
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
  clientId: string,
) {
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'Content-Type': 'application/json'
  }

  const subRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?solo_id=eq.${clientId}&paused_for_coaching=eq.true&select=id,status,stripe_subscription_id&limit=1`,
    { headers }
  )
  const subText = await subRes.text()

  if (!subRes.ok) {
    console.error('Failed to fetch paused solo subscription:', subText)
    return
  }

  const sub = JSON.parse(subText || '[]')?.[0]
  if (!sub) return

  let canClearLocalPause = true
  if (sub.status === 'active' && sub.stripe_subscription_id) {
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
        }
      )

      if (!stripeRes.ok) {
        const err = await stripeRes.text()
        console.error('Stripe resume failed:', err)
        canClearLocalPause = false
      }
    }
  }

  if (!canClearLocalPause) return

  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ paused_for_coaching: false }),
    }
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
    const { clientId } = await req.json()
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

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'Missing clientId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify user from token
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey }
    })
    const user = await userRes.json()
    if (!user.id) throw new Error('Unauthorized')
    const requestingUserId = user.id

    const headers = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json'
    }

    // Confirm the authenticated user is actually this client's active coach.
    const relationshipRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?select=id&coach_id=eq.${requestingUserId}&client_id=eq.${clientId}&status=eq.active`,
      { headers }
    )
    const relationshipText = await relationshipRes.text()

    if (!relationshipRes.ok) {
      throw new Error(`Failed to verify coach-client relationship: ${relationshipText}`)
    }

    const relationships = JSON.parse(relationshipText)
    const relationship = relationships[0]
    if (!relationship) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const now = new Date().toISOString()

    const offboardRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?id=eq.${relationship.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'offboarded', offboarded_at: now }),
      }
    )
    const offboardText = await offboardRes.text()

    if (!offboardRes.ok) {
      throw new Error(`Failed to offboard client: ${offboardText}`)
    }

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${clientId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: 'solo' }),
      }
    )
    const profileText = await profileRes.text()

    if (!profileRes.ok) {
      throw new Error(`Failed to update client profile: ${profileText}`)
    }

    await resumeSoloSubscription(supabaseUrl, serviceKey, clientId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
