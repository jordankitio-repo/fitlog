// Device sync: the metric-write RPCs, and the one rule the whole feature rests on.
//
// THE RULE: a synced value fills the field; the client may edit it at any time;
// their edit is then pinned and no later sync may overwrite it.
//
// Every negative case below asserts the STORED VALUE, not the row count the RPC
// reports. An "I skipped it" return value next to a quietly clobbered number
// would pass a count-only test while losing the client's data, which is the one
// failure this feature cannot have. Same standard as stepUpFn.test.js: assert
// the side effect did not happen, not just that the call said so.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, makeUser, cleanupUsers, today } from './helpers.js'

const CONSENT_VERSION = 'test-1'

async function makeConnection(userId, provider = 'apple_health', label = null) {
  const { data, error } = await admin
    .from('device_connections')
    .insert({ user_id: userId, provider, device_label: label })
    .select('id')
    .single()
  if (error) throw new Error(`makeConnection(${provider}): ${error.message}`)
  return data.id
}

const apply = (connectionId, { steps = [], weights = [], workouts = [] } = {}) =>
  admin.rpc('apply_device_metrics', {
    p_connection_id: connectionId,
    p_steps: steps,
    p_weights: weights,
    p_workouts: workouts,
  })

// One day's worth of each metric, so a test can re-send an identical payload.
const payload = (date = today) => ({
  steps: [{ logged_date: date, steps: 8000, distance: 3.5 }],
  weights: [{ logged_date: date, weighed_at: '07:10:00', weight: 180.4, unit: 'lbs', external_id: 'w-1' }],
  workouts: [{ logged_date: date, exercise_type: 'Running', duration: 30, calories_burned: 300, external_id: 'c-1' }],
})

describe('apply_device_metrics', () => {
  let user, conn
  const all = []

  beforeAll(async () => {
    user = await makeUser('solo', 'device-owner')
    all.push(user)
    conn = await makeConnection(user.id)
  })

  afterAll(async () => { await cleanupUsers(all) })

  it('imports steps, weight and cardio for the connection owner', async () => {
    const { data, error } = await apply(conn, payload())
    expect(error).toBeNull()
    expect(data).toMatchObject({ steps: 1, weights: 1, workouts: 1 })

    const { data: steps } = await admin.from('steps_log').select('steps, source').eq('user_id', user.id)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ steps: 8000, source: 'apple_health' })
  })

  it('re-applying the same window creates no duplicates', async () => {
    await apply(conn, payload())
    await apply(conn, payload())

    for (const table of ['steps_log', 'weight_log', 'cardio_log']) {
      const { data } = await admin.from(table).select('id').eq('user_id', user.id)
      expect(data, `${table} duplicated on re-sync`).toHaveLength(1)
    }
  })

  it('NEVER overwrites a value the client edited by hand', async () => {
    // The client corrects all three numbers. The app marks them manual.
    await admin.from('steps_log').update({ steps: 12000, source: 'manual' }).eq('user_id', user.id)
    await admin.from('weight_log').update({ weight: 179.0, source: 'manual' }).eq('user_id', user.id)
    await admin.from('cardio_log').update({ duration: 45, source: 'manual' }).eq('user_id', user.id)

    // A later sync re-sends the original device numbers.
    const { data } = await apply(conn, payload())
    expect(data).toMatchObject({ steps: 0, weights: 0, workouts: 0 })

    const { data: s } = await admin.from('steps_log').select('steps').eq('user_id', user.id).single()
    const { data: w } = await admin.from('weight_log').select('weight').eq('user_id', user.id).single()
    const { data: c } = await admin.from('cardio_log').select('duration').eq('user_id', user.id).single()
    expect(s.steps).toBe(12000)
    expect(Number(w.weight)).toBe(179)
    expect(c.duration).toBe(45)
  })

  it('keeps external_id on an edited row, so the next sync matches instead of duplicating', async () => {
    const { data } = await admin.from('weight_log').select('external_id, source').eq('user_id', user.id).single()
    expect(data.source).toBe('manual')
    expect(data.external_id).toBe('w-1')
  })

  it('skips malformed records instead of failing the whole batch', async () => {
    const { data, error } = await apply(conn, {
      steps: [{ logged_date: null, steps: 'abc' }],
      weights: [{ logged_date: today, weight: 0, external_id: null }],
      workouts: [{ logged_date: today, duration: 0, external_id: 'zero' }],
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({ steps: 0, weights: 0, workouts: 0 })
  })

  it('refuses an unknown connection', async () => {
    const { data } = await apply('44444444-4444-4444-4444-444444444444')
    expect(data).toMatchObject({ error: 'unknown_connection' })
  })

  it('refuses a disconnected connection', async () => {
    const dead = await makeConnection(user.id, 'whoop')
    await admin.from('device_connections').update({ status: 'disconnected' }).eq('id', dead)
    const { data } = await apply(dead, payload('2026-01-02'))
    expect(data).toMatchObject({ error: 'connection_disconnected' })

    const { data: rows } = await admin.from('steps_log').select('id')
      .eq('user_id', user.id).eq('logged_date', '2026-01-02')
    expect(rows).toHaveLength(0)
  })

  it('is invisible and uncallable from the browser', async () => {
    // The RPC writes health data and resolves ownership itself; a signed-in
    // user must not be able to drive it directly.
    const { error } = await user.client.rpc('apply_device_metrics', {
      p_connection_id: conn, p_steps: [], p_weights: [], p_workouts: [],
    })
    expect(error).not.toBeNull()
  })
})

