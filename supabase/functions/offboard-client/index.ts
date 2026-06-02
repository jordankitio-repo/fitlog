// v2
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientId } = await req.json()
    const authHeader = req.headers.get('Authorization')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'Missing clientId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify user from token
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey }
    })
    const user = await userRes.json()
    if (!user.id) throw new Error('Unauthorized')
    const requestingUserId = user.id

    const headers = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json'
    }

    // Confirm the authenticated user is actually this client's active coach.
    const relationshipRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?select=id&coach_id=eq.${requestingUserId}&client_id=eq.${clientId}&status=eq.active`,
      { headers }
    )
    const relationshipText = await relationshipRes.text()

    if (!relationshipRes.ok) {
      throw new Error(`Failed to verify coach-client relationship: ${relationshipText}`)
    }

    const relationships = JSON.parse(relationshipText)
    const relationship = relationships[0]
    if (!relationship) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const now = new Date().toISOString()

    const offboardRes = await fetch(
      `${supabaseUrl}/rest/v1/coach_clients?id=eq.${relationship.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'offboarded', offboarded_at: now }),
      }
    )
    const offboardText = await offboardRes.text()

    if (!offboardRes.ok) {
      throw new Error(`Failed to offboard client: ${offboardText}`)
    }

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${clientId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: 'solo' }),
      }
    )
    const profileText = await profileRes.text()

    if (!profileRes.ok) {
      throw new Error(`Failed to update client profile: ${profileText}`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
