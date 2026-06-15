const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---- Copied verbatim from offboard-self (deferred: extract to _shared/) ----

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

// Sends via Resend and surfaces API errors. The previous fire-and-forget
// `.catch()` only caught network failures — a Resend 4xx (e.g. unverified
// recipient) was silently swallowed, so a "sent" email could never arrive.
async function sendEmail(
  resendKey: string,
  to: string,
  subject: string,
  html: string,
) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: 'Gardnr <noreply@gardnr.fit>', to, subject, html }),
    })
    if (!res.ok) {
      console.error(`Resend send to ${to} failed (${res.status}):`, await res.text())
    }
  } catch (e) {
    console.error(`Resend send to ${to} threw:`, e)
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

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify user from token
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey }
    })
    const user = await userRes.json()
    if (!user.id) throw new Error('Unauthorized')
    const uid = user.id

    const headers = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json'
    }

    // --- Coach deletion: offboard all clients BEFORE removing the coach ---
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${uid}&select=role,email,full_name`,
      { headers },
    )
    const profileRows = await profileRes.json().catch(() => [])
    const callerProfile = Array.isArray(profileRows) ? profileRows[0] : null
    const callerRole: string | null = callerProfile?.role ?? null
    const callerEmail: string | null = callerProfile?.email ?? null
    const callerName: string | null = callerProfile?.full_name ?? null

    if (callerRole === 'coach') {
      const ccRes = await fetch(
        `${supabaseUrl}/rest/v1/coach_clients?coach_id=eq.${uid}&select=client_id`,
        { headers },
      )
      const relationships = await ccRes.json().catch(() => [])
      const clientIds = (Array.isArray(relationships) ? relationships : [])
        .map((r: { client_id: string }) => r.client_id)
        .filter(Boolean)

      // Client emails + names for notification (best-effort).
      let emailById: Record<string, string> = {}
      let nameById: Record<string, string> = {}
      if (clientIds.length > 0) {
        const emRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${clientIds.join(',')})&select=id,email,full_name`,
          { headers },
        )
        const emRows = await emRes.json().catch(() => [])
        if (Array.isArray(emRows)) {
          emailById = Object.fromEntries(emRows.map((p: { id: string; email: string }) => [p.id, p.email]))
          nameById = Object.fromEntries(emRows.map((p: { id: string; full_name: string }) => [p.id, p.full_name]))
        }
      }

      const resendKey = Deno.env.get('RESEND_API_KEY')

      for (const clientId of clientIds) {
        try {
          // a. Resume any paused solo subscription (self-guards on paused_for_coaching=true).
          await resumeSoloSubscription(supabaseUrl, serviceKey, clientId)

          // b. Return to solo + write the offboard notice (survives this deletion).
          await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${clientId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              role: 'solo',
              offboarded_at: new Date().toISOString(),
              offboard_reason: 'coach_deleted',
            }),
          })

          // c. Notify the client (best-effort).
          const to = emailById[clientId]
          if (resendKey && to) {
            const safeName = escapeHtml(nameById[clientId] || to)
            const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">Gardnr</p>
    <h2 style="font-size:18px;font-weight:600;color:#f4f4f4;margin:0 0 16px">Your coaching plan has ended</h2>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      Hi ${safeName} &mdash; your coach's Gardnr account was closed, so your coaching relationship has ended.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 32px">
      <strong style="color:#f4f4f4">Your data is safe.</strong> You're now on a solo plan and can keep tracking on your own anytime.
    </p>
    <a href="https://www.gardnr.fit/login" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
      Log in to Gardnr
    </a>
    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      Gardnr &middot; <a href="https://www.gardnr.fit" style="color:#333">gardnr.fit</a>
    </p>
  </div>
</body>
</html>`
            await sendEmail(resendKey, to, 'Your coaching plan has ended', html)
          }
        } catch (e) {
          // Best-effort: a failed resume is recoverable (client can re-subscribe). Don't block deletion.
          console.error(`Failed to offboard client ${clientId} during coach deletion:`, e)
        }
      }
    }
    // --- end client-processing branch ---

    // Solo/client deletion: cancel Stripe sub then explicitly delete the subscriptions row.
    // subscriptions.solo_id FK → profiles.id (NO ACTION) — row must be gone before auth delete
    // or Postgres rejects the cascade profiles deletion.
    if (callerRole === 'solo' || callerRole === 'client') {
      try {
        const subRes = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?solo_id=eq.${uid}&select=stripe_subscription_id,status&limit=1`,
          { headers },
        )
        const subRows = await subRes.json().catch(() => [])
        const sub = Array.isArray(subRows) ? subRows[0] : null
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
        if (sub?.stripe_subscription_id && sub.status !== 'canceled' && stripeKey) {
          await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Basic ${btoa(stripeKey + ':')}` },
          }).catch((e) => console.error('solo Stripe cancel failed:', e))
        }
        // Delete the subscriptions row explicitly — must succeed before auth delete
        const delSubRes = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?solo_id=eq.${uid}`,
          { method: 'DELETE', headers },
        )
        if (!delSubRes.ok) {
          const err = await delSubRes.text()
          throw new Error(`Failed to delete solo subscriptions row: ${err}`)
        }
      } catch (e) {
        console.error('Failed to clean up solo subscription before deletion:', e)
        throw e
      }
    }

    // Fetch coach info before coach_clients rows are deleted (client role only)
    let coachEmail: string | null = null
    let coachName: string | null = null
    let coachId: string | null = null
    if (callerRole === 'client') {
      try {
        const ccRes = await fetch(
          `${supabaseUrl}/rest/v1/coach_clients?client_id=eq.${uid}&status=eq.active&select=coach_id&limit=1`,
          { headers },
        )
        const ccRows = await ccRes.json().catch(() => [])
        coachId = Array.isArray(ccRows) ? ccRows[0]?.coach_id : null
        if (coachId) {
          const coachProfRes = await fetch(
            `${supabaseUrl}/rest/v1/profiles?id=eq.${coachId}&select=email,full_name`,
            { headers },
          )
          const coachProfRows = await coachProfRes.json().catch(() => [])
          const coachProf = Array.isArray(coachProfRows) ? coachProfRows[0] : null
          coachEmail = coachProf?.email ?? null
          coachName = coachProf?.full_name ?? null
        }
      } catch (e) {
        console.error('Failed to fetch coach info for deletion notification:', e)
      }

      // In-app notification for the coach (name snapshotted before the client's
      // profile is deleted; see migration 20260614120000).
      if (coachId) {
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            user_id: coachId,
            type: 'client_left',
            title: `${callerName || callerEmail || 'A client'} left your coaching`,
            body: 'Their account was deleted',
            href: '/',
          }),
        }).catch((e) => console.error('Coach deletion notification insert failed:', e))
      }
    }

    // Delete all user data explicitly before deleting auth user
    const deletions = [
      `nutrition_log?user_id=eq.${uid}`,
      `weight_log?user_id=eq.${uid}`,
      `cardio_log?user_id=eq.${uid}`,
      `steps_log?user_id=eq.${uid}`,
      `targets?user_id=eq.${uid}`,
      `check_ins?client_id=eq.${uid}`,
      `messages?client_id=eq.${uid}`,
      `messages?coach_id=eq.${uid}`,
      `coach_notes?client_id=eq.${uid}`,
      `coach_notes?coach_id=eq.${uid}`,
      `reports?client_id=eq.${uid}`,
      `reports?coach_id=eq.${uid}`,
      `coach_clients?client_id=eq.${uid}`,
      `coach_clients?coach_id=eq.${uid}`,
      `invitations?coach_id=eq.${uid}`,
    ]

    for (const path of deletions) {
      await fetch(`${supabaseUrl}/rest/v1/${path}`, { method: 'DELETE', headers })
    }

    // Cancel the coach's own Stripe subscription AFTER coach_clients rows are gone,
    // so the resulting customer.subscription.deleted webhook finds no clients to re-offboard.
    // The DB subscriptions row cascade-deletes with the coach; Stripe must be told explicitly.
    if (callerRole === 'coach') {
      try {
        const subRes = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?coach_id=eq.${uid}&select=stripe_subscription_id,status&limit=1`,
          { headers },
        )
        const subRows = await subRes.json().catch(() => [])
        const sub = Array.isArray(subRows) ? subRows[0] : null
        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
        if (sub?.stripe_subscription_id && sub.status !== 'canceled' && stripeKey) {
          await fetch(`https://api.stripe.com/v1/subscriptions/${sub.stripe_subscription_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Basic ${btoa(stripeKey + ':')}` },
          }).catch((e) => console.error('coach Stripe cancel failed:', e))
        }
        // Delete the subscriptions row to clear the FK before auth delete
        const delSubRes = await fetch(
          `${supabaseUrl}/rest/v1/subscriptions?coach_id=eq.${uid}`,
          { method: 'DELETE', headers },
        )
        if (!delSubRes.ok) {
          const err = await delSubRes.text()
          throw new Error(`Failed to delete coach subscriptions row: ${err}`)
        }
      } catch (e) {
        console.error('Failed to cancel coach Stripe subscription:', e)
        throw e
      }
    }

    // Delete the auth user
    const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers
    })

    if (!deleteRes.ok) {
      const err = await deleteRes.text()
      throw new Error(`Failed to delete auth user: ${err}`)
    }

    // Send notification emails. Awaited so the Edge isolate isn't torn down
    // before the Resend requests complete (fire-and-forget can drop the send).
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (resendKey) {
      const safeClientName = escapeHtml(callerName || callerEmail || 'there')

      if (callerEmail) {
        const clientHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">Gardnr</p>
    <h2 style="font-size:18px;font-weight:600;color:#f4f4f4;margin:0 0 16px">Your account has been deleted</h2>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      Hi ${safeClientName} &mdash; your Gardnr account and all associated data have been permanently deleted.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 32px">
      If you ever want to start fresh, you can create a new account anytime.
    </p>
    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      Gardnr &middot; <a href="https://www.gardnr.fit" style="color:#333">gardnr.fit</a>
    </p>
  </div>
</body>
</html>`

        await sendEmail(resendKey, callerEmail, 'Your Gardnr account has been deleted', clientHtml)
      }

      if (callerRole === 'client' && coachEmail) {
        const safeCoachName = escapeHtml(coachName || coachEmail)
        const coachHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">Gardnr</p>
    <h2 style="font-size:18px;font-weight:600;color:#f4f4f4;margin:0 0 16px">A client has left Gardnr</h2>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      Hi ${safeCoachName} &mdash; <strong style="color:#f4f4f4">${safeClientName}</strong> has deleted their Gardnr account and has been removed from your client list.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 32px">
      Your other clients and data are not affected.
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

        await sendEmail(resendKey, coachEmail, `${safeClientName} deleted their Gardnr account`, coachHtml)
      }
    }

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
