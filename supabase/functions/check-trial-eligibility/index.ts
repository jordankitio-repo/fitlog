const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hashEmail(email: string): Promise<string> {
  const pepper = Deno.env.get('EMAIL_HASH_PEPPER') ?? ''
  const data = new TextEncoder().encode(`${pepper}:${email.toLowerCase().trim()}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    })
    const user = await userRes.json()
    if (!user.email) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const emailHash = await hashEmail(user.email)
    const headers = { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey, 'Content-Type': 'application/json' }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/trial_ledger?email_hash=eq.${emailHash}&select=coach_trial_used,solo_trial_used&limit=1`,
      { headers },
    )
    const rows = await res.json().catch(() => [])
    const ledger = Array.isArray(rows) ? rows[0] ?? null : null

    return new Response(JSON.stringify({
      coach_trial_used: ledger?.coach_trial_used ?? false,
      solo_trial_used: ledger?.solo_trial_used ?? false,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
