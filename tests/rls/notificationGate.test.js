// The preference gate as a SENDER actually sees it.
//
// notificationPrefs.test.js proves the SQL function decides correctly. What it
// cannot show is that any sender asks it — a perfectly correct gate nobody
// calls mutes nothing, and that failure is invisible: the toggle saves, the
// screen looks right, and the mail keeps arriving.
//
// This runs against `notify-report` over HTTP, and it needs no Resend key to
// do it. The gate is placed BEFORE each sender reads RESEND_API_KEY, so on a
// local stack with no key the two answers are cleanly different:
//
//   opted OUT -> 200 { success: true, emailed: false }   (returned at the gate)
//   opted IN  -> 500 RESEND_API_KEY is not configured    (ran past the gate)
//
// The second case is the load-bearing one. Asserting only the opt-out would
// pass just as well against a function that refused to send to everybody.
//
// Requires edge-runtime (see redeemInviteFn.test.js for the EXCLUDES override);
// skips otherwise.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { admin, makeUser, relate, cleanupUsers } from './helpers.js'
import { localEnv } from './env.js'

const { url, anonKey } = localEnv()
const FUNCTIONS_URL = `${url}/functions/v1`

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

// 400, not 401: sending `apikey` makes the gateway inject an Authorization
// header, so notify-report gets past its auth check and refuses the empty body
// instead. Either way the point is that the FUNCTION answered rather than the
// runtime being absent, which is a 404.
async function edgeRuntimeUp() {
  try {
    const res = await fetch(`${FUNCTIONS_URL}/notify-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({}),
    })
    return res.status === 400 || res.status === 401
  } catch {
    return false
  }
}

const serving = await edgeRuntimeUp()

const tokenOf = async (user) => (await user.client.auth.getSession()).data.session.access_token

describe.skipIf(!serving)('notify-report honours the email preference', () => {
  let coach, client
  const created = []

  beforeAll(async () => {
    coach = await makeUser('coach', 'gateCoach')
    client = await makeUser('client', 'gateClient')
    created.push(coach, client)
    await relate(coach.id, client.id)
  })

  afterAll(async () => {
    await admin.from('notification_preferences').delete().in('user_id', created.map((u) => u.id))
    await cleanupUsers(created)
  })

  const send = async () =>
    callFn('notify-report', {
      token: await tokenOf(coach),
      body: { clientId: client.id, weekOf: '2026-10-12' },
    })

  it('runs past the gate when the client has no preference row', async () => {
    const { status, body } = await send()
    expect(status).toBe(500)
    expect(body.error).toMatch(/RESEND_API_KEY/)
  })

  it('stops at the gate when the client opted out of reports', async () => {
    await admin.from('notification_preferences')
      .upsert({ user_id: client.id, email: { report: false } }, { onConflict: 'user_id' })

    const { status, body } = await send()
    expect(status).toBe(200)
    expect(body).toEqual({ success: true, emailed: false })
  })

  // Muting one category must not mute the rest. A gate that read the row rather
  // than the key would pass the test above and fail this one.
  it('still runs past the gate for a category the client left alone', async () => {
    await admin.from('notification_preferences')
      .upsert({ user_id: client.id, email: { nudge: false } }, { onConflict: 'user_id' })

    const { status, body } = await send()
    expect(status).toBe(500)
    expect(body.error).toMatch(/RESEND_API_KEY/)
  })

  // The preference belongs to the RECIPIENT, not the caller. A coach muting
  // their own mail must not silence the reports they send to clients.
  it('reads the recipient preference, not the sender one', async () => {
    await admin.from('notification_preferences').delete().eq('user_id', client.id)
    await admin.from('notification_preferences')
      .upsert({ user_id: coach.id, email: { report: false } }, { onConflict: 'user_id' })

    const { status, body } = await send()
    expect(status).toBe(500)
    expect(body.error).toMatch(/RESEND_API_KEY/)
  })
})

// nudge-client is the one sender where the email is not the whole event. The
// coach's nudge also writes `last_nudged_at`, which drives the client's in-app
// nudge notice and the coach's own 'already nudged' cooldown on the roster.
// Gating the write along with the mail would make a muted client look
// un-nudged to their coach and re-nudgeable forever, and nothing on either
// screen would look broken.
describe.skipIf(!serving)('nudge-client keeps its side effect when the email is muted', () => {
  let coach, client
  const created = []

  beforeAll(async () => {
    coach = await makeUser('coach', 'nudgeCoach')
    client = await makeUser('client', 'nudgeClient')
    created.push(coach, client)
    await relate(coach.id, client.id)
    await admin.from('notification_preferences')
      .upsert({ user_id: client.id, email: { nudge: false } }, { onConflict: 'user_id' })
  })

  afterAll(async () => {
    await admin.from('notification_preferences').delete().in('user_id', created.map((u) => u.id))
    await cleanupUsers(created)
  })

  it('reports success, sends nothing, and still records the nudge', async () => {
    const { status, body } = await callFn('nudge-client', {
      token: await tokenOf(coach),
      body: { clientId: client.id, reason: 'log' },
    })

    expect(status).toBe(200)
    expect(body).toEqual({ success: true, emailed: false })

    const { data } = await admin.from('coach_clients')
      .select('last_nudged_at').eq('coach_id', coach.id).eq('client_id', client.id).single()
    expect(data.last_nudged_at, 'the nudge was not recorded').not.toBeNull()
  })
})
