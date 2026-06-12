const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const COOLDOWN_MS = 48 * 60 * 60 * 1000

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
    const { clientId, reason, days } = await req.json()
    const authHeader = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)
    if (!clientId) return jsonResponse({ error: 'Missing clientId' }, 400)
    if (!resendApiKey) return jsonResponse({ error: 'RESEND_API_KEY is not configured' }, 500)

    const token = authHeader.replace('Bearer ', '')

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    })
    const user = await userRes.json()
    if (!user.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const requestingUserId = user.id
    const headers = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
    }

    const relationshipRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?select=id,last_nudged_at&coach_id=eq.${requestingUserId}&client_id=eq.${clientId}&status=eq.active`,
      { headers },
    )
    const relationshipText = await relationshipRes.text()
    if (!relationshipRes.ok) {
      throw new Error(`Failed to verify coach-client relationship: ${relationshipText}`)
    }

    const relationship = JSON.parse(relationshipText)[0]
    if (!relationship) return jsonResponse({ error: 'Unauthorized' }, 403)

    if (relationship.last_nudged_at) {
      const lastNudgedAt = new Date(relationship.last_nudged_at).getTime()
      if (Date.now() - lastNudgedAt < COOLDOWN_MS) {
        return jsonResponse({ error: 'too_soon' }, 429)
      }
    }

    const profilesRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=id,email,full_name&id=in.(${requestingUserId},${clientId})`,
      { headers },
    )
    const profilesText = await profilesRes.text()
    if (!profilesRes.ok) {
      throw new Error(`Failed to fetch profiles: ${profilesText}`)
    }

    const profiles = JSON.parse(profilesText)
    const coachProfile = profiles.find((p: { id: string }) => p.id === requestingUserId)
    const clientProfile = profiles.find((p: { id: string }) => p.id === clientId)

    if (!clientProfile?.email) {
      return jsonResponse({ error: 'Client email not found' }, 400)
    }

    const coachName = coachProfile?.full_name || 'Your coach'
    const clientName = clientProfile?.full_name || 'there'
    const safeCoachName = escapeHtml(coachName)
    const safeClientName = escapeHtml(clientName)

    // Tailor the nudge to WHY it's being sent (the coach's app picks the reason).
    const GREEN = '#22c55e'
    const dayCount = typeof days === 'number' ? days : null
    let subject, heading, body, ctaLabel, ctaHref
    if (reason === 'checkin') {
      subject = 'Time for your weekly check-in'
      heading = 'Your weekly check-in is waiting'
      body = `${safeCoachName} is waiting on this week's check-in. It takes two minutes and helps them tune your plan.`
      ctaLabel = 'Check in'
      ctaHref = 'https://www.gardnr.fit/'
    } else {
      // 'log' (default): re-engage a client who's gone quiet.
      subject = 'Time to log your day'
      heading = "Let's get back to it"
      const gap = dayCount === null ? "haven't logged yet" : dayCount >= 2 ? `haven't logged in ${dayCount} days` : "haven't logged today"
      body = `${safeCoachName} noticed you ${gap}. A quick log today keeps your momentum going.`
      ctaLabel = 'Log now'
      ctaHref = 'https://www.gardnr.fit/log'
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Gardnr <noreply@gardnr.fit>',
        to: [clientProfile.email],
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
            <h2 style="color: ${GREEN};">${heading}</h2>
            <p>Hi ${safeClientName},</p>
            <p>${body}</p>
            <a href="${ctaHref}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: ${GREEN}; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              ${ctaLabel} &rarr;
            </a>
            <p style="margin-top: 24px; color: #888; font-size: 0.875rem;">Gardnr — your nutrition coaching platform</p>
          </div>
        `,
      }),
    })
    const emailData = await emailRes.json()
    if (!emailRes.ok) {
      return jsonResponse({ success: false, error: emailData }, emailRes.status)
    }

    const now = new Date().toISOString()
    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?id=eq.${relationship.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ last_nudged_at: now }),
      },
    )
    const updateText = await updateRes.text()
    if (!updateRes.ok) {
      throw new Error(`Failed to update nudge timestamp: ${updateText}`)
    }

    return jsonResponse({ success: true })
  } catch (error) {
    return jsonResponse({ error: error.message }, 500)
  }
})
