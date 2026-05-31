const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify user from token
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey }
    })
    const user = await userRes.json()
    if (!user.id) throw new Error('Unauthorized')
    const uid = user.id

    const headers = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json'
    }

    // Delete all user data explicitly before deleting auth user
    const deletions = [
      `nutrition_log?user_id=eq.${uid}`,
      `weight_log?user_id=eq.${uid}`,
      `cardio_log?user_id=eq.${uid}`,
      `steps_log?user_id=eq.${uid}`,
      `targets?user_id=eq.${uid}`,
      `check_ins?client_id=eq.${uid}`,
      `coach_messages?client_id=eq.${uid}`,
      `coach_messages?coach_id=eq.${uid}`,
      `client_messages?client_id=eq.${uid}`,
      `client_messages?coach_id=eq.${uid}`,
      `coach_notes?client_id=eq.${uid}`,
      `coach_notes?coach_id=eq.${uid}`,
      `reports?client_id=eq.${uid}`,
      `reports?coach_id=eq.${uid}`,
      `coach_clients?client_id=eq.${uid}`,
      `coach_clients?coach_id=eq.${uid}`,
      `invitations?coach_id=eq.${uid}`,
    ]

    for (const path of deletions) {
      await fetch(`${supabaseUrl}/rest/v1/${path}`, { method: 'DELETE', headers })
    }

    // Delete the auth user
    const deleteRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
      method: 'DELETE',
      headers
    })

    if (!deleteRes.ok) {
      const err = await deleteRes.text()
      throw new Error(`Failed to delete auth user: ${err}`)
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