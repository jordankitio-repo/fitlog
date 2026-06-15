// Email a client when their coach reviews their check-in (optionally with a
// comment). Mirrors notify-report: the caller must be the client's ACTIVE
// coach, the recipient + names are derived server-side (never trust a
// client-supplied email), and the comment is escaped before going in the HTML.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientId, comment } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)
    if (typeof clientId !== 'string' || !UUID_RE.test(clientId)) {
      return jsonResponse({ error: 'Valid clientId is required' }, 400)
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const restHeaders = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }

    // Verify the caller is this client's active coach.
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    const user = await userRes.json()
    if (!user.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const relRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?select=id&coach_id=eq.${user.id}&client_id=eq.${clientId}&status=eq.active`,
      { headers: restHeaders },
    )
    const rels = await relRes.json().catch(() => [])
    if (!relRes.ok || !rels?.[0]) return jsonResponse({ error: 'Not your client' }, 403)

    const [clientRows, coachRows] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${clientId}&select=email,full_name`, { headers: restHeaders })
        .then((r) => r.json()).catch(() => []),
      fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=full_name`, { headers: restHeaders })
        .then((r) => r.json()).catch(() => []),
    ])
    const clientEmail = clientRows?.[0]?.email
    if (!clientEmail) return jsonResponse({ error: 'Client email not found' }, 404)

    const clientName = escapeHtml(clientRows?.[0]?.full_name || 'there')
    const coachName = escapeHtml(coachRows?.[0]?.full_name || 'Your coach')
    const safeComment = comment ? escapeHtml(comment) : ''

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'RESEND_API_KEY is not configured' }, 500)

    const commentBlock = safeComment
      ? `<p style="margin-top: 8px;">They left you a note:</p>
         <blockquote style="margin: 8px 0; padding: 12px 16px; background: #f4f6fb; border-left: 3px solid #4f8ef7; border-radius: 6px; color: #333;">${safeComment}</blockquote>`
      : ''

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Gardnr <noreply@gardnr.fit>',
        to: [clientEmail],
        subject: `${coachName} reviewed your check-in`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #4f8ef7;">Your check-in was reviewed ✅</h2>
            <p>Hi ${clientName},</p>
            <p>Your coach <strong>${coachName}</strong> reviewed your latest check-in.</p>
            ${commentBlock}
            <a href="https://www.gardnr.fit/login" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #4f8ef7; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Open Gardnr
            </a>
            <p style="margin-top: 24px; color: #888; font-size: 0.875rem;">Gardnr — your fitness coaching platform</p>
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
