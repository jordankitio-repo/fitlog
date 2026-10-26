// Device sync: the only door through which device-sourced health data enters.
//
// The SQL side of this feature shipped in 20261015010000/20261015020000 --
// connections, provenance, the manual-edit pin, dedupe, tombstones, purge. All
// of it is service_role-only by design, so nothing could reach it until this
// function existed. This is that missing half, and nothing else.
//
// THE CLIENT NEVER SENDS A CONNECTION ID.
//
// It names a `provider` and the server resolves (user_id, provider) -> the live
// connection itself. That is deliberate and load-bearing: `apply_device_metrics`
// resolves user_id FROM the connection it is handed and does not check that the
// caller owns it, so a function that forwarded a client-supplied id would let
// any signed-in client write health data into another client's account by
// guessing a uuid. Verifying a supplied id would also close that hole, but
// never accepting one cannot be forgotten in a later edit.
//
// WHY A CONSENT RE-CHECK ON EVERY SYNC, not just at connect: WA MHMDA (and NV
// SB370, CT) grant a right to WITHDRAW consent. A gate that only ran at connect
// would keep ingesting for a client who revoked yesterday. Re-reading it here
// makes withdrawal take effect on the next sync with no extra moving parts --
// and the companion `purge` on disconnect is what makes it retroactive.
//
// Dates are LOCAL ISO 'YYYY-MM-DD' throughout, per src/utils/dateHelpers.js.
// The phone owns the client's timezone; the server only sanity-checks the range.

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

// Providers a DEVICE pushes from. Deliberately not the full set allowed by the
// table's check constraint: 'withings' and 'whoop' are vendor-cloud reads that
// would be pulled by a scheduled job holding OAuth credentials, not pushed by a
// phone holding a user session. Letting a client session claim one would mean
// accepting unauthenticated vendor data on that provider's name.
const PUSH_PROVIDERS = new Set(['apple_health', 'health_connect'])

const METRICS = new Set(['steps', 'weight', 'cardio'])

// Caps exist because the payload is attacker-controlled and `apply_device_metrics`
// is one statement per array -- an unbounded array is an unbounded transaction.
// Sized for a first-run backfill: 400 days of steps comfortably exceeds the one
// year of history the native layer asks Apple Health for.
const MAX_STEPS = 400
const MAX_WEIGHTS = 2000
const MAX_WORKOUTS = 2000

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// A local date can legitimately read one day ahead of UTC (client in UTC+13 just
// past midnight), so "tomorrow" is allowed and anything beyond it is not.
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const t = Date.parse(`${value}T00:00:00Z`)
  if (Number.isNaN(t)) return false
  return t >= Date.parse('2000-01-01T00:00:00Z') && t <= Date.now() + 36 * 60 * 60 * 1000
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

// Samples are filtered, never rejected wholesale. A phone reading Apple Health
// will occasionally surface a sample with a null field or a zero duration, and
// failing the whole sync over one bad row would strand every good row behind it
// -- permanently, because `synced_through` would never advance past it.
function cleanSteps(raw: unknown[]) {
  const out = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const steps = num(r.steps)
    if (!validDate(r.logged_date) || steps === null || steps < 0) continue
    const distance = num(r.distance)
    out.push({
      logged_date: r.logged_date,
      steps: Math.round(steps),
      distance: distance !== null && distance >= 0 ? distance : null,
    })
  }
  return out
}

function cleanWeights(raw: unknown[]) {
  const out = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const weight = num(r.weight)
    // external_id is required, not optional: it is the dedupe key, and a
    // weigh-in without one would re-insert on every sync forever. The RPC drops
    // these too -- dropping them here as well keeps the reported counts honest.
    if (!validDate(r.logged_date) || weight === null || weight <= 0) continue
    if (typeof r.external_id !== 'string' || !r.external_id) continue
    const unit = r.unit === 'kg' ? 'kg' : 'lbs'
    out.push({
      logged_date: r.logged_date,
      weighed_at: typeof r.weighed_at === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(r.weighed_at)
        ? r.weighed_at
        : null,
      weight,
      unit,
      external_id: r.external_id.slice(0, 200),
    })
  }
  return out
}

