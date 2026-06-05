const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<boolean> {
  const parts = header.split(',')
  const timestamp = parts.find((p) => p.startsWith('t='))?.split('=')[1]
  const signature = parts.find((p) => p.startsWith('v1='))?.split('=')[1]

  if (!timestamp || !signature) return false

  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload),
  )
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return expected === signature
}

function fromUnixSeconds(value: number | null | undefined) {
  if (!value) return null
  return new Date(value * 1000).toISOString()
}

function getStringId(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  }
  return null
}

function restHeaders(serviceKey: string) {
  return {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'Content-Type': 'application/json',
  }
}

function eq(value: string) {
  return encodeURIComponent(value)
}

async function fetchSubscriptionRow(
  supabaseUrl: string,
  serviceKey: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
) {
  const headers = restHeaders(serviceKey)

  if (stripeSubscriptionId) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?stripe_subscription_id=eq.${eq(stripeSubscriptionId)}&select=id,coach_id&limit=1`,
      { headers },
    )
    const rows = await response.json()
    if (!response.ok) throw new Error('Failed to fetch subscription by subscription ID')
    if (rows?.[0]) return rows[0]
  }

  if (stripeCustomerId) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?stripe_customer_id=eq.${eq(stripeCustomerId)}&select=id,coach_id&limit=1`,
      { headers },
    )
    const rows = await response.json()
    if (!response.ok) throw new Error('Failed to fetch subscription by customer ID')
    if (rows?.[0]) return rows[0]
  }

  return null
}

async function updateSubscription(
  supabaseUrl: string,
  serviceKey: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
  payload: Record<string, unknown>,
) {
  const row = await fetchSubscriptionRow(
    supabaseUrl,
    serviceKey,
    stripeCustomerId,
    stripeSubscriptionId,
  )

  if (!row?.id) {
    console.error('Subscription row not found for Stripe event', {
      stripeCustomerId,
      stripeSubscriptionId,
    })
    return
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?id=eq.${eq(row.id)}`,
    {
      method: 'PATCH',
      headers: { ...restHeaders(serviceKey), 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload),
    },
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to update subscription: ${error}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!webhookSecret) {
      return jsonResponse({ error: 'STRIPE_WEBHOOK_SECRET is not configured' }, 500)
    }

    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return jsonResponse({ error: 'Missing stripe-signature header' }, 400)
    }

    const rawBody = await req.text()
    const verified = await verifyStripeSignature(rawBody, signature, webhookSecret)

    if (!verified) {
      return jsonResponse({ error: 'Invalid webhook signature' }, 400)
    }

    const event = JSON.parse(rawBody)
    const object = event?.data?.object

    switch (event.type) {
      case 'checkout.session.completed': {
        const stripeCustomerId = getStringId(object?.customer)
        const stripeSubscriptionId = getStringId(object?.subscription)

        if (!stripeSubscriptionId) {
          throw new Error('Missing Stripe subscription ID on checkout session')
        }

        const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
        if (!stripeSecretKey) {
          throw new Error('STRIPE_SECRET_KEY is not configured')
        }

        const subResponse = await fetch(
          `https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`,
          {
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
            },
          },
        )

        if (!subResponse.ok) {
          const error = await subResponse.text()
          throw new Error(`Failed to fetch Stripe subscription: ${error}`)
        }

        const sub = await subResponse.json()
        const status = sub?.status ?? 'trialing'
        const trialEnd = fromUnixSeconds(sub?.trial_end)
        const currentPeriodEnd = fromUnixSeconds(sub?.current_period_end)
        const priceId = sub?.items?.data?.[0]?.price?.id ?? null

        await updateSubscription(
          supabaseUrl,
          serviceKey,
          stripeCustomerId,
          stripeSubscriptionId,
          {
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            stripe_price_id: priceId,
            status,
            trial_end: trialEnd,
            current_period_end: currentPeriodEnd,
          },
        )
        break
      }

      case 'customer.subscription.updated': {
        const stripeCustomerId = getStringId(object?.customer)
        const stripeSubscriptionId = getStringId(object?.id)

        await updateSubscription(
          supabaseUrl,
          serviceKey,
          stripeCustomerId,
          stripeSubscriptionId,
          {
            stripe_subscription_id: stripeSubscriptionId,
            stripe_price_id: object?.items?.data?.[0]?.price?.id || null,
            status: object?.status,
            current_period_end: fromUnixSeconds(object?.current_period_end),
            trial_end: fromUnixSeconds(object?.trial_end),
          },
        )
        break
      }

      case 'customer.subscription.deleted': {
        const stripeCustomerId = getStringId(object?.customer)
        const stripeSubscriptionId = getStringId(object?.id)

        await updateSubscription(
          supabaseUrl,
          serviceKey,
          stripeCustomerId,
          stripeSubscriptionId,
          {
            stripe_subscription_id: stripeSubscriptionId,
            status: 'canceled',
            current_period_end: fromUnixSeconds(object?.current_period_end),
            trial_end: fromUnixSeconds(object?.trial_end),
          },
        )
        break
      }

      case 'invoice.payment_failed': {
        const stripeCustomerId = getStringId(object?.customer)
        const stripeSubscriptionId = getStringId(object?.subscription)

        await updateSubscription(
          supabaseUrl,
          serviceKey,
          stripeCustomerId,
          stripeSubscriptionId,
          { status: 'past_due' },
        )
        break
      }

      default:
        break
    }

    return jsonResponse({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 500)
  }
})
