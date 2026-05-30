const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientName, weekData } = await req.json()

    const days = weekData.map((day: {
      date: string
      weight: string | null
      totalCalories: number
      totalProtein: number
      totalCarbs: number
      totalFat: number
      meals: string[]
    }) => {
      const mealsText = day.meals.length > 0
        ? day.meals.join(', ')
        : 'No meals logged'

      return `${day.date}:
  Weight: ${day.weight || 'not logged'}
  Totals: ${day.totalCalories} cal | Protein: ${day.totalProtein}g | Carbs: ${day.totalCarbs}g | Fat: ${day.totalFat}g
  Meals: ${mealsText}`
    }).join('\n\n')

    const prompt = `You are a professional fitness coach writing a weekly check-in report for a client.

Client: ${clientName}

Last 7 days of data:

${days}

Write a structured weekly coaching report with these sections:
1. Overall Assessment (2-3 sentences on the week as a whole)
2. Nutrition Highlights (what they did well)
3. Areas to Improve (specific, actionable)
4. Weight Trend (comment on their weight data)
5. Top 3 Recommendations for next week

Be direct, specific, and encouraging. Use the actual numbers from their data.`

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
        max_tokens: 600,
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

    const report = data.content[0].text

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