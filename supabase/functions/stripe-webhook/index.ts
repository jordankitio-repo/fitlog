import { cadenceForPrice } from '../_shared/coachPricing.ts'
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

// Reject signatures whose timestamp is outside this window, to block replay of
// captured webhook requests. Matches Stripe's default tolerance.
const SIGNATURE_TOLERANCE_SECONDS = 300

// Length-constant comparison of two equal-length hex strings.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
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

  // Replay protection: the signed timestamp must be recent.
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const ageSeconds = Math.abs(Date.now() / 1000 - ts)
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false

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

  return timingSafeEqual(expected, signature)
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
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">Gardnr</p>
    <h2 style="font-size:18px;font-weight:600;color:#f4f4f4;margin:0 0 16px">A note about your coaching plan</h2>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      Hi ${clientName} - ${coachName}'s Gardnr subscription has ended, so your coaching connection has been paused.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">
      <strong style="color:#f4f4f4">Your data is safe.</strong> All your logs, progress, and history are still there. You can continue logging on your own anytime.
    </p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 32px">
      If you'd like to connect with a new coach in the future, they can send you an invite and you'll be back up and running.
    </p>
    <a href="https://www.gardnr.fit" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
      Open Gardnr
    </a>
    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      Gardnr &middot; <a href="https://www.gardnr.fit" style="color:#333">gardnr.fit</a>
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
          from: 'Gardnr <noreply@gardnr.fit>',
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

// Stripe delivers at least once, so the same event can arrive twice — and two
// of the handlers below do real, non-repeatable work (offboarding a whole
// roster and emailing them; burning a free trial). These claim the event
// before any of that runs. See 20261019130000_stripe_event_dedupe.sql for why
// it is a CLAIM rather than a "have I seen this" check.
//
// Fails OPEN: if the claim call itself errors we process the event anyway.
// Processing a duplicate is recoverable; dropping a subscription event because
// a bookkeeping table was unreachable is not.
async function claimEvent(
  supabaseUrl: string,
  serviceKey: string,
  eventId: string,
  type: string,
): Promise<boolean> {
  if (!eventId) return true
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_stripe_event`, {
      method: 'POST',
      headers: restHeaders(serviceKey),
      body: JSON.stringify({ p_event_id: eventId, p_type: type }),
    })
    if (!res.ok) {
      console.error(`claim_stripe_event -> ${res.status}; processing anyway`)
      return true
    }
    return (await res.json()) !== false
  } catch (err) {
    console.error('claim_stripe_event threw; processing anyway:', err)
    return true
  }
}

// Only ever called after the handler returns without throwing. A failed run
// deliberately leaves the claim unfinished, so Stripe's retry can pick it up
// once the claim goes stale.
async function completeEvent(supabaseUrl: string, serviceKey: string, eventId: string) {
  if (!eventId) return
  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/complete_stripe_event`, {
      method: 'POST',
      headers: restHeaders(serviceKey),
      body: JSON.stringify({ p_event_id: eventId }),
    })
  } catch (err) {
    console.error('complete_stripe_event failed:', err)
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

// Must match the hashing in create-checkout-session / check-trial-eligibility
// exactly, or the recorded hash won't match on eligibility lookups.
async function hashEmail(email: string): Promise<string> {
  const pepper = Deno.env.get('EMAIL_HASH_PEPPER') ?? ''
  const data = new TextEncoder().encode(`${pepper}:${email.toLowerCase().trim()}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Record that a free trial was actually consumed. Keyed by email hash so it
// survives account deletion (blocks a second free trial on re-signup).
// Upserts on the email_hash unique index — requires that index to exist.
async function markTrialUsed(
  supabaseUrl: string,
  serviceKey: string,
  ownerId: string,
  planType: 'coach' | 'solo',
) {
  const headers = restHeaders(serviceKey)

  const profRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${eq(ownerId)}&select=email&limit=1`,
    { headers },
  )
  const rows = await profRes.json().catch(() => [])
  const email = Array.isArray(rows) ? rows[0]?.email : null
  if (!email) {
    console.error('markTrialUsed: no email found for owner', ownerId)
    return
  }

  const emailHash = await hashEmail(email)
  const field = planType === 'coach' ? 'coach_trial_used' : 'solo_trial_used'

  const res = await fetch(
    `${supabaseUrl}/rest/v1/trial_ledger?on_conflict=email_hash`,
    {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        email_hash: emailHash,
        [field]: true,
        updated_at: new Date().toISOString(),
      }),
    },
  )
  if (!res.ok) {
    console.error('markTrialUsed upsert failed:', await res.text())
  }
}

