// Opens Stripe's hosted billing portal for the signed-in coach (or a legacy
// solo subscriber), so they can change a payment method and pull their own
// invoices and receipts.
//
// WHY THIS EXISTS. Before it, a coach could do exactly two things with their
// subscription: cancel and resume. Meanwhile stripe-webhook already handles
// `invoice.payment_failed` — so we DETECTED a dead card and offered no way to
// fix it, and the only self-serve button on the page said "Cancel
// subscription". That is involuntary churn, and one billingPortal session
// closes it. Receipts matter on their own too: coaches are businesses, and
// they need invoices at tax time.
//
// ---------------------------------------------------------------------------
// STRIPE DASHBOARD SETUP (this function cannot do it for you)
//
// The portal renders what the Dashboard's portal *configuration* allows, not
// what this code asks for. Billing → Customer portal:
//
//   ON   Payment methods ("Allow customers to update their payment methods")
//   ON   Invoice history
//   OFF  Cancel subscriptions
//   OFF  Update subscriptions / switch plans
//
// Cancellation stays OFF deliberately. The in-app flow carries the "You'll
// keep access until <date>" reassurance and sends the cancellation email, and
// the portal's cancel button would do neither — so a coach who cancelled there
// would get a silently different experience from one who cancelled here. The
// DB would stay correct either way (`customer.subscription.updated` syncs
// `cancel_at_period_end`), which is what makes this a copy problem rather than
// a data one, and therefore easy to miss.
//
// Plan switching is off because the app owns that flow: `change-cadence` moves
// a coach between the three cadences with our own confirm step, which says
// whether money leaves today or comes back as credit. Stripe's portal would do
// the same repricing silently and with different wording, and two paths to one
// outcome is how copy drifts apart. It would no longer CORRUPT anything —
// `billing_interval` is derived from the price now, not from checkout-time
// metadata, so a portal switch would be recorded correctly — but "it no longer
// breaks" is not a reason to have two of something.
//
// With no default configuration saved, Stripe rejects the session outright;
// that specific failure is detected below and reported as configuration rather
// than as a generic Stripe error, because it is the one that will happen first.
// ---------------------------------------------------------------------------

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

// Where Stripe sends the coach back to. Server-side ONLY, never from the
// request body: a return_url the caller supplies is an open redirect wearing a
// billing function's clothes. `?focus=billing` is Profile's existing deep-link
// convention — it scrolls to the Billing card and strips itself from the URL.
// APP_URL exists so the sandbox returns to the sandbox; prod needs no env.
function appUrl() {
  return Deno.env.get('APP_URL') ?? 'https://www.gardnr.fit'
}

// Returns true only if the customer exists in Stripe and isn't deleted. A
// stored customer ID can be orphaned if the customer was removed in Stripe, and
// reusing it makes the session call fail with "No such customer". Same guard,
// and the same reasoning, as create-checkout-session.
async function customerIsUsable(stripeCustomerId: string, stripeSecretKey: string) {
  const res = await fetch(`https://api.stripe.com/v1/customers/${stripeCustomerId}`, {
    headers: { Authorization: `Basic ${btoa(stripeSecretKey + ':')}` },
  })
  if (!res.ok) return false
  const customer = await res.json().catch(() => null)
  return Boolean(customer) && customer.deleted !== true
}

