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

// Purposes are whitelisted here AND by a check constraint on the table, so a
// caller can't invent one and get an email sent on our behalf.
const PURPOSES: Record<string, { subject: string; action: string }> = {
  delete_account: {
    subject: 'Confirm deleting your Gardnr account',
    action: 'permanently delete your Gardnr account and all of your data',
  },
}

const TTL_SECONDS = 600 // 10 minutes

// Six digits from the CSPRNG, not Math.random. Rejection-sampled so every code
// is equally likely (naive % 1000000 over a 32-bit draw skews the low end).
function generateCode() {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0xffffffff / 1000000) * 1000000
  let n: number
  do {
    crypto.getRandomValues(buf)
    n = buf[0]
  } while (n >= limit)
  return String(n % 1000000).padStart(6, '0')
}

export async function hashCode(purpose: string, code: string) {
  const data = new TextEncoder().encode(`${purpose}:${code}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Per-user rate limit. Fails OPEN like the other callers of this RPC: a limiter
// hiccup must not lock someone out of their own account settings.
async function withinRateLimit(supabaseUrl: string, serviceKey: string, userId: string) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_bucket: 'step-up', p_limit: 5, p_window_seconds: 900 }),
    })
    if (!res.ok) return true
    return (await res.json()) === true
  } catch {
    return true
  }
}

// Email a one-time confirmation code for an irreversible action.
//
// This is step-up authentication, not a second password prompt: holding a live
// session is no longer enough to erase an account, because the account's own
// mailbox has to confirm it. It matters more now that clients have no password
// at all — but the hole it closes was always there, since a password was never
// re-checked before deletion either.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { purpose } = await req.json()
    const spec = typeof purpose === 'string' ? PURPOSES[purpose] : undefined
    if (!spec) return jsonResponse({ error: 'Unknown purpose' }, 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const token = authHeader.replace('Bearer ', '')

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    const user = await userRes.json()
    if (!user?.id || !user?.email) return jsonResponse({ error: 'Unauthorized' }, 401)

    if (!(await withinRateLimit(supabaseUrl, serviceKey, user.id))) {
      return jsonResponse({ error: 'Too many codes requested. Try again in a few minutes.' }, 429)
    }

    const code = generateCode()
    const codeHash = await hashCode(purpose, code)

    const issueRes = await fetch(`${supabaseUrl}/rest/v1/rpc/issue_step_up`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_user_id: user.id,
        p_purpose: purpose,
        p_code_hash: codeHash,
        p_ttl_seconds: TTL_SECONDS,
      }),
    })
    if (!issueRes.ok) {
      console.error('issue_step_up failed:', issueRes.status, await issueRes.text())
      return jsonResponse({ error: 'Could not send a code. Please try again.' }, 500)
    }

    // Always to the ACCOUNT's address from the verified JWT — never an address
    // taken from the request body, which would make this an open relay.
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('RESEND_API_KEY is not set; cannot send the step-up code.')
      return jsonResponse({ error: 'Could not send a code. Please try again.' }, 500)
    }

    const html = `
      <p>Your confirmation code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">${code}</p>
      <p>Enter it in Gardnr to ${spec.action}. It expires in 10 minutes.</p>
      <p style="color:#666;font-size:13px;">If you didn't ask for this, you can ignore this email —
      nothing will happen without the code. You may want to sign out of any devices you don't recognise.</p>
    `
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'Gardnr <noreply@gardnr.fit>',
        to: user.email,
        subject: spec.subject,
        html,
      }),
    })
    if (!sendRes.ok) {
      console.error('Resend send failed:', sendRes.status, await sendRes.text())
      return jsonResponse({ error: 'Could not send a code. Please try again.' }, 500)
    }

    return jsonResponse({ sent: true })

  } catch (error) {
    console.error('request-step-up threw:', error)
    return jsonResponse({ error: 'Could not send a code. Please try again.' }, 500)
  }
})