describe('metric ownership (steps and weight are one-value-per-day)', () => {
  let user, first, second
  const all = []

  beforeAll(async () => {
    user = await makeUser('solo', 'device-two')
    all.push(user)
    first = await makeConnection(user.id, 'apple_health')
    second = await makeConnection(user.id, 'whoop')
    await apply(first, { steps: [{ logged_date: today, steps: 9000 }] })
  })

  afterAll(async () => { await cleanupUsers(all) })

  it('the first connection to write a metric owns it', async () => {
    const { data } = await admin.from('device_metric_preferences')
      .select('connection_id').eq('user_id', user.id).eq('metric', 'steps').single()
    expect(data.connection_id).toBe(first)
  })

  it('a second connection cannot overwrite the owner steps value', async () => {
    const { data } = await apply(second, { steps: [{ logged_date: today, steps: 1111 }] })
    expect(data.steps).toBe(0)

    const { data: row } = await admin.from('steps_log').select('steps, source_connection_id')
      .eq('user_id', user.id).eq('logged_date', today).single()
    expect(row.steps).toBe(9000)
    expect(row.source_connection_id).toBe(first)
  })

  it('cardio is additive: two connections contribute different sessions', async () => {
    await apply(first, { workouts: [{ logged_date: today, exercise_type: 'Running', duration: 20, external_id: 'a-1' }] })
    await apply(second, { workouts: [{ logged_date: today, exercise_type: 'Rowing', duration: 15, external_id: 'b-1' }] })

    const { data } = await admin.from('cardio_log').select('exercise_type').eq('user_id', user.id)
    expect(data).toHaveLength(2)
  })

  it('ownership transfers when the owning connection is disconnected', async () => {
    await admin.from('device_connections').update({ status: 'disconnected' }).eq('id', first)
    const { data } = await apply(second, { steps: [{ logged_date: today, steps: 2222 }] })
    expect(data.steps).toBe(1)

    const { data: row } = await admin.from('steps_log').select('steps')
      .eq('user_id', user.id).eq('logged_date', today).single()
    expect(row.steps).toBe(2222)
  })
})

