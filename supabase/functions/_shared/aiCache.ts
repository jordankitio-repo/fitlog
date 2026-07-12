function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? String(value)
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(record[key])}`
  ).join(',')}}`
}

function serviceHeaders(): Record<string, string> {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
}

export async function hashInput(value: unknown): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(stableStringify(value))
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  } catch (error) {
    console.error('ai_cache hash failed:', error)
    return ''
  }
}

export async function getCached(fn: string, userId: string, inputHash: string): Promise<any | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const query = [
      `fn=eq.${encodeURIComponent(fn)}`,
      `user_id=eq.${encodeURIComponent(userId)}`,
      `input_hash=eq.${encodeURIComponent(inputHash)}`,
      `expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
      'select=response',
      'limit=1',
    ].join('&')
    const result = await fetch(`${supabaseUrl}/rest/v1/ai_cache?${query}`, {
      headers: serviceHeaders(),
    })
    if (!result.ok) return null
    const rows = await result.json()
    return rows?.[0]?.response ?? null
  } catch (error) {
    console.error('ai_cache read failed:', error)
    return null
  }
}

export async function setCached(
  fn: string,
  userId: string,
  inputHash: string,
  response: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const result = await fetch(`${supabaseUrl}/rest/v1/ai_cache`, {
      method: 'POST',
      headers: {
        ...serviceHeaders(),
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        fn,
        user_id: userId,
        input_hash: inputHash,
        response,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      }),
    })
    if (!result.ok) console.error('ai_cache write failed:', result.status)
  } catch (error) {
    console.error('ai_cache write failed:', error)
  }
}
