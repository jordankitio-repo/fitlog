import { wantsEmail } from '../_shared/notifications.ts'
import { buildNudgeEmail } from '../_shared/nudgeEmail.ts'
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
    // The copy lives in _shared/nudgeEmail.ts, shared with auto-nudge.
    const { subject, html } = buildNudgeEmail({
      reason, days: typeof days === 'number' ? days : null, coachName, clientName,
    })

    // Only the EMAIL is optional. `last_nudged_at` below is written either way:
    // it drives the client's in-app nudge notice (the channel that survives an
    // email opt-out) and the coach's roster cooldown, so skipping it would make
    // a muted client look un-nudged to their coach and re-nudgeable forever.
    const sendEmail = await wantsEmail(supabaseUrl, serviceKey, clientProfile.id, 'nudge')

    // The key is checked HERE rather than at the top, because a nudge to a
    // client who muted nudge email sends no mail and so needs no mail
    // configuration. Checked up front, an opted-out nudge would fail with
    // "RESEND_API_KEY is not configured" while having nothing to configure it
    // for, and the coach's nudge would not register.
    if (sendEmail && !resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not configured' }, 500)
    }

    const emailRes = sendEmail ? await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Gardnr <noreply@gardnr.fit>',
        to: [clientProfile.email],
        subject,
        html,
      }),
    }) : null
    if (emailRes && !emailRes.ok) {
      const emailData = await emailRes.json()
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

    return jsonResponse({ success: true, emailed: sendEmail })
  } catch (error) {
    return jsonResponse({ error: error.message }, 500)
  }
})
