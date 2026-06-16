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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { adherence, energy, obstacles, notes, answers } = await req.json()

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const restHeaders = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey }

    // Verify the caller (the client submitting the check-in).
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    const user = await userRes.json()
    if (!user.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    // Derive the coach + recipient server-side. The previous version trusted a
    // client-supplied `coachEmail`, making this an open email relay capable of
    // sending to any address from the verified gardnr.fit domain.
    const relRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?select=coach_id&client_id=eq.${user.id}&status=eq.active&limit=1`,
      { headers: restHeaders },
    )
    const rels = await relRes.json().catch(() => [])
    const coachId = rels?.[0]?.coach_id
    if (!coachId) return jsonResponse({ error: 'No active coach to notify' }, 404)

    const [coachRows, clientRows] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${coachId}&select=email,full_name`, { headers: restHeaders })
        .then((r) => r.json()).catch(() => []),
      fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=full_name`, { headers: restHeaders })
        .then((r) => r.json()).catch(() => []),
    ])
    const coachEmail = coachRows?.[0]?.email
    if (!coachEmail) return jsonResponse({ error: 'Coach email not found' }, 404)

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) return jsonResponse({ error: 'RESEND_API_KEY is not configured' }, 500)

    const safeCoachName = escapeHtml(coachRows?.[0]?.full_name || 'Coach')
    const safeClientName = escapeHtml(clientRows?.[0]?.full_name || 'Your client')

    // Custom questionnaire: the client sends pre-formatted { prompt, text }
    // answers. Fall back to the fixed adherence/energy/obstacles/notes fields.
    const detailsHtml = Array.isArray(answers) && answers.length > 0
      ? answers.map((a: { prompt?: string; text?: string }) =>
          `<p><strong>${escapeHtml(a?.prompt || '')}:</strong><br>${escapeHtml(a?.text || '—')}</p>`).join('')
      : `<p><strong>Adherence:</strong> ${escapeHtml(adherence)}/10</p>
              <p><strong>Energy:</strong> ${escapeHtml(energy)}/10</p>
              <p><strong>Obstacles:</strong><br>${escapeHtml(obstacles || 'None reported')}</p>
              <p><strong>Notes:</strong><br>${escapeHtml(notes || 'None')}</p>`

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Gardnr <noreply@gardnr.fit>',
        to: [coachEmail],
        subject: `New check-in from ${safeClientName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #4f8ef7;">New weekly check-in submitted</h2>
            <p>Hi ${safeCoachName},</p>
            <p><strong>${safeClientName}</strong> submitted a weekly check-in.</p>
            <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
              ${detailsHtml}
            </div>
            <a href="https://www.gardnr.fit/login" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #4f8ef7; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              View client
            </a>
            <p style="margin-top: 24px; color: #888; font-size: 0.875rem;">Gardnr - your fitness coaching platform</p>
          </div>
        `
      }),
    })

    const data = await response.json()

    return jsonResponse({ success: response.ok, data }, response.ok ? 200 : response.status)

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 500)
  }
})