function cleanWorkouts(raw: unknown[]) {
  const out = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const duration = num(r.duration)
    if (!validDate(r.logged_date) || duration === null || duration <= 0) continue
    if (typeof r.external_id !== 'string' || !r.external_id) continue
    const calories = num(r.calories_burned)
    const hr = num(r.avg_heart_rate)
    const maxHr = num(r.max_heart_rate)
    const distance = num(r.distance)
    out.push({
      logged_date: r.logged_date,
      exercise_type: typeof r.exercise_type === 'string' && r.exercise_type
        ? r.exercise_type.slice(0, 100)
        : 'Other',
      duration: Math.round(duration),
      calories_burned: calories !== null && calories >= 0 ? Math.round(calories) : null,
      avg_heart_rate: hr !== null && hr > 0 ? Math.round(hr) : null,
      max_heart_rate: maxHr !== null && maxHr > 0 ? Math.round(maxHr) : null,
      distance: distance !== null && distance > 0 ? Math.round(distance * 100) / 100 : null,
      // Only an explicit false opts a workout out of the cardio target. A
      // missing flag is an older app build, which only ever sent cardio.
      counts_as_cardio: r.counts_as_cardio !== false,
      recorded_by: typeof r.recorded_by === 'string' && r.recorded_by
        ? r.recorded_by.slice(0, 80)
        : null,
      external_id: r.external_id.slice(0, 200),
    })
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'invalid_body' }, 400)
    }

    const { action, provider } = body as Record<string, unknown>

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    if (typeof action !== 'string') return jsonResponse({ error: 'missing_action' }, 400)
    if (typeof provider !== 'string' || !PUSH_PROVIDERS.has(provider)) {
      return jsonResponse({ error: 'unsupported_provider' }, 400)
    }

    const token = authHeader.replace('Bearer ', '')
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': anonKey },
    })
    const user = await userRes.json().catch(() => ({}))
    if (!user?.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const userId: string = user.id
    const headers = {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
    }

    // Per-call headers merge ON TOP of the service-role ones rather than being
    // replaced by them, or a `Prefer: return=representation` would be silently
    // dropped and the insert would come back with an empty body.
    const rest = async (path: string, init?: RequestInit) => {
      const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...init,
        headers: { ...headers, ...(init?.headers as Record<string, string> ?? {}) },
      })
      const text = await res.text()
      if (!res.ok) throw new Error(`rest ${path}: ${text}`)
      return text ? JSON.parse(text) : null
    }

    const rpc = (fn: string, args: Record<string, unknown>) =>
      rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })

    // The live connection for this user and provider, or null. The unique index
    // device_connections_live_key guarantees at most one.
    const liveConnection = async () => {
      const rows = await rest(
        `device_connections?select=id,status,synced_through,backfill_pending` +
        `&user_id=eq.${userId}&provider=eq.${provider}&status=neq.disconnected&limit=1`,
      )
      return rows?.[0] ?? null
    }

    const hasConsent = async (kind: string) => {
      const rows = await rest(
        `health_data_consents?select=id&user_id=eq.${userId}&kind=eq.${kind}` +
        `&scope=eq.${provider}&withdrawn_at=is.null&limit=1`,
      )
      return Boolean(rows?.length)
    }

    // ---------------------------------------------------------------- connect
    //
    // Records the two consents and opens the connection. Both are required,
    // and they are stored as two separate rows rather than one flag because the
    // law requires collection and sharing to be separately affirmable -- that is
    // what makes either independently withdrawable later. Requiring both to
    // enable an OPT-IN feature is not bundling: declining means not using device
    // sync, not losing anything the client already has.
    //
    // Both land before the connection row, so a failure part-way cannot leave a
    // connection ingesting data with no consent recorded against it.
    if (action === 'connect') {
      const {
        consentCollect, consentShareCoach, policyVersion, deviceLabel, consentTexts,
      } = body as Record<string, unknown>

      // The sentence each box said, kept with the grant (consent_text). Capped
      // because it is client-supplied; absent from an older app build.
      const texts = (consentTexts && typeof consentTexts === 'object')
        ? consentTexts as Record<string, unknown> : {}
      const textFor = (key: string) =>
        typeof texts[key] === 'string' && texts[key] ? (texts[key] as string).slice(0, 500) : null

      if (consentCollect !== true || consentShareCoach !== true) {
        return jsonResponse({ error: 'consent_required' }, 400)
      }
      if (typeof policyVersion !== 'string' || !policyVersion) {
        return jsonResponse({ error: 'missing_policy_version' }, 400)
      }

      for (const [kind, key] of [['device_collect', 'collect'], ['device_share_coach', 'shareCoach']]) {
        if (await hasConsent(kind)) continue
        await rest('health_data_consents', {
          method: 'POST',
          body: JSON.stringify({
            user_id: userId, kind, scope: provider, policy_version: policyVersion,
            consent_text: textFor(key),
          }),
        })
      }

      const existing = await liveConnection()
      if (existing) {
        return jsonResponse({
          connectionId: existing.id,
          syncedThrough: existing.synced_through,
          backfillPending: existing.backfill_pending,
          reconnected: false,
        })
      }

      const created = await rest('device_connections', {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: userId,
          provider,
          device_label: typeof deviceLabel === 'string' ? deviceLabel.slice(0, 120) : null,
        }),
      })

      const row = created?.[0]
      return jsonResponse({
        connectionId: row?.id ?? null,
        syncedThrough: null,
        backfillPending: true,
        reconnected: true,
      })
    }

    // ------------------------------------------------------------------- sync
    if (action === 'sync') {
      const connection = await liveConnection()
      if (!connection) return jsonResponse({ error: 'not_connected' }, 409)
      if (connection.status === 'reauth_required') {
        // Still accepted: the phone re-granting permission and immediately
        // syncing is exactly how this state clears, and mark_device_sync resets
        // status to 'active' on success.
      }

      if (!(await hasConsent('device_collect'))) {
        // Withdrawn since connecting. Not an error the phone should retry.
        return jsonResponse({ error: 'consent_withdrawn' }, 403)
      }

      const rawSteps = Array.isArray((body as Record<string, unknown>).steps)
        ? (body as Record<string, unknown>).steps as unknown[] : []
      const rawWeights = Array.isArray((body as Record<string, unknown>).weights)
        ? (body as Record<string, unknown>).weights as unknown[] : []
      const rawWorkouts = Array.isArray((body as Record<string, unknown>).workouts)
        ? (body as Record<string, unknown>).workouts as unknown[] : []

      if (rawSteps.length > MAX_STEPS || rawWeights.length > MAX_WEIGHTS ||
          rawWorkouts.length > MAX_WORKOUTS) {
        return jsonResponse({ error: 'payload_too_large' }, 413)
      }

      const steps = cleanSteps(rawSteps)
      const weights = cleanWeights(rawWeights)
      const workouts = cleanWorkouts(rawWorkouts)

      const { syncedThrough } = body as Record<string, unknown>
      const watermark = validDate(syncedThrough) ? syncedThrough : null

      let applied
      try {
        applied = await rpc('apply_device_metrics', {
          p_connection_id: connection.id,
          p_steps: steps,
          p_weights: weights,
          p_workouts: workouts,
        })
      } catch (err) {
        // Record the failure against the connection so three in a row surface
        // as 'error' in the client's settings, then report it. Without this the
        // client would see a silently stale "last synced" and no reason why.
        await rpc('mark_device_sync', {
          p_connection_id: connection.id, p_ok: false, p_error_code: 'apply_failed',
        }).catch(() => {})
        throw err
      }

      if (applied?.error) {
        await rpc('mark_device_sync', {
          p_connection_id: connection.id, p_ok: false, p_error_code: applied.error,
        }).catch(() => {})
        return jsonResponse({ error: applied.error }, 409)
      }

      // Only advance the watermark once the rows are durably in. A watermark
      // moved before a failed apply would skip that window forever.
      await rpc('mark_device_sync', {
        p_connection_id: connection.id,
        p_synced_through: watermark,
        p_ok: true,
      })

      return jsonResponse({
        steps: applied?.steps ?? 0,
        weights: applied?.weights ?? 0,
        workouts: applied?.workouts ?? 0,
        // What was dropped as unusable, so the native layer can be debugged
        // without guessing. Not an error: a filtered sample is normal.
        skipped: {
          steps: rawSteps.length - steps.length,
          weights: rawWeights.length - weights.length,
          workouts: rawWorkouts.length - workouts.length,
        },
        syncedThrough: watermark ?? connection.synced_through,
      })
    }

    // ------------------------------------------------------------- disconnect
    //
    // Two separate choices, because they are genuinely different: stop syncing,
    // and remove what was synced. `purge` is the WA MHMDA withdrawal right made
    // retroactive; without it, disconnecting leaves the history in place, which
    // is what most clients actually want.
    if (action === 'disconnect') {
      const connection = await liveConnection()
      if (!connection) return jsonResponse({ error: 'not_connected' }, 409)

      const purge = (body as Record<string, unknown>).purge === true
      let purged = null
      if (purge) {
        purged = await rpc('purge_device_data', {
          p_user_id: userId, p_connection_id: connection.id,
        })
      }

      await rest(`device_connections?id=eq.${connection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'disconnected', disconnected_at: new Date().toISOString() }),
      })

      // Withdraw the consents too. Leaving them standing would misrepresent the
      // client's position in the one record that is meant to evidence it.
      await rest(
        `health_data_consents?user_id=eq.${userId}&scope=eq.${provider}&withdrawn_at=is.null`,
        { method: 'PATCH', body: JSON.stringify({ withdrawn_at: new Date().toISOString() }) },
      )

      return jsonResponse({ disconnected: true, purged })
    }

    // -------------------------------------------------- dismiss / undismiss
    //
    // Called when the client deletes (or restores) a device-sourced row. Needed
    // by the WEB app as much as the phone: deleting the device's number in order
    // to type your own is the common path, and without a tombstone the next sync
    // puts it straight back.
    if (action === 'dismiss' || action === 'undismiss') {
      const { metric, dedupeKey } = body as Record<string, unknown>
      if (typeof metric !== 'string' || !METRICS.has(metric)) {
        return jsonResponse({ error: 'invalid_metric' }, 400)
      }
      if (typeof dedupeKey !== 'string' || !dedupeKey) {
        return jsonResponse({ error: 'invalid_dedupe_key' }, 400)
      }

      // Not liveConnection(): a row imported by a connection the client has
      // since disconnected must still be dismissable, and the RPCs check
      // ownership against the connection themselves.
      const rows = await rest(
        `device_connections?select=id&user_id=eq.${userId}&provider=eq.${provider}` +
        `&order=connected_at.desc&limit=1`,
      )
      const connectionId = rows?.[0]?.id
      if (!connectionId) return jsonResponse({ error: 'not_connected' }, 409)

      const ok = await rpc(
        action === 'dismiss' ? 'dismiss_device_row' : 'undismiss_device_row',
        {
          p_user_id: userId,
          p_connection_id: connectionId,
          p_metric: metric,
          p_dedupe_key: dedupeKey.slice(0, 200),
        },
      )
      if (ok !== true) return jsonResponse({ error: 'forbidden' }, 403)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'unknown_action' }, 400)
  } catch (error) {
    console.error('device-sync:', error instanceof Error ? error.message : error)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
