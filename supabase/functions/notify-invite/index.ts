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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const APP_URL = 'https://www.gardnr.fit'

// Email the invite link to the address the coach entered. The recipient and
// link are derived server-side from the invitation row (never trusted from the
// client), and the caller must be the coach who owns that invitation — so this
// can't be used as an open email relay.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { invitationId } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)
    if (typeof invitationId !== 'string' || !UUID_RE.test(invitationId)) {
      return jsonResponse({ error: 'Valid invitationId is required' }, 400)
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const restHeaders = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }

    // Identify the caller.
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    const user = await userRes.json()
    if (!user.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    // Load the invitation and verify the caller owns it. Read as the caller
    // (authenticated role) — invitations are world-readable by token and the
    // `service_role` lacks a SELECT grant on this table; the ownership check
    // below is what actually gates the send.
    const invRes = await fetch(
      `${supabaseUrl}/rest/v1/invitations?id=eq.${invitationId}&select=coach_id,client_email,token,account_exists`,
      { headers: { Authorization: `Bearer ${token}`, apikey: anonKey } },
    )
    const invRows = await invRes.json().catch(() => [])
    const invite = Array.isArray(invRows) ? invRows[0] : null
    if (!invite) return jsonResponse({ error: 'Invitation not found' }, 404)
    if (invite.coach_id !== user.id) return jsonResponse({ error: 'Not your invitation' }, 403)

    const coachRows = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=full_name,role`,
      { headers: restHeaders },
    ).then((r) => r.json()).catch(() => [])
    if (coachRows?.[0]?.role !== 'coach') return jsonResponse({ error: 'Coaches only' }, 403)

    const coachName = escapeHtml(coachRows?.[0]?.full_name || 'Your coach')
    const clientEmail = invite.client_email
    const joinUrl = `${APP_URL}/join?token=${invite.token}`
    const existing = invite.account_exists === true

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'RESEND_API_KEY is not configured' }, 500)

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Gardnr <noreply@gardnr.fit>',
        to: [clientEmail],
        subject: `${coachName} invited you to Gardnr`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #16a34a;">You're invited to Gardnr 🌱</h2>
            <p><strong>${coachName}</strong> has invited you to train with them on Gardnr — where you log your nutrition and they coach your progress.</p>
            <p>${existing
              ? 'You already have a Gardnr account, so just accept below and you\'ll be connected to your coach.'
              : 'Tap below to create your account and get started.'}</p>
            <a href="${joinUrl}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Accept invite
            </a>
            <p style="margin-top: 20px; color: #888; font-size: 0.8rem;">Or paste this link into your browser:<br>${joinUrl}</p>
            <p style="margin-top: 24px; color: #888; font-size: 0.875rem;">Gardnr — nutrition coaching that creates the conditions for growth.</p>
          </div>
        `,
      }),
    })

    const data = await response.json()
    return jsonResponse({ success: response.ok, data }, response.ok ? 200 : response.status)

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 500)
  }
})
