const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientEmail, clientName, coachName, weekOf } = await req.json()

    const apiKey = Deno.env.get('RESEND_API_KEY')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'FitLog <noreply@tryfitlog.com>',
        to: [clientEmail],
        subject: `New coaching report from ${coachName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #4f8ef7;">You have a new report 📋</h2>
            <p>Hi ${clientName},</p>
            <p>Your coach <strong>${coachName}</strong> has sent you a weekly coaching report for the week of <strong>${weekOf}</strong>.</p>
            <p>Log in to FitLog to read your report and see your progress.</p>
            <a href="https://www.tryfitlog.com/login" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: #4f8ef7; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              View report
            </a>
            <p style="margin-top: 24px; color: #888; font-size: 0.875rem;">FitLog — your fitness coaching platform</p>
          </div>
        `
      }),
    })

    const data = await response.json()

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
