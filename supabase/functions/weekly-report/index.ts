import { callAnthropic } from '../_shared/anthropic.ts'

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

// Verifies the caller is the active coach of `clientId`. Without this, the
// function was an open Anthropic proxy: anyone with the URL could burn credits.
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
    const { clientId, clientName, weekData, checkIn, weekRange } = await req.json()

    const auth = await verifyCoachOwnsClient(req, clientId)
    if (auth.error) return auth.error

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!(await withinRateLimit(supabaseUrl, serviceKey, auth.userId, 'weekly-report', 60, 3600))) {
      return jsonResponse({ error: 'Too many requests — please wait a bit before trying again.' }, 429)
    }

    const rangeLabel = weekRange?.label || (
      weekData?.length
        ? `${weekData[0].date} - ${weekData[weekData.length - 1].date}`
        : 'the provided reporting period'
    )

    const days = weekData.map((day: any) => {
      const mealsText = day.meals.length > 0 ? day.meals.join(', ') : 'No meals logged'
      const cardioText = day.cardioSessions.length > 0 ? day.cardioSessions.join(', ') : 'No cardio'
      const stepsText = day.steps ? `${day.steps.toLocaleString()} steps` : 'No steps logged'

      return `${day.date}:
  Weight: ${day.weight || 'not logged'}
  Calories: ${day.totalCalories} | Protein: ${day.totalProtein}g | Carbs: ${day.totalCarbs}g | Fat: ${day.totalFat}g
  Meals: ${mealsText}
  Cardio: ${cardioText}
  Steps: ${stepsText}`
    }).join('\n\n')

    const checkInSection = checkIn ? `
Client's weekly check-in:
- Adherence to plan: ${checkIn.adherence}/10
- Energy levels: ${checkIn.energy}/10
- Obstacles: ${checkIn.obstacles || 'None reported'}
- Notes for coach: ${checkIn.notes || 'None'}
` : 'No check-in submitted this week.'

    const prompt = `You are a professional fitness coach writing a weekly check-in report for a client.

Client: ${clientName}

Reporting period: ${rangeLabel}

Use exactly this reporting period. Do not infer, rewrite, or add a different date range.

Data for this reporting period:

${days}

${checkInSection}

Write a structured weekly coaching report with these sections, in this order. Start each one with a markdown heading line ("## " followed by the section name, no number), with its content on the lines below:
- Overall Assessment (2-3 sentences covering nutrition, cardio, steps, and consistency)
- Nutrition Highlights (what they did well)
- Cardio & Activity (comment on their cardio sessions and steps)
- Areas to Improve (specific, actionable)
- Weight Trend (comment on their weight data)
- Check-in (respond directly to their adherence rating, energy, obstacles, and notes if submitted)
- Top 3 for Next Week (a numbered list)

Be direct, specific, and encouraging. Use the actual numbers from their data. If the client submitted a check-in, make sure to address it personally. Keep the whole report under 450 words: a client reads it on a phone, so short paragraphs and bullets.

Begin your response with a single line of the form:

SUBJECT: <a short, specific subject line, at most 8 words>

The subject names what actually happened this week, the way a person would write it in an email ("Weekend held, waist down 5.5cm" — not "Weekly Report" or "Your Check-In"). It is what the client sees in a list of every report you have ever sent, so it must be different from last week's. Then a blank line, then the report itself with no title of its own.`

    // Claude Opus 5.5: this is the AI output a client actually reads. Thinking
    // is always on and counts against max_tokens, so the cap leaves room for
    // it; the report's length is set in the prompt instead (the old 800-token
    // cap was doing that job silently). `fallbacks: "default"` re-runs a
    // safety-declined request on a fallback model inside the same call.
    const result = await callAnthropic({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    }, { timeoutMs: 60000, maxAttempts: 2, betas: ['server-side-fallback-2026-07-01'] })
    if (!result.ok) {
      console.error('weekly-report anthropic failed:', result.status, result.error)
      return new Response(JSON.stringify({
        error: result.retryable
          ? 'Our AI is busy right now — please try again in a moment.'
          : "Couldn't generate a response right now.",
      }), {
        status: result.retryable ? 503 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Split the SUBJECT line off the body. The date-range title used to be
    // PREPENDED into the content here, which put a line the app already renders
    // (the report's date) inside the prose, and still left every row in the
    // client's archive titled "Weekly Report". A subject is a field now, so it
    // can head a row in a list without being read twice inside the document.
    const raw = result.text.trim()
    const match = /^SUBJECT:\s*(.+?)\s*(?:\n|$)/i.exec(raw)
    const subject = match ? match[1].trim().slice(0, 120) : null
    const report = match ? raw.slice(match[0].length).trim() : raw

    return new Response(JSON.stringify({ report, subject, rangeLabel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
