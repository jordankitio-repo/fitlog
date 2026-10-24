// `device-sync` over HTTP: who may write device health data, and into whose row.
//
// deviceSync.test.js already proves the SQL layer -- the manual-edit pin, dedupe,
// tombstones, purge. This file proves the ONE thing the SQL layer cannot:
// `apply_device_metrics` trusts whatever connection id it is handed and resolves
// the user from it, so the function in front of it is the only thing standing
// between a signed-in client and someone else's health record.
//
// Hence the central test: a client who names a provider can never reach another
// client's connection, because the client does not supply a connection id at
// all -- the server resolves it from the caller's own id. The test asserts the
// victim's STORED ROWS are untouched, not merely that the call failed.
//
// Requires edge-runtime (see redeemInviteFn.test.js for the EXCLUDES override);
// skips otherwise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, makeUser, cleanupUsers, today } from './helpers.js'
import { localEnv } from './env.js'

const { url, anonKey } = localEnv()
const FUNCTIONS_URL = `${url}/functions/v1`
const POLICY = 'test-1'

async function callFn(name, { token, body } = {}) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const sync = (token, extra = {}) => callFn('device-sync', {
  token,
  body: { action: 'sync', provider: 'apple_health', ...extra },
})

const connect = (token, extra = {}) => callFn('device-sync', {
  token,
  body: {
    action: 'connect',
    provider: 'apple_health',
    consentCollect: true,
    consentShareCoach: true,
    policyVersion: POLICY,
    ...extra,
  },
})

const samples = (date = today, id = 'w-1') => ({
  steps: [{ logged_date: date, steps: 8000, distance: 3.5 }],
  weights: [{ logged_date: date, weighed_at: '07:10:00', weight: 180.4, unit: 'lbs', external_id: id }],
  workouts: [{ logged_date: date, exercise_type: 'Running', duration: 30, calories_burned: 300, external_id: `c-${id}` }],
})

const tokenOf = async (user) => {
  const { data } = await user.client.auth.getSession()
  return data.session.access_token
}

async function edgeRuntimeUp() {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/device-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({}),
    })
    // 400 missing_action / 401 no auth header: either proves it is serving.
    return res.status === 400 || res.status === 401
  } catch {
    return false
  }
}

const serving = await edgeRuntimeUp()
const describeFn = serving ? describe : describe.skip
if (!serving) {
  console.warn(
    '\n[device-sync] edge-runtime not serving; skipping HTTP tests.\n' +
    '  EXCLUDES="vector,analytics,imgproxy,realtime,storage,studio,meta" npm run rls:setup\n',
  )
}

