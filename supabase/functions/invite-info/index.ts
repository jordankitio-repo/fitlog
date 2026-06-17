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

// Public-safe invite details for the unauthenticated Join page: the inviting
// coach's name (which profiles RLS otherwise hides from an anonymous visitor),
// plus the invited email and whether an account already exists. The token is
// the credential — no auth required (mirrors get_invitation_by_token), and it's
// random/non-enumerable, so this only re-exposes what the invite email already
// shows the recipient. Returns { found:false } for an invalid/used token.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { token } = await req.json()
    if (typeof token !== 'string' || !token) {
      return jsonResponse({ error: 'token is required' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Validate the token via the same SECURITY DEFINER RPC the Join page uses
    // (granted to anon) — only returns a pending invite to a holder of the token.
    const invRes = await fetch(`${supabaseUrl}/rest/v1/rpc/get_invitation_by_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ p_token: token }),
    })
    const invRows = await invRes.json().catch(() => [])
    const invite = Array.isArray(invRows) ? invRows[0] : null
    if (!invite) return jsonResponse({ found: false })

    // Coach name via service role (service_role has SELECT on profiles).
    const coachRows = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${invite.coach_id}&select=full_name`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
    ).then((r) => r.json()).catch(() => [])

    return jsonResponse({
      found: true,
      coachName: coachRows?.[0]?.full_name || null,
      clientEmail: invite.client_email,
      accountExists: invite.account_exists === true,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 500)
  }
})