describe('tombstones (a deleted device row must stay deleted)', () => {
  let user, conn
  const all = []
  const workout = { logged_date: today, exercise_type: 'Cycling', duration: 20, external_id: 'tomb-1' }

  beforeAll(async () => {
    user = await makeUser('solo', 'device-tomb')
    all.push(user)
    conn = await makeConnection(user.id)
  })

  afterAll(async () => { await cleanupUsers(all) })

  it('without a tombstone, a deleted row comes back on the next sync', async () => {
    await apply(conn, { workouts: [workout] })
    await admin.from('cardio_log').delete().eq('external_id', 'tomb-1')
    await apply(conn, { workouts: [workout] })

    const { data } = await admin.from('cardio_log').select('id').eq('external_id', 'tomb-1')
    expect(data).toHaveLength(1)   // documents WHY tombstones exist
  })

  it('a tombstoned row is not re-created', async () => {
    await admin.from('cardio_log').delete().eq('external_id', 'tomb-1')
    const { data: ok } = await admin.rpc('dismiss_device_row', {
      p_user_id: user.id, p_connection_id: conn, p_metric: 'cardio', p_dedupe_key: 'tomb-1',
    })
    expect(ok).toBe(true)

    await apply(conn, { workouts: [workout] })
    const { data } = await admin.from('cardio_log').select('id').eq('external_id', 'tomb-1')
    expect(data).toHaveLength(0)
  })

  it('lifting the tombstone lets the row return (the "pull from device" path)', async () => {
    await admin.rpc('undismiss_device_row', {
      p_user_id: user.id, p_connection_id: conn, p_metric: 'cardio', p_dedupe_key: 'tomb-1',
    })
    await apply(conn, { workouts: [workout] })

    const { data } = await admin.from('cardio_log').select('id').eq('external_id', 'tomb-1')
    expect(data).toHaveLength(1)
  })

  it('refuses to tombstone a connection the caller does not own', async () => {
    const other = await makeUser('solo', 'device-tomb-other')
    all.push(other)
    const { data } = await admin.rpc('dismiss_device_row', {
      p_user_id: other.id, p_connection_id: conn, p_metric: 'cardio', p_dedupe_key: 'nope',
    })
    expect(data).toBe(false)

    const { data: rows } = await admin.from('device_dismissals')
      .select('dedupe_key').eq('connection_id', conn).eq('dedupe_key', 'nope')
    expect(rows).toHaveLength(0)
  })
})

describe('purge_device_data (disconnect and remove what this device added)', () => {
  let user, conn
  const all = []

  beforeAll(async () => {
    user = await makeUser('solo', 'device-purge')
    all.push(user)
    conn = await makeConnection(user.id)
    await apply(conn, {
      workouts: [
        { logged_date: today, exercise_type: 'Running', duration: 30, external_id: 'keep-me' },
        { logged_date: today, exercise_type: 'Rowing', duration: 10, external_id: 'purge-me' },
      ],
    })
    // The client edited one of them, making it their own entry.
    await admin.from('cardio_log').update({ source: 'manual' }).eq('external_id', 'keep-me')
  })

  afterAll(async () => { await cleanupUsers(all) })

  it('deletes device rows but keeps rows the client edited', async () => {
    const { data } = await admin.rpc('purge_device_data', {
      p_user_id: user.id, p_connection_id: conn,
    })
    expect(data.workouts).toBe(1)

    const { data: left } = await admin.from('cardio_log').select('external_id, source').eq('user_id', user.id)
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({ external_id: 'keep-me', source: 'manual' })
  })

  it('refuses a connection the caller does not own', async () => {
    const other = await makeUser('solo', 'device-purge-other')
    all.push(other)
    const { data } = await admin.rpc('purge_device_data', {
      p_user_id: other.id, p_connection_id: conn,
    })
    expect(data).toMatchObject({ error: 'unknown_connection' })
  })
})

describe('mark_device_sync (failure state machine)', () => {
  let user, conn
  const all = []

  beforeAll(async () => {
    user = await makeUser('solo', 'device-state')
    all.push(user)
    conn = await makeConnection(user.id)
  })

  afterAll(async () => { await cleanupUsers(all) })

  const statusOf = async () => {
    const { data } = await admin.from('device_connections')
      .select('status, consecutive_failures, synced_through, backfill_pending').eq('id', conn).single()
    return data
  }

  it('a success advances the watermark and clears the failure count', async () => {
    await admin.rpc('mark_device_sync', {
      p_connection_id: conn, p_synced_through: today, p_ok: true, p_error_code: null,
    })
    const s = await statusOf()
    expect(s).toMatchObject({ status: 'active', consecutive_failures: 0, backfill_pending: false })
    expect(s.synced_through).toBe(today)
  })

  it('holds status at active for the first two failures, so a blip does not nag', async () => {
    for (let i = 0; i < 2; i++) {
      await admin.rpc('mark_device_sync', { p_connection_id: conn, p_ok: false, p_error_code: 'retry' })
    }
    const s = await statusOf()
    expect(s.consecutive_failures).toBe(2)
    expect(s.status).toBe('active')
  })

  it('surfaces an error state on the third consecutive failure', async () => {
    await admin.rpc('mark_device_sync', { p_connection_id: conn, p_ok: false, p_error_code: 'retry' })
    expect((await statusOf()).status).toBe('error')
  })

  it('a failed sync does not move the watermark', async () => {
    expect((await statusOf()).synced_through).toBe(today)
  })

  it('a dead credential asks for a reconnect immediately, without waiting for three strikes', async () => {
    await admin.rpc('mark_device_sync', { p_connection_id: conn, p_ok: true, p_synced_through: today })
    await admin.rpc('mark_device_sync', { p_connection_id: conn, p_ok: false, p_error_code: 'reauth' })
    expect((await statusOf()).status).toBe('reauth_required')
  })
})

