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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function offboardCoachClients(
  supabaseUrl: string,
  serviceKey: string,
  coachId: string,
) {
  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'Content-Type': 'application/json',
  }

  const relRes = await fetch(
    `${supabaseUrl}/rest/v1/coach_clients?coach_id=eq.${coachId}&status=eq.active&select=id,client_id`,
    { headers },
  )
  const relationships = await relRes.json()
  if (!relationships?.length) return

  const now = new Date().toISOString()
  const clientIds = relationships.map((r: { client_id: string }) => r.client_id)

  const offboardRes = await fetch(
    `${supabaseUrl}/rest/v1/coach_clients?coach_id=eq.${coachId}&status=eq.active`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: 'offboarded', offboarded_at: now }),
    },
  )
  if (!offboardRes.ok) {
    const err = await offboardRes.text()
    console.error('Failed to offboard coach_clients:', err)
    return
  }

  const roleRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=in.(${clientIds.join(',')})`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ role: 'solo' }),
    },
  )
  if (!roleRes.ok) {
    const err = await roleRes.text()
    console.error('Failed to update client roles to solo:', err)
  }

  const coachRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${coachId}&select=full_name,email`,
    { headers },
  )
  const coachRows = await coachRes.json()
  const coach = coachRows?.[0]
  const coachName = escapeHtml(coach?.full_name || 'Your coach')

  const clientRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=in.(${clientIds.join(',')})&select=id,email,full_name`,
    { headers },
  )
  const clients = await clientRes.json()

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey || !clients?.length) return

  for (const client of clients) {
    if (!client.email) continue
    const clientName = escapeHtml(client.full_name || client.email)

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">FitLog</p>
    <h2 style="font-size:18px;font-weight:600;color:#f4f4f4;margin:0 0 16px">A note about your coaching plan</h2>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      Hi ${clientName} - ${coachName}'s FitLog subscription has ended, so your coaching connection has been paused.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      <strong style="color:#f4f4f4">Your data is safe.</strong> All your logs, progress, and history are still there. You can continue logging on your own anytime.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 32px">
      If you'd like to connect with a new coach in the future, they can send you an invite and you'll be back up and running.
    </p>
    <a href="https://www.tryfitlog.com" style="display:inline-block;background:#4f8ef7;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
      Open FitLog
    </a>
    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      FitLog &middot; <a href="https://www.tryfitlog.com" style="color:#333">tryfitlog.com</a>
    </p>
  </div>
</body>
</html>`

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'FitLog <noreply@tryfitlog.com>',
          to: client.email,
          subject: 'Your coaching plan has ended - your data is safe',
          html,
        }),
      })

      if (!emailRes.ok) {
        const err = await emailRes.text()
        console.error(`Failed to send offboard email to ${client.email}:`, err)
      }
    } catch (emailErr) {
      console.error(`Failed to send offboard email to ${client.email}:`, emailErr)
    }
  }
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
            cancel_at_period_end: object?.cancel_at_period_end ?? false,
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
            cancel_at_period_end: false,
          },
        )

        const subRow = await fetchSubscriptionRow(
          supabaseUrl,
          serviceKey,
          stripeCustomerId,
          stripeSubscriptionId,
        )
        if (subRow?.coach_id) {
          await offboardCoachClients(supabaseUrl, serviceKey, subRow.coach_id)
        }

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
