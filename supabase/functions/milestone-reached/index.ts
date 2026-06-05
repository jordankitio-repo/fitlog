const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MILESTONES = [7, 14, 30, 60, 90]

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

function eq(value: string) {
  return encodeURIComponent(value)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { streakCount } = await req.json()
    const authHeader = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)
    if (!streakCount) return jsonResponse({ error: 'Missing streakCount' }, 400)
    if (!resendApiKey) return jsonResponse({ error: 'RESEND_API_KEY is not configured' }, 500)

    if (!MILESTONES.includes(streakCount)) {
      return jsonResponse({ skipped: true, reason: 'not_milestone' })
    }

    const token = authHeader.replace('Bearer ', '')
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    })
    const user = await userRes.json()
    if (!user.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const clientId = user.id
    const restHeaders = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
    }

    const clientRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${eq(clientId)}&select=full_name,email,last_milestone_streak`,
      { headers: restHeaders },
    )
    const clientText = await clientRes.text()
    if (!clientRes.ok) {
      throw new Error(`Failed to fetch client profile: ${clientText}`)
    }

    const client = JSON.parse(clientText)?.[0]
    if (!client) return jsonResponse({ error: 'Client not found' }, 404)
    if ((client.last_milestone_streak || 0) >= streakCount) {
      return jsonResponse({ skipped: true, reason: 'already_sent' })
    }

    const relRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?client_id=eq.${eq(clientId)}&status=eq.active&select=coach_id`,
      { headers: restHeaders },
    )
    const relText = await relRes.text()
    if (!relRes.ok) {
      throw new Error(`Failed to fetch coach relationship: ${relText}`)
    }

    const coachId = JSON.parse(relText)?.[0]?.coach_id
    if (!coachId) {
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${eq(clientId)}`, {
        method: 'PATCH',
        headers: { ...restHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ last_milestone_streak: streakCount }),
      })
      return jsonResponse({ ok: true, milestone: streakCount, note: 'no coach, skipped email' })
    }

    const coachRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${eq(coachId)}&select=email,full_name`,
      { headers: restHeaders },
    )
    const coachText = await coachRes.text()
    if (!coachRes.ok) {
      throw new Error(`Failed to fetch coach profile: ${coachText}`)
    }

    const coach = JSON.parse(coachText)?.[0]
    if (!coach?.email) {
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${eq(clientId)}`, {
        method: 'PATCH',
        headers: { ...restHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ last_milestone_streak: streakCount }),
      })
      return jsonResponse({ ok: true, milestone: streakCount, note: 'coach email not found' })
    }

    const clientDisplayName = client.full_name || client.email || 'Your client'
    const safeClientName = escapeHtml(clientDisplayName)
    const safeCoachName = escapeHtml(coach.full_name || 'Coach')
    const safeStreakLabel = escapeHtml(String(streakCount))

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 32px">FitLog</p>

    <div style="background:#141414;border:1px solid #242424;border-radius:8px;padding:32px;text-align:center;margin-bottom:24px">
      <p style="font-size:40px;margin:0 0 8px">🔥</p>
      <p style="font-size:24px;font-weight:700;color:#f4f4f4;margin:0 0 8px">${safeStreakLabel}-day streak</p>
      <p style="font-size:14px;color:#a3a3a3;margin:0">${safeClientName} has logged ${safeStreakLabel} days in a row</p>
    </div>

    <p style="font-size:14px;color:#a3a3a3;line-height:1.6">
      Hey ${safeCoachName} - your client ${safeClientName} just hit a <strong style="color:#f4f4f4">${safeStreakLabel}-day logging streak</strong>.
      This is a great moment to send an encouraging message.
    </p>

    <div style="margin-top:24px">
      <a href="https://www.tryfitlog.com" style="display:inline-block;background:#4f8ef7;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
        View client data &rarr;
      </a>
    </div>

    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      FitLog &middot; <a href="https://www.tryfitlog.com" style="color:#333">tryfitlog.com</a>
    </p>
  </div>
</body>
</html>`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'FitLog <noreply@tryfitlog.com>',
        to: [coach.email],
        subject: `🔥 ${clientDisplayName} just hit a ${streakCount}-day streak`,
        html,
      }),
    })
    const emailData = await emailRes.json()
    if (!emailRes.ok) {
      return jsonResponse({ success: false, error: emailData }, emailRes.status)
    }

    const updateRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${eq(clientId)}`, {
      method: 'PATCH',
      headers: { ...restHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ last_milestone_streak: streakCount }),
    })
    const updateText = await updateRes.text()
    if (!updateRes.ok) {
      throw new Error(`Failed to update milestone streak: ${updateText}`)
    }

    return jsonResponse({ ok: true, milestone: streakCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 500)
  }
})