describe('device table isolation', () => {
  let owner, stranger, coach, conn
  const all = []

  beforeAll(async () => {
    owner = await makeUser('client', 'device-iso-owner')
    stranger = await makeUser('solo', 'device-iso-stranger')
    coach = await makeUser('coach', 'device-iso-coach')
    all.push(owner, stranger, coach)
    await admin.from('coach_clients').insert({ coach_id: coach.id, client_id: owner.id, status: 'active' })
    conn = await makeConnection(owner.id, 'apple_health', "Owner's iPhone")
    await admin.from('health_data_consents').insert({
      user_id: owner.id, kind: 'device_collect', scope: 'apple_health', policy_version: CONSENT_VERSION,
    })
  })

  afterAll(async () => { await cleanupUsers(all) })

  it('the owner CAN read their own connection', async () => {
    const { data } = await owner.client.from('device_connections').select('device_label').eq('id', conn)
    expect(data).toHaveLength(1)
    expect(data[0].device_label).toBe("Owner's iPhone")
  })

  it('a stranger CANNOT read it', async () => {
    const { data } = await stranger.client.from('device_connections').select('*').eq('id', conn)
    expect(data ?? []).toHaveLength(0)
  })

  it('even an active coach CANNOT read a client connection', async () => {
    // Deliberate: the `source` column on the metric rows tells a coach what they
    // need. The connection row is one less surface to scope.
    const { data } = await coach.client.from('device_connections').select('*').eq('id', conn)
    expect(data ?? []).toHaveLength(0)
  })

  it('a user CANNOT create or alter a connection directly', async () => {
    const { error: insErr } = await owner.client.from('device_connections')
      .insert({ user_id: owner.id, provider: 'whoop' })
    expect(insErr).not.toBeNull()

    // Rewinding the watermark would force a re-sync over pinned manual values.
    await owner.client.from('device_connections').update({ synced_through: '2020-01-01' }).eq('id', conn)
    const { data } = await admin.from('device_connections').select('synced_through').eq('id', conn).single()
    expect(data.synced_through).not.toBe('2020-01-01')
  })

  it('NOBODY can read tombstones from the browser, including the owner', async () => {
    const { data } = await owner.client.from('device_dismissals').select('*')
    expect(data ?? []).toHaveLength(0)
  })

  it('the owner CAN read their own consent record', async () => {
    const { data } = await owner.client.from('health_data_consents').select('kind, scope').eq('user_id', owner.id)
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ kind: 'device_collect', scope: 'apple_health' })
  })

  it('a stranger CANNOT read someone else consent record', async () => {
    const { data } = await stranger.client.from('health_data_consents').select('*').eq('user_id', owner.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('deleting a connection cascades to its preferences and tombstones', async () => {
    const temp = await makeConnection(owner.id, 'whoop')
    await apply(temp, { steps: [{ logged_date: '2026-02-02', steps: 500 }] })
    await admin.rpc('dismiss_device_row', {
      p_user_id: owner.id, p_connection_id: temp, p_metric: 'cardio', p_dedupe_key: 'x-1',
    })

    await admin.from('device_connections').delete().eq('id', temp)

    const { data: prefs } = await admin.from('device_metric_preferences').select('*').eq('connection_id', temp)
    const { data: tombs } = await admin.from('device_dismissals').select('*').eq('connection_id', temp)
    expect(prefs ?? []).toHaveLength(0)
    expect(tombs ?? []).toHaveLength(0)
  })

  it('deleting a connection does NOT delete the health history it imported', async () => {
    // Disconnecting is not erasing. ON DELETE SET NULL, not CASCADE.
    const { data } = await admin.from('steps_log').select('steps, source_connection_id')
      .eq('user_id', owner.id).eq('logged_date', '2026-02-02')
    expect(data).toHaveLength(1)
    expect(data[0].steps).toBe(500)
    expect(data[0].source_connection_id).toBeNull()
  })
})
