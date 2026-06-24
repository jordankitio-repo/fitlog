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

// Per-user rate limit via the check_rate_limit RPC. Fails OPEN: a limiter hiccup
// must not break the feature for legitimate users. Returns true when allowed.
async function withinRateLimit(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds }),
    })
    if (!res.ok) return true
    return (await res.json()) === true
  } catch {
    return true
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Verifies the caller is the active coach of `clientId`. Returns the verified
// user id, or a Response to short-circuit with. Without this, the function was
// an open Anthropic proxy: anyone with the URL could burn API credits.
async function verifyCoachOwnsClient(req: Request, clientId: unknown) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { error: jsonResponse({ error: 'Missing authorization header' }, 401) }
  if (typeof clientId !== 'string' || !UUID_RE.test(clientId)) {
    return { error: jsonResponse({ error: 'Valid clientId is required' }, 400) }
  }

  const token = authHeader.replace('Bearer ', '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  })
  const user = await userRes.json()
  if (!user.id) return { error: jsonResponse({ error: 'Unauthorized' }, 401) }

  const relRes = await fetch(
    `${supabaseUrl}/rest/v1/coach_clients?select=id&coach_id=eq.${user.id}&client_id=eq.${clientId}&status=eq.active`,
    { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
  )
  const rels = await relRes.json().catch(() => [])
  if (!relRes.ok || !rels?.[0]) return { error: jsonResponse({ error: 'Not your client' }, 403) }

  return { userId: user.id }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientId, clientName, weekData, checkIn, privateNotes, recentMessages, signals } = await req.json()

    const auth = await verifyCoachOwnsClient(req, clientId)
    if (auth.error) return auth.error

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!(await withinRateLimit(supabaseUrl, serviceKey, auth.userId, 'call-prep', 60, 3600))) {
      return jsonResponse({ error: 'Too many requests — please wait a bit before trying again.' }, 429)
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

    const nutritionSummary = weekData.map((d: any) => {
      const parts = [`${d.date}:`]
      if (d.totalCalories > 0) parts.push(`${d.totalCalories} cal, ${d.totalProtein}g protein`)
      if (d.weight) parts.push(`weight ${d.weight}`)
      if (d.cardioSessions?.length) parts.push(`cardio: ${d.cardioSessions.join(', ')}`)
      if (d.steps) parts.push(`${d.steps} steps`)
      if (d.totalCalories === 0 && !d.weight) parts.push('no log')
      return parts.join(' ')
    }).join('\n')

    const checkInText = checkIn
      ? `Adherence: ${checkIn.adherence}/10\nEnergy: ${checkIn.energy}/10${checkIn.obstacles ? `\nObstacles: ${checkIn.obstacles}` : ''}${checkIn.notes ? `\nClient notes: ${checkIn.notes}` : ''}`
      : 'No check-in submitted this week.'

    const messagesText = recentMessages?.length
      ? recentMessages.map((m: any) => `- "${m.content}"${m.reaction ? ` [client reacted: ${m.reaction}]` : ' [no reaction]'}`).join('\n')
      : 'No recent messages.'

    const prompt = `You are a fitness coach's assistant. Write a concise PRE-MEETING briefing to get the coach ready before they next talk to ${clientName} — whether that's a call, an in-person session, or a message. This is PRIVATE to the coach, so be candid: surface risks and things to probe, not a polished client-facing summary.

PRIVATE COACH NOTES:
${privateNotes || 'None.'}

RECENT SIGNALS (energy balance, adherence pattern, logging):
${signals || 'Not enough recent data for an energy/adherence read.'}

RECENT DATA:
${nutritionSummary}

LATEST CHECK-IN:
${checkInText}

RECENT COACH MESSAGES & CLIENT REACTIONS:
${messagesText}

Write the briefing with exactly these sections:

**Since last contact**
(what has changed or stands out recently — movement worth noting)

**Wins to acknowledge**
(genuine positives from the data)

**Watch-outs**
(missed logs / quiet logging, falling adherence, under-fueling, negative reactions, stated obstacles, any churn risk — candid, coach's eyes only)

**Bring up / ask**
(specific talking points + open-ended questions for the conversation)

Be concise and direct; use bullet points. This is the coach's conversation cheat-sheet — do NOT write recommendations or a plan for the client (that is the weekly report's job, a separate tool).`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    const briefing = data.content?.[0]?.text || 'Failed to generate briefing.'

    return new Response(JSON.stringify({ briefing }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})