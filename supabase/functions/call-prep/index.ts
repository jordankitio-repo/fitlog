const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientName, weekData, checkIn, privateNotes, recentMessages } = await req.json()

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

    const prompt = `You are a fitness coach's assistant. Generate a concise pre-call briefing for a coaching session with ${clientName}.

PRIVATE COACH NOTES:
${privateNotes || 'None.'}

LAST 7 DAYS DATA:
${nutritionSummary}

THIS WEEK'S CHECK-IN:
${checkInText}

RECENT COACH MESSAGES & CLIENT REACTIONS:
${messagesText}

Generate a structured pre-call briefing with these sections:

**Quick wins to acknowledge**
(positive things from the data worth calling out)

**Areas of concern**
(missed logs, low adherence, negative reactions, stated obstacles)

**Suggested talking points**
(specific, actionable topics based on the data)

**Questions to ask**
(open-ended questions to understand the client better)

Be concise and direct. Use bullet points. Focus on what's actionable in the call.`

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