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
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=role,email,full_name`,
      { headers: restHeaders },
    )
    const profiles = await profileRes.json()
    const profile = profiles?.[0]
    const role = profile?.role

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

    if (action === 'cancel') {
      try {
        const resendKey = Deno.env.get('RESEND_API_KEY')
        if (resendKey && profile?.email) {
          const dateRes = await fetch(
            `${supabaseUrl}/rest/v1/subscriptions?id=eq.${sub.id}&select=current_period_end,trial_end`,
            { headers: restHeaders },
          )
          const dateRows = await dateRes.json()
          const periodEnd = dateRows?.[0]?.current_period_end || dateRows?.[0]?.trial_end
          const endDateStr = periodEnd
            ? new Date(periodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'the end of your current billing period'
          const planName = role === 'coach' ? 'Coach' : 'Solo Premium'
          const escapeHtml = (value: unknown) =>
            String(value ?? '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;')
          const userName = escapeHtml(profile.full_name || profile.email)

          const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">FitLog</p>
    <h2 style="font-size:18px;font-weight:600;color:#f4f4f4;margin:0 0 16px">Your subscription is set to cancel</h2>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      Hi ${userName} &mdash; your FitLog ${planName} plan is scheduled to cancel.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      <strong style="color:#f4f4f4">You'll keep full access until ${endDateStr}.</strong> After that, your plan won't renew and you won't be charged again.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 32px">
      Changed your mind? You can resume anytime before then from your profile &mdash; nothing will be lost.
    </p>
    <a href="https://www.tryfitlog.com/profile" style="display:inline-block;background:#4f8ef7;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
      Manage subscription
    </a>
    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      FitLog &middot; <a href="https://www.tryfitlog.com" style="color:#333">tryfitlog.com</a>
    </p>
  </div>
</body>
</html>`

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: 'FitLog <noreply@tryfitlog.com>',
              to: profile.email,
              subject: 'Your FitLog subscription is set to cancel',
              html,
            }),
          })
        }
      } catch (emailErr) {
        console.error('Failed to send cancellation email:', emailErr)
      }
    }

    return jsonResponse({ ok: true, action })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('cancel-subscription error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
