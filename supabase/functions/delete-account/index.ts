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
      `${supabaseUrl}/rest/v1/profiles?id=eq.${uid}&select=role`,
      { headers },
    )
    const profileRows = await profileRes.json().catch(() => [])
    const callerRole = Array.isArray(profileRows) ? profileRows[0]?.role : null

    if (callerRole === 'coach') {
      const ccRes = await fetch(
        `${supabaseUrl}/rest/v1/coach_clients?coach_id=eq.${uid}&select=client_id`,
        { headers },
      )
      const relationships = await ccRes.json().catch(() => [])
      const clientIds = (Array.isArray(relationships) ? relationships : [])
        .map((r: { client_id: string }) => r.client_id)
        .filter(Boolean)

      // Client emails for notification (best-effort).
      let emailById: Record<string, string> = {}
      if (clientIds.length > 0) {
        const emRes = await fetch(
          `${supabaseUrl}/rest/v1/profiles?id=in.(${clientIds.join(',')})&select=id,email`,
          { headers },
        )
        const emRows = await emRes.json().catch(() => [])
        if (Array.isArray(emRows)) {
          emailById = Object.fromEntries(emRows.map((p: { id: string; email: string }) => [p.id, p.email]))
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

          // c. Notify the client (best-effort; Part 6 will template this properly).
          const to = emailById[clientId]
          if (resendKey && to) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Gardnr <noreply@gardnr.fit>',
                to,
                subject: 'Your coaching plan has ended',
                html: `<p>Your coach's Gardnr account was closed, so your coaching relationship has ended.</p><p>Your data is preserved — you're now on a solo plan and can keep tracking on your own.</p>`,
              }),
            }).catch((e) => console.error('coach-deleted email failed:', e))
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
