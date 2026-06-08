const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const {
      coachEmail,
      coachName,
      clientName,
      adherence,
      energy,
      obstacles,
      notes,
    } = await req.json()

    if (!coachEmail) {
      return new Response(JSON.stringify({ error: 'coachEmail is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const safeCoachName = escapeHtml(coachName || 'Coach')
    const safeClientName = escapeHtml(clientName || 'Your client')
    const safeAdherence = escapeHtml(adherence)
    const safeEnergy = escapeHtml(energy)
    const safeObstacles = escapeHtml(obstacles || 'None reported')
    const safeNotes = escapeHtml(notes || 'None')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Gardnr <noreply@gardnr.fit>',
        to: [coachEmail],
        subject: `New check-in from ${clientName || 'your client'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #4f8ef7;">New weekly check-in submitted</h2>
            <p>Hi ${safeCoachName},</p>
            <p><strong>${safeClientName}</strong> submitted a weekly check-in.</p>
            <div style="margin: 20px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;">
              <p><strong>Adherence:</strong> ${safeAdherence}/10</p>
              <p><strong>Energy:</strong> ${safeEnergy}/10</p>
              <p><strong>Obstacles:</strong><br>${safeObstacles}</p>
              <p><strong>Notes:</strong><br>${safeNotes}</p>
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

    if (!response.ok) {
      return new Response(JSON.stringify({ success: false, error: data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
