const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientName, weekData, checkIn, weekRange } = await req.json()
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

Write a structured weekly coaching report with these sections:
1. Overall Assessment (2-3 sentences covering nutrition, cardio, steps, and consistency)
2. Nutrition Highlights (what they did well)
3. Cardio & Activity (comment on their cardio sessions and steps)
4. Areas to Improve (specific, actionable)
5. Weight Trend (comment on their weight data)
6. Client Check-in Response (respond directly to their adherence rating, energy, obstacles, and notes if submitted)
7. Top 3 Recommendations for next week

Be direct, specific, and encouraging. Use the actual numbers from their data. If the client submitted a check-in, make sure to address it personally. Do not include a date-range title; the app will add it.`

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()

    if (data.type === 'error') {
      return new Response(JSON.stringify({ error: data.error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const report = `Weekly Report (${rangeLabel})\n\n${data.content[0].text}`

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