describeFn('device-sync: guards', () => {
  let client
  const all = []

  beforeAll(async () => {
    client = await makeUser('solo', 'dsfn-guards')
    all.push(client)
  })

  afterAll(async () => { await cleanupUsers(all) })

  it('refuses a request with no token', async () => {
    const { status } = await callFn('device-sync', {
      body: { action: 'sync', provider: 'apple_health' },
    })
    expect(status).toBe(401)
  })

  it('refuses a garbage token', async () => {
    const { status } = await sync('not-a-jwt')
    expect(status).toBe(401)
  })

  it('refuses an unknown provider', async () => {
    const { status, body } = await callFn('device-sync', {
      token: await tokenOf(client),
      body: { action: 'sync', provider: 'fitbit' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('unsupported_provider')
  })

  // A vendor-cloud provider is in the TABLE's check constraint but must not be
  // claimable by a phone holding a user session -- that would be accepting
  // unauthenticated vendor data under that vendor's name.
  it('refuses a vendor-cloud provider a device cannot push from', async () => {
    for (const provider of ['withings', 'whoop']) {
      const { status, body } = await callFn('device-sync', {
        token: await tokenOf(client),
        body: { action: 'sync', provider },
      })
      expect(status, provider).toBe(400)
      expect(body.error, provider).toBe('unsupported_provider')
    }
  })

  it('refuses an unknown action', async () => {
    const { status, body } = await callFn('device-sync', {
      token: await tokenOf(client),
      body: { action: 'destroy', provider: 'apple_health' },
    })
    expect(status).toBe(400)
    expect(body.error).toBe('unknown_action')
  })

  it('refuses to sync before connecting', async () => {
    const { status, body } = await sync(await tokenOf(client), samples())
    expect(status).toBe(409)
    expect(body.error).toBe('not_connected')
  })

  it('refuses to connect without both consents', async () => {
    const token = await tokenOf(client)
    for (const partial of [
      { consentCollect: false, consentShareCoach: true },
      { consentCollect: true, consentShareCoach: false },
      { consentCollect: false, consentShareCoach: false },
    ]) {
      const { status, body } = await connect(token, partial)
      expect(status, JSON.stringify(partial)).toBe(400)
      expect(body.error).toBe('consent_required')
    }

    // And nothing was opened as a side effect of being asked.
    const { data } = await admin.from('device_connections').select('id').eq('user_id', client.id)
    expect(data).toHaveLength(0)
  })

  it('refuses a connect with no policy version to record', async () => {
    const { status, body } = await connect(await tokenOf(client), { policyVersion: '' })
    expect(status).toBe(400)
    expect(body.error).toBe('missing_policy_version')
  })
})

describeFn('device-sync: connect and ingest', () => {
  let client, token
  const all = []

  beforeAll(async () => {
    client = await makeUser('solo', 'dsfn-ingest')
    all.push(client)
    token = await tokenOf(client)
  })

  afterAll(async () => { await cleanupUsers(all) })

  it('connect records both consents separately and opens one connection', async () => {
    const { status, body } = await connect(token, { deviceLabel: "Jordan's iPhone" })
    expect(status).toBe(200)
    expect(body.connectionId).toBeTruthy()
    expect(body.backfillPending).toBe(true)

    const { data: consents } = await admin
      .from('health_data_consents')
      .select('kind, scope, policy_version, withdrawn_at')
      .eq('user_id', client.id)
    expect(consents).toHaveLength(2)
    expect(consents.map((c) => c.kind).sort()).toEqual(['device_collect', 'device_share_coach'])
    for (const c of consents) {
      expect(c.scope).toBe('apple_health')
      expect(c.policy_version).toBe(POLICY)
      expect(c.withdrawn_at).toBeNull()
    }

    const { data: conns } = await admin
      .from('device_connections').select('id, provider, device_label, status').eq('user_id', client.id)
    expect(conns).toHaveLength(1)
    expect(conns[0]).toMatchObject({
      provider: 'apple_health', device_label: "Jordan's iPhone", status: 'active',
    })
  })

  it('connect is idempotent -- a second call opens no second connection', async () => {
    const { status, body } = await connect(token)
    expect(status).toBe(200)
    expect(body.reconnected).toBe(false)

    const { data } = await admin.from('device_connections').select('id').eq('user_id', client.id)
    expect(data).toHaveLength(1)
    const { data: consents } = await admin
      .from('health_data_consents').select('id').eq('user_id', client.id)
    expect(consents, 'consent duplicated on re-connect').toHaveLength(2)
  })

  it('ingests steps, weight and cardio, marked with the provider', async () => {
    const { status, body } = await sync(token, { ...samples(), syncedThrough: today })
    expect(status).toBe(200)
    expect(body).toMatchObject({ steps: 1, weights: 1, workouts: 1 })

    const { data: steps } = await admin
      .from('steps_log').select('steps, source, external_id').eq('user_id', client.id)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ steps: 8000, source: 'apple_health' })

    const { data: weights } = await admin
      .from('weight_log').select('weight, source, external_id').eq('user_id', client.id)
    expect(weights[0]).toMatchObject({ source: 'apple_health', external_id: 'w-1' })
    expect(Number(weights[0].weight)).toBeCloseTo(180.4, 1)
  })

  it('advances the watermark only on success', async () => {
    const { data } = await admin
      .from('device_connections')
      .select('synced_through, last_synced_at, backfill_pending, consecutive_failures')
      .eq('user_id', client.id).single()
    expect(data.synced_through).toBe(today)
    expect(data.last_synced_at).not.toBeNull()
    expect(data.backfill_pending).toBe(false)
    expect(data.consecutive_failures).toBe(0)
  })

  it('re-sending the same window creates no duplicates', async () => {
    await sync(token, { ...samples(), syncedThrough: today })
    await sync(token, { ...samples(), syncedThrough: today })

    for (const table of ['steps_log', 'weight_log', 'cardio_log']) {
      const { data } = await admin.from(table).select('id').eq('user_id', client.id)
      expect(data, `${table} duplicated`).toHaveLength(1)
    }
  })

  // A phone reading Apple Health will surface the occasional unusable sample.
  // Failing the whole sync over one would strand every good row behind it
  // forever, because the watermark would never advance past that window.
  it('drops unusable samples and still ingests the good ones', async () => {
    const { status, body } = await sync(token, {
      steps: [
        { logged_date: today, steps: 9000 },
        { logged_date: 'not-a-date', steps: 500 },
        { logged_date: today, steps: -5 },
      ],
      weights: [
        { logged_date: today, weight: 181, external_id: 'w-good' },
        { logged_date: today, weight: 181 },              // no external_id -> undedupable
        { logged_date: today, weight: 0, external_id: 'w-zero' },
      ],
      workouts: [{ logged_date: today, duration: 0, external_id: 'c-zero' }],
      syncedThrough: today,
    })

    expect(status).toBe(200)
    expect(body.skipped).toMatchObject({ steps: 2, weights: 2, workouts: 1 })
    expect(body.steps).toBe(1)
  })

  it('refuses an oversized payload rather than opening an unbounded transaction', async () => {
    const many = Array.from({ length: 401 }, (_, i) => ({ logged_date: today, steps: i }))
    const { status, body } = await sync(token, { steps: many })
    expect(status).toBe(413)
    expect(body.error).toBe('payload_too_large')
  })

  it('ignores a watermark it cannot trust', async () => {
    const before = await admin.from('device_connections')
      .select('synced_through').eq('user_id', client.id).single()

    await sync(token, { syncedThrough: '2099-01-01' })

    const after = await admin.from('device_connections')
      .select('synced_through').eq('user_id', client.id).single()
    expect(after.data.synced_through).toBe(before.data.synced_through)
  })
})

// THE TEST THIS FILE EXISTS FOR.
describeFn('device-sync: one client cannot write into another', () => {
  let victim, attacker
  const all = []

  beforeAll(async () => {
    victim = await makeUser('solo', 'dsfn-victim')
    attacker = await makeUser('solo', 'dsfn-attacker')
    all.push(victim, attacker)

    await connect(await tokenOf(victim))
    await sync(await tokenOf(victim), { ...samples(today, 'victim-1'), syncedThrough: today })
  })

  afterAll(async () => { await cleanupUsers(all) })

  it("the attacker's sync lands in their own row, never the victim's", async () => {
    await connect(await tokenOf(attacker))
    const { status } = await sync(await tokenOf(attacker), {
      steps: [{ logged_date: today, steps: 1 }],
      weights: [{ logged_date: today, weight: 99, external_id: 'attacker-1' }],
      syncedThrough: today,
    })
    expect(status).toBe(200)

    // The victim's numbers are exactly as they were.
    const { data: vSteps } = await admin
      .from('steps_log').select('steps').eq('user_id', victim.id)
    expect(vSteps).toHaveLength(1)
    expect(vSteps[0].steps).toBe(8000)

    const { data: vWeights } = await admin
      .from('weight_log').select('weight, external_id').eq('user_id', victim.id)
    expect(vWeights).toHaveLength(1)
    expect(vWeights[0].external_id).toBe('victim-1')
  })

  // A client-supplied connection id is the hole the function is shaped to avoid.
  // Sending one must change nothing: the server resolves the connection from the
  // caller's own id and ignores the field entirely.
  it("a forged connectionId in the body is ignored, not honoured", async () => {
    const { data: vConn } = await admin
      .from('device_connections').select('id').eq('user_id', victim.id).single()

    const { status } = await callFn('device-sync', {
      token: await tokenOf(attacker),
      body: {
        action: 'sync',
        provider: 'apple_health',
        connectionId: vConn.id,
        p_connection_id: vConn.id,
        steps: [{ logged_date: today, steps: 77777 }],
        syncedThrough: today,
      },
    })
    expect(status).toBe(200)

    const { data: vSteps } = await admin
      .from('steps_log').select('steps').eq('user_id', victim.id)
    expect(vSteps[0].steps, "victim's steps were overwritten via a forged id").toBe(8000)

    const { data: aSteps } = await admin
      .from('steps_log').select('steps').eq('user_id', attacker.id)
    expect(aSteps[0].steps).toBe(77777)
  })

  it('an attacker cannot dismiss a row out of the victim\'s history', async () => {
    const { status } = await callFn('device-sync', {
      token: await tokenOf(attacker),
      body: {
        action: 'dismiss', provider: 'apple_health',
        metric: 'weight', dedupeKey: 'victim-1',
      },
    })
    expect(status).toBe(200)   // succeeds -- against the ATTACKER's own connection

    // Re-syncing the victim's window must still restore/keep their weigh-in,
    // which proves no tombstone was written against their connection.
    await sync(await tokenOf(victim), { ...samples(today, 'victim-1'), syncedThrough: today })
    const { data } = await admin
      .from('weight_log').select('external_id').eq('user_id', victim.id)
    expect(data.map((r) => r.external_id)).toContain('victim-1')
  })
})

describeFn('device-sync: consent withdrawal and disconnect', () => {
  let client, token
  const all = []

  beforeAll(async () => {
    client = await makeUser('solo', 'dsfn-withdraw')
    all.push(client)
    token = await tokenOf(client)
    await connect(token)
    await sync(token, { ...samples(today, 'w-keep'), syncedThrough: today })
  })

  afterAll(async () => { await cleanupUsers(all) })

  // The withdrawal right is only real if it takes effect without a disconnect.
  it('stops ingesting the moment collection consent is withdrawn', async () => {
    await admin.from('health_data_consents')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('user_id', client.id).eq('kind', 'device_collect')

    const { status, body } = await sync(token, {
      steps: [{ logged_date: today, steps: 12345 }], syncedThrough: today,
    })
    expect(status).toBe(403)
    expect(body.error).toBe('consent_withdrawn')

    const { data } = await admin.from('steps_log').select('steps').eq('user_id', client.id)
    expect(data[0].steps, 'ingested after consent was withdrawn').toBe(8000)
  })

  it('disconnect without purge keeps the history and withdraws the consents', async () => {
    // Re-grant so the disconnect path starts from a connected, consented state.
    await admin.from('health_data_consents')
      .update({ withdrawn_at: null }).eq('user_id', client.id)

    const { status, body } = await callFn('device-sync', {
      token, body: { action: 'disconnect', provider: 'apple_health' },
    })
    expect(status).toBe(200)
    expect(body.disconnected).toBe(true)

    const { data: weights } = await admin
      .from('weight_log').select('id').eq('user_id', client.id)
    expect(weights, 'disconnecting erased history it should have kept').toHaveLength(1)

    const { data: conn } = await admin
      .from('device_connections').select('status, disconnected_at').eq('user_id', client.id).single()
    expect(conn.status).toBe('disconnected')
    expect(conn.disconnected_at).not.toBeNull()

    const { data: live } = await admin
      .from('health_data_consents').select('id')
      .eq('user_id', client.id).is('withdrawn_at', null)
    expect(live, 'consent still standing after disconnect').toHaveLength(0)
  })

  it('a disconnected connection cannot be synced', async () => {
    const { status, body } = await sync(token, samples())
    expect(status).toBe(409)
    expect(body.error).toBe('not_connected')
  })

  it('reconnecting after a disconnect opens a fresh connection', async () => {
    const { status, body } = await connect(token)
    expect(status).toBe(200)
    expect(body.reconnected).toBe(true)

    const { data } = await admin
      .from('device_connections').select('status').eq('user_id', client.id)
    expect(data).toHaveLength(2)                       // the tombstoned one, and the new one
    expect(data.filter((c) => c.status === 'active')).toHaveLength(1)
  })
})

describeFn('device-sync: disconnect with purge', () => {
  let client, token
  const all = []

  beforeAll(async () => {
    client = await makeUser('solo', 'dsfn-purge')
    all.push(client)
    token = await tokenOf(client)
    await connect(token)
    await sync(token, { ...samples(today, 'w-purge'), syncedThrough: today })
  })

  afterAll(async () => { await cleanupUsers(all) })

  // The one thing purge must NOT do: take rows the client corrected by hand.
  // The moment they edited a number it became their own entry, not the device's.
  it('removes what the device added but keeps what the client typed', async () => {
    await admin.from('steps_log')
      .update({ steps: 11000, source: 'manual' }).eq('user_id', client.id)

    const { status, body } = await callFn('device-sync', {
      token, body: { action: 'disconnect', provider: 'apple_health', purge: true },
    })
    expect(status).toBe(200)
    expect(body.purged).toMatchObject({ weights: 1, workouts: 1 })

    const { data: steps } = await admin
      .from('steps_log').select('steps').eq('user_id', client.id)
    expect(steps, 'purge deleted a row the client had edited').toHaveLength(1)
    expect(steps[0].steps).toBe(11000)

    const { data: weights } = await admin
      .from('weight_log').select('id').eq('user_id', client.id)
    expect(weights).toHaveLength(0)
  })
})