// Tells the coach their payment failed, by email, because the app cannot.
//
// The Billing card already shows a recovery notice on `past_due` — but a coach
// only sees it if they open the app and scroll to that card. Stripe retries a
// failed card for about two weeks and then the subscription is gone, taking
// every one of that coach's clients' access with it. Discovering that by
// logging in one day and finding your roster offboarded is the worst outcome
// this system can produce, and it was reachable in silence.
//
// WHY IT EMAILS ON EVERY ATTEMPT, NOT JUST THE FIRST. Stripe fires this event
// once per retry, and each one is a different message: the early ones say when
// the next attempt is, the last one says there isn't one. `next_payment_attempt`
// is null on the final failure, which is the only moment the words "your
// subscription will end" are true — and that is the message most likely to be
// acted on. Sending only the first would put the gentlest warning in front of
// the coach and nothing at all at the deadline.
//
// Never gated on notification preferences. Billing is always-on, alongside
// account and security mail: this is not activity within a relationship, it is
// the relationship about to stop.
async function sendPaymentFailedEmail(
  supabaseUrl: string,
  serviceKey: string,
  ownerId: string,
  invoice: Record<string, unknown>,
) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return

  const headers = restHeaders(serviceKey)
  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${eq(ownerId)}&select=email,full_name`,
    { headers },
  )
  const profile = (await profileRes.json().catch(() => []))?.[0]
  if (!profileRes.ok || !profile?.email) return

  const name = escapeHtml(profile.full_name || 'there')
  const nextAttempt = typeof invoice?.next_payment_attempt === 'number'
    ? new Date((invoice.next_payment_attempt as number) * 1000)
    : null
  const amountDue = typeof invoice?.amount_due === 'number'
    ? `$${((invoice.amount_due as number) / 100).toFixed(2)}`
    : null

  const isFinal = !nextAttempt
  const subject = isFinal
    ? 'Last chance: your Gardnr subscription is about to end'
    : 'Your Gardnr payment did not go through'

  const lead = isFinal
    ? `We could not take ${amountDue ? `the ${amountDue} payment` : 'your payment'}, and that was the last attempt. Your subscription will end shortly, and your clients will lose access with it.`
    : `We could not take ${amountDue ? `the ${amountDue} payment` : 'your payment'} for your Gardnr subscription. We will try again on ${nextAttempt!.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">Gardnr</p>
    <h2 style="font-size:18px;font-weight:600;color:#f4f4f4;margin:0 0 16px">${isFinal ? 'Your subscription is about to end' : 'Your payment did not go through'}</h2>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">Hi ${name},</p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 16px">${lead}</p>
    <p style="font-size:14px;color:#a3a3a3;line-height:1.7;margin:0 0 32px">
      Updating your card takes a minute and fixes it. Nothing else about your account changes.
    </p>
    <a href="https://www.gardnr.fit/profile?focus=billing" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
      Update payment method
    </a>
    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      Gardnr &middot; <a href="https://www.gardnr.fit" style="color:#333">gardnr.fit</a>
    </p>
  </div>
</body>
</html>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Gardnr <noreply@gardnr.fit>',
        to: profile.email,
        subject,
        html,
      }),
    })
    if (!res.ok) console.error('payment-failed email rejected:', await res.text())
  } catch (err) {
    console.error('payment-failed email threw:', err)
  }
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
      `${supabaseUrl}/rest/v1/subscriptions?stripe_subscription_id=eq.${eq(stripeSubscriptionId)}&select=id,coach_id,solo_id,paused_for_coaching&limit=1`,
      { headers },
    )
    const rows = await response.json()
    if (!response.ok) throw new Error('Failed to fetch subscription by subscription ID')
    if (rows?.[0]) return rows[0]
  }

  if (stripeCustomerId) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?stripe_customer_id=eq.${eq(stripeCustomerId)}&select=id,coach_id,solo_id,paused_for_coaching&limit=1`,
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

    // A duplicate delivery gets a 200, not an error: Stripe only stops retrying
    // on a 2xx, and "we already did this" is a success from its point of view.
    if (!(await claimEvent(supabaseUrl, serviceKey, event?.id, event?.type))) {
      return jsonResponse({ received: true, duplicate: true })
    }

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
            // Coach billing cadence for display, derived from the PRICE the
            // subscription actually carries. It used to come from
            // `metadata.cadence`, which is stamped at checkout and never
            // updated — so once a cadence could change without a new checkout,
            // that metadata recorded what the coach first bought rather than
            // what they pay now. Metadata is kept only as the fallback for a
            // price this deployment has no env for. Still only written when
            // resolvable, so a later event can't wipe it; solo subs have none.
            ...(() => {
              const cadence = cadenceForPrice(priceId) ?? sub?.metadata?.cadence
              return cadence ? { billing_interval: cadence } : {}
            })(),
          },
        )

        // Trial only counts as used once it actually starts. Recording it here
        // (rather than at session creation) means abandoning the Stripe page
        // never burns the trial.
        if (status === 'trialing') {
          const planType = sub?.metadata?.plan_type
          const ownerId = sub?.metadata?.solo_id || sub?.metadata?.coach_id
          if ((planType === 'solo' || planType === 'coach') && ownerId) {
            await markTrialUsed(supabaseUrl, serviceKey, ownerId, planType)
          }
        }
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
            // Stripe owns the pause once it is set: it clears pause_collection
            // itself on the resume date, and that arrives here as an update
            // with no pause on it. Syncing from the event rather than trusting
            // our own row is what makes the auto-resume show up in the app
            // without anyone asking it to.
            paused_until: object?.pause_collection?.resumes_at
              ? new Date(object.pause_collection.resumes_at * 1000).toISOString()
              : null,
            // Derived from the price, not from checkout-time metadata. THIS is
            // the event a cadence change arrives on, so reading metadata here
            // was the bug: the price would update and the displayed interval
            // would not. See _shared/coachPricing.ts.
            ...(() => {
              const cadence = cadenceForPrice(object?.items?.data?.[0]?.price?.id)
                ?? object?.metadata?.cadence
              return cadence ? { billing_interval: cadence } : {}
            })(),
          },
        )
        break
      }

      case 'customer.subscription.deleted': {
        const stripeCustomerId = getStringId(object?.customer)
        const stripeSubscriptionId = getStringId(object?.id)

        const subRow = await fetchSubscriptionRow(
          supabaseUrl,
          serviceKey,
          stripeCustomerId,
          stripeSubscriptionId,
        )

        // Deletion was triggered by a coaching pause — skip status update and offboarding
        if (subRow?.paused_for_coaching) break

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

        // Marking the row past_due only reaches someone who opens the app. The
        // email is the half that reaches someone who doesn't, and this handler
        // existed without it for as long as it has existed.
        const row = await fetchSubscriptionRow(
          supabaseUrl,
          serviceKey,
          stripeCustomerId,
          stripeSubscriptionId,
        )
        const ownerId = row?.coach_id || row?.solo_id
        if (ownerId) {
          await sendPaymentFailedEmail(supabaseUrl, serviceKey, ownerId, object ?? {})
        } else {
          console.error('payment_failed: no owner found for', stripeCustomerId, stripeSubscriptionId)
        }
        break
      }

      default:
        break
    }

    await completeEvent(supabaseUrl, serviceKey, event?.id)
    return jsonResponse({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 500)
  }
})