// Per-user rate limit. Fails OPEN like the other callers of this RPC: a limiter
// hiccup must not lock someone out of fixing their own payment method, which is
// the one thing on this endpoint that is time-critical.
async function withinRateLimit(supabaseUrl: string, serviceKey: string, userId: string) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_bucket: 'billing-portal', p_limit: 20, p_window_seconds: 900 }),
    })
    if (!res.ok) return true
    return (await res.json()) === true
  } catch {
    return true
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // The caller picks an INTENT, which is a label, not a destination. Same
    // discipline as `cadence` in create-checkout-session: anything the browser
    // sends is validated against a fixed allow-list here, and an unknown or
    // absent value falls back to the safe default rather than being trusted.
    //   'portal'         — the full portal: cards, invoices, receipts
    //   'payment_method' — straight into the update-card flow, then back here.
    //                      This is the past_due recovery path, and skipping the
    //                      portal's menu is the whole point of it.
    const body = (await req.json().catch(() => ({}))) as { intent?: string }
    const intent = body.intent === 'payment_method' ? 'payment_method' : 'portal'

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

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
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      { headers: restHeaders },
    )
    const profiles = await profileRes.json()
    const role = profiles?.[0]?.role

    if (!profileRes.ok || (role !== 'coach' && role !== 'solo')) {
      return jsonResponse({ error: 'No billing to manage for this role' }, 403)
    }

    if (!(await withinRateLimit(supabaseUrl, serviceKey, user.id))) {
      return jsonResponse({ error: 'Too many requests. Try again in a few minutes.' }, 429)
    }

    const idColumn = role === 'coach' ? 'coach_id' : 'solo_id'
    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?${idColumn}=eq.${user.id}&select=stripe_customer_id&limit=1`,
      { headers: restHeaders },
    )
    const subs = await subRes.json()
    if (!subRes.ok) return jsonResponse({ error: 'Unable to fetch subscription' }, 500)

    // Gated on a CUSTOMER, not on a live subscription. A cancelled coach still
    // owns their past invoices and may well be opening this in April to find
    // them; locking the portal to active statuses would make the receipts
    // disappear at exactly the moment they stop being obtainable any other way.
    const stripeCustomerId = subs?.[0]?.stripe_customer_id
    if (!stripeCustomerId) {
      return jsonResponse({ error: 'No billing account yet' }, 404)
    }

    // Config is checked here rather than at the top, for two reasons. An
    // unauthenticated caller should learn nothing about how this deployment is
    // configured. And every guard above it — unauthorized, wrong role, no
    // billing account — is then provable with no Stripe credentials at all,
    // which is the difference between tests/rls/portalFn.test.js running in CI
    // and being skipped there.
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY is not configured')
      return jsonResponse({ error: 'Billing is not configured' }, 500)
    }

    if (!(await customerIsUsable(stripeCustomerId, stripeSecretKey))) {
      console.error(`Orphaned stripe_customer_id for ${role} ${user.id}: ${stripeCustomerId}`)
      return jsonResponse({ error: 'Your billing account could not be opened. Contact support.' }, 409)
    }

    const returnUrl = `${appUrl()}/profile?focus=billing`
    const params = new URLSearchParams({
      customer: stripeCustomerId,
      return_url: returnUrl,
    })

    if (intent === 'payment_method') {
      params.set('flow_data[type]', 'payment_method_update')
      // Without this, finishing the card update drops the coach on the portal's
      // home page — which, with cancellation and plan changes switched off, is
      // a near-empty screen. Send them back to Billing instead, where the
      // notice that sent them here will have cleared.
      params.set('flow_data[after_completion][type]', 'redirect')
      params.set('flow_data[after_completion][redirect][return_url]', returnUrl)
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: stripeHeaders(stripeSecretKey),
      body: params.toString(),
    })
    const session = await stripeRes.json().catch(() => null)

    if (!stripeRes.ok) {
      const message = session?.error?.message || 'Stripe billing_portal request failed'
      console.error('billing_portal session failed:', message)
      // The first-run failure, named rather than passed through: with no saved
      // portal configuration Stripe refuses every session, and the raw message
      // ("provide a configuration or create your default...") reads to a coach
      // as if their own billing is broken.
      if (/configuration/i.test(message)) {
        return jsonResponse({ error: 'The billing portal is not set up yet. We have been notified.' }, 500)
      }
      return jsonResponse({ error: 'Could not open the billing portal.' }, 502)
    }

    if (!session?.url) {
      console.error('billing_portal session returned no url')
      return jsonResponse({ error: 'Could not open the billing portal.' }, 502)
    }

    return jsonResponse({ url: session.url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('create-portal-session error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
