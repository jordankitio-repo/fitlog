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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

    // Capture coach + client details before the relationship is offboarded,
    // so we can notify the coach that the client has left (best-effort).
    let coachEmail: string | null = null
    let coachName: string | null = null
    let clientName: string | null = null
    let coachId: string | null = null
    try {
      const ccRes = await fetch(
        `${supabaseUrl}/rest/v1/coach_clients?client_id=eq.${user.id}&status=eq.active&select=coach_id&limit=1`,
        { headers },
      )
      const ccRows = await ccRes.json().catch(() => [])
      coachId = Array.isArray(ccRows) ? ccRows[0]?.coach_id : null
      if (coachId) {
        const profRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${coachId},${user.id})&select=id,email,full_name`,
          { headers },
        )
        const profRows = await profRes.json().catch(() => [])
        if (Array.isArray(profRows)) {
          const coach = profRows.find((p: { id: string }) => p.id === coachId)
          const client = profRows.find((p: { id: string }) => p.id === user.id)
          coachEmail = coach?.email ?? null
          coachName = coach?.full_name ?? null
          clientName = client?.full_name ?? client?.email ?? null
        }
      }
    } catch (e) {
      console.error('Failed to fetch coach info for offboard notification:', e)
    }

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

    // In-app notification for the coach. The name is snapshotted here because the
    // coach loses RLS read access to the departed client's profile, so the bell
    // can't look it up after the fact (see migration 20260614120000).
    if (coachId) {
      const safeName = clientName || 'A client'
      await fetch(`${supabaseUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: coachId,
          type: 'client_left',
          title: `${safeName} left your coaching`,
          body: 'Returned to a solo plan',
          href: '/',
        }),
      }).catch((e) => console.error('Coach offboard notification insert failed:', e))
    }

    // Notify the coach that the client has left (best-effort, awaited so the
    // Edge isolate isn't torn down before the Resend request completes).
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (resendKey && coachEmail) {
      const safeCoachName = escapeHtml(coachName || coachEmail)
      const safeClientName = escapeHtml(clientName || 'A client')
      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">Gardnr</p>
    <h2 style="font-size:18px;font-weight:600;color:#f4f4f4;margin:0 0 16px">A client has left your coaching</h2>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      Hi ${safeCoachName} &mdash; <strong style="color:#f4f4f4">${safeClientName}</strong> has ended their coaching connection with you and returned to a solo plan.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 32px">
      They've been removed from your client list. Your other clients and data are not affected.
    </p>
    <a href="https://www.gardnr.fit" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
      Open Gardnr
    </a>
    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      Gardnr &middot; <a href="https://www.gardnr.fit" style="color:#333">gardnr.fit</a>
    </p>
  </div>
</body>
</html>`
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'Gardnr <noreply@gardnr.fit>',
          to: coachEmail,
          subject: `${safeClientName} left your coaching`,
          html,
        }),
      }).catch((e) => console.error('Coach offboard notification email failed:', e))
    }

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
