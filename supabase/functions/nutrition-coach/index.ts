import { callAnthropic } from '../_shared/anthropic.ts'
import { getCached, hashInput, setCached } from '../_shared/aiCache.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PAID_STATUSES = ['trialing', 'active', 'past_due']

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Per-user rate limit via the check_rate_limit RPC. Fails OPEN: a limiter hiccup
// must not break the feature for legitimate users (the abuse case still requires
// the limiter to be down). Returns true when the call is allowed.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    const user = await userRes.json()

    if (!user.id) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const restHeaders = {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    }

    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      { headers: restHeaders },
    )
    const profiles = await profileRes.json()
    const role = profiles?.[0]?.role

    if (!profileRes.ok || !role) {
      return jsonResponse({ error: 'Profile not found' }, 404)
    }

    if (!['coach', 'client', 'solo'].includes(role)) {
      return jsonResponse({ error: 'AI nutrition feedback is not available for this account type' }, 403)
    }

    if (role === 'solo') {
      const subRes = await fetch(
        `${supabaseUrl}/rest/v1/subscriptions?solo_id=eq.${user.id}&select=status,paused_for_coaching&limit=1`,
        { headers: restHeaders },
      )
      const subs = await subRes.json()
      const sub = subs?.[0]

      if (!subRes.ok) {
        return jsonResponse({ error: 'Unable to verify subscription' }, 500)
      }

      if (!sub?.status || !PAID_STATUSES.includes(sub.status) || sub.paused_for_coaching) {
        return jsonResponse({ error: 'Solo Premium required' }, 403)
      }
    }

    const { entries } = await req.json()

    const inputHash = await hashInput(entries)
    const cached = inputHash
      ? await getCached('nutrition-coach:v1', user.id, inputHash)
      : null
    if (cached?.message) return jsonResponse({ message: cached.message })

    if (!(await withinRateLimit(supabaseUrl, serviceKey, user.id, 'nutrition-coach', 30, 3600))) {
      return jsonResponse({ error: 'Too many requests — please wait a bit before trying again.' }, 429)
    }

    const entryList = entries
      .map((e: { food: string; calories: number }) => `- ${e.food}: ${e.calories} cal`)
      .join('\n')

    const prompt = `You are a nutrition coach. A user has logged the following meals today:
${entryList}
Give them brief, practical feedback in 3-4 sentences. Assess their calorie intake, comment on what you can infer about their nutrition, and give one concrete suggestion.`

    const result = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })
    if (!result.ok) {
      console.error('nutrition-coach anthropic failed:', result.status, result.error)
      return jsonResponse({
        error: result.retryable
          ? 'Our AI is busy right now — please try again in a moment.'
          : "Couldn't generate a response right now.",
      }, result.retryable ? 503 : 502)
    }

    const message = result.text
    if (inputHash) {
      await setCached('nutrition-coach:v1', user.id, inputHash, { message }, 21600)
    }

    return jsonResponse({ message })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('Nutrition coach error:', message)
    return jsonResponse({ error: message }, 500)
  }
})
