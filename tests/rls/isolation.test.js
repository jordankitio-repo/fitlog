// RLS tenant-isolation guarantees — these MUST stay green before going public.
//
// Cast of characters (created fresh per run):
//   coachA  ── active ──  clientA1        (tenant A)
//   coachB  ── active ──  clientB1        (tenant B)
//   coachA  ── offboarded ── clientLeft   (former client of A)
//   outsider                              (no relationships)
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, relate, seedClientData, readAs, today } from './helpers.js'

let coachA, clientA1, coachB, clientB1, clientLeft, outsider
let all
let inviteToken

beforeAll(async () => {
  coachA = await makeUser('coach', 'coachA')
  clientA1 = await makeUser('client', 'clientA1')
  coachB = await makeUser('coach', 'coachB')
  clientB1 = await makeUser('client', 'clientB1')
  clientLeft = await makeUser('client', 'clientLeft')
  outsider = await makeUser('solo', 'outsider')
  all = [coachA, clientA1, coachB, clientB1, clientLeft, outsider]

  await relate(coachA.id, clientA1.id, 'active')
  await relate(coachB.id, clientB1.id, 'active')
  await relate(coachA.id, clientLeft.id, 'offboarded')

  await seedClientData(clientA1.id, 'A1')
  await seedClientData(clientB1.id, 'B1')
  await seedClientData(clientLeft.id, 'left')

  // coach-private + relationship rows used by the suites below
  await admin.from('coach_notes').insert({ coach_id: coachA.id, client_id: clientA1.id, content: 'PRIVATE note about A1' })
  await admin.from('messages').insert({ coach_id: coachA.id, client_id: clientA1.id, sender_id: coachA.id, content: 'hello A1' })
  await admin.from('reports').insert({ coach_id: coachA.id, client_id: clientA1.id, content: 'weekly report', week_of: today })
  await admin.from('subscriptions').insert({ coach_id: coachA.id, status: 'active' })
  await admin.from('subscriptions').insert({ coach_id: coachB.id, status: 'active' })

  const { data: inv } = await admin.from('invitations')
    .insert({ coach_id: coachA.id, client_email: 'invitee@example.test' }).select().single()
  inviteToken = inv.token

  const { data: sm } = await admin.from('saved_meals')
    .insert({ user_id: clientA1.id, name: 'A1 usual breakfast' }).select('id').single()
  await admin.from('saved_meal_items')
    .insert({ saved_meal_id: sm.id, user_id: clientA1.id, food: 'Oats', calories: 300, protein: 10 })

  await admin.from('day_complete').insert([
    { user_id: clientA1.id, logged_date: today },
    { user_id: clientLeft.id, logged_date: today },
  ])

  await admin.from('checkin_questions').insert({
    coach_id: coachA.id, prompt: 'How was your sleep?', type: 'rating', config: { max: 10 }, position: 0,
  })

  await admin.from('body_measurements').insert([
    { user_id: clientA1.id, logged_date: today, unit: 'in', chest: 40, waist: 32 },
    { user_id: clientLeft.id, logged_date: today, unit: 'in', waist: 30 },
  ])

  await admin.from('notifications').insert({
    user_id: clientA1.id, type: 'client_left', title: 'A client left', body: 'x', href: '/',
  })
}, 60000)

afterAll(async () => {
  const { cleanupUsers } = await import('./helpers.js')
  await cleanupUsers(all)
})

describe('profiles', () => {
  it('a user can read their own profile', async () => {
    const { rows } = await readAs(clientA1, 'profiles', 'id', clientA1.id)
    expect(rows).toHaveLength(1)
  })
  it('a coach can read their ACTIVE client profile', async () => {
    const { rows } = await readAs(coachA, 'profiles', 'id', clientA1.id)
    expect(rows).toHaveLength(1)
  })
  it('a coach CANNOT read another tenant\'s client profile', async () => {
    const { rows } = await readAs(coachA, 'profiles', 'id', clientB1.id)
    expect(rows).toHaveLength(0)
  })
  it('a coach CANNOT read another coach\'s profile', async () => {
    const { rows } = await readAs(coachA, 'profiles', 'id', coachB.id)
    expect(rows).toHaveLength(0)
  })
  it('an outsider CANNOT read anyone else\'s profile', async () => {
    const { rows } = await readAs(outsider, 'profiles', 'id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('a coach CANNOT read an OFFBOARDED client\'s profile (active-only)', async () => {
    const { rows } = await readAs(coachA, 'profiles', 'id', clientLeft.id)
    expect(rows).toHaveLength(0)
  })
})

describe.each(['nutrition_log', 'weight_log', 'cardio_log', 'steps_log', 'targets'])('%s', (table) => {
  it('a client can read their own rows', async () => {
    const { rows } = await readAs(clientA1, table, 'user_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('the active coach can read their client\'s rows', async () => {
    const { rows } = await readAs(coachA, table, 'user_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('a coach from another tenant CANNOT read these rows', async () => {
    const { rows } = await readAs(coachB, table, 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('an unrelated client CANNOT read these rows', async () => {
    const { rows } = await readAs(clientB1, table, 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('an outsider CANNOT read these rows', async () => {
    const { rows } = await readAs(outsider, table, 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('a coach CANNOT read an OFFBOARDED client\'s rows (active-only)', async () => {
    const { rows } = await readAs(coachA, table, 'user_id', clientLeft.id)
    expect(rows).toHaveLength(0)
  })
})

describe('write isolation', () => {
  it('a client CANNOT insert a nutrition row owned by someone else', async () => {
    const { error } = await clientB1.client.from('nutrition_log')
      .insert({ user_id: clientA1.id, food: 'spoof', calories: 1, logged_date: today })
    expect(error).not.toBeNull()
  })
  it('a client CAN insert their own nutrition row', async () => {
    const { error } = await clientA1.client.from('nutrition_log')
      .insert({ user_id: clientA1.id, food: 'legit', calories: 1, logged_date: today })
    expect(error).toBeNull()
  })
  it('a coach CANNOT overwrite another tenant client\'s weight row', async () => {
    const { data } = await coachA.client.from('weight_log')
      .update({ weight: 999 }).eq('user_id', clientB1.id).select()
    expect(data ?? []).toHaveLength(0) // no rows visible -> nothing updated
  })
})

describe('coach_notes (private to coach)', () => {
  it('the coach can read their own notes', async () => {
    const { rows } = await readAs(coachA, 'coach_notes', 'client_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('the CLIENT cannot read coach notes written about them', async () => {
    const { rows } = await readAs(clientA1, 'coach_notes', 'client_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('another coach cannot read these notes', async () => {
    const { rows } = await readAs(coachB, 'coach_notes', 'client_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
})

describe('messages', () => {
  it('the client in the thread can read it', async () => {
    const { rows } = await readAs(clientA1, 'messages', 'client_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('a non-participant coach cannot read the thread', async () => {
    const { rows } = await readAs(coachB, 'messages', 'client_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('an outsider cannot read the thread', async () => {
    const { rows } = await readAs(outsider, 'messages', 'client_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
})

describe('subscriptions (billing)', () => {
  it('a coach can read their own subscription', async () => {
    const { rows } = await readAs(coachA, 'subscriptions', 'coach_id', coachA.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('a coach CANNOT read another coach\'s subscription', async () => {
    const { rows } = await readAs(coachA, 'subscriptions', 'coach_id', coachB.id)
    expect(rows).toHaveLength(0)
  })
  it('an authenticated user CANNOT insert a subscription (service-role only)', async () => {
    const { error } = await coachA.client.from('subscriptions').insert({ coach_id: coachA.id, status: 'active' })
    expect(error).not.toBeNull()
  })
})

describe('trial_ledger (abuse prevention, default-deny)', () => {
  it('an authenticated user CANNOT read the trial ledger at all', async () => {
    await admin.from('trial_ledger').upsert({ email_hash: `hash-${Date.now()}`, coach_trial_used: true })
    const { rows } = await readAs(outsider, 'trial_ledger', 'coach_trial_used', true)
    expect(rows).toHaveLength(0)
  })
})

describe('coach_clients (relationship rows)', () => {
  it('a client can see their own relationship', async () => {
    const { rows } = await readAs(clientA1, 'coach_clients', 'client_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('an outsider cannot see someone else\'s relationship', async () => {
    const { rows } = await readAs(outsider, 'coach_clients', 'client_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
})

describe('day_complete (owner + active-coach read)', () => {
  it('the owner can read their own day-complete marks', async () => {
    const { rows } = await readAs(clientA1, 'day_complete', 'user_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('the active coach can read their client\'s marks', async () => {
    const { rows } = await readAs(coachA, 'day_complete', 'user_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('another tenant\'s coach CANNOT read them', async () => {
    const { rows } = await readAs(coachB, 'day_complete', 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('an unrelated client CANNOT read them', async () => {
    const { rows } = await readAs(clientB1, 'day_complete', 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('a coach CANNOT read an OFFBOARDED client\'s marks (active-only)', async () => {
    const { rows } = await readAs(coachA, 'day_complete', 'user_id', clientLeft.id)
    expect(rows).toHaveLength(0)
  })
})

describe('check-in review (coach-only, via RPC)', () => {
  let checkInId
  beforeAll(async () => {
    const { data } = await admin.from('check_ins').select('id').eq('client_id', clientA1.id).limit(1).single()
    checkInId = data.id
  })

  it('the active coach can review via review_checkin RPC', async () => {
    const { error } = await coachA.client.rpc('review_checkin', { p_id: checkInId, p_comment: 'great week' })
    expect(error).toBeNull()
    const { data } = await admin.from('check_ins').select('reviewed_at, coach_comment').eq('id', checkInId).single()
    expect(data.reviewed_at).not.toBeNull()
    expect(data.coach_comment).toBe('great week')
  })

  it('a client CANNOT set reviewed_at on their own check-in directly (guard trigger)', async () => {
    const { error } = await clientA1.client.from('check_ins')
      .update({ reviewed_at: new Date().toISOString(), coach_comment: 'self-review' }).eq('id', checkInId)
    expect(error).not.toBeNull()
  })

  it('a coach from another tenant CANNOT review it (RPC no-op)', async () => {
    await admin.from('check_ins').update({ reviewed_at: null, coach_comment: null }).eq('id', checkInId)
    const { error } = await coachB.client.rpc('review_checkin', { p_id: checkInId, p_comment: 'sneaky' })
    expect(error).toBeNull() // RPC returns void
    const { data } = await admin.from('check_ins').select('reviewed_at').eq('id', checkInId).single()
    expect(data.reviewed_at).toBeNull() // but the active-coach guard matched nothing
  })
})

describe('saved_meals (owner-only, private)', () => {
  it('the owner can read their saved meals + items', async () => {
    const { rows } = await readAs(clientA1, 'saved_meals', 'user_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
    const { rows: items } = await readAs(clientA1, 'saved_meal_items', 'user_id', clientA1.id)
    expect(items.length).toBeGreaterThan(0)
  })
  it('another user CANNOT read them', async () => {
    const { rows } = await readAs(clientB1, 'saved_meals', 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
    const { rows: items } = await readAs(clientB1, 'saved_meal_items', 'user_id', clientA1.id)
    expect(items).toHaveLength(0)
  })
  it('even the coach CANNOT read a client\'s saved meals (personal, not coaching data)', async () => {
    const { rows } = await readAs(coachA, 'saved_meals', 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
})

describe('checkin_questions (coach-owned, active client read)', () => {
  it('the owning coach can read their own questions', async () => {
    const { rows } = await readAs(coachA, 'checkin_questions', 'coach_id', coachA.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('the active client can read their coach\'s questions (to render the form)', async () => {
    const { rows } = await readAs(clientA1, 'checkin_questions', 'coach_id', coachA.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('another tenant\'s client CANNOT read them', async () => {
    const { rows } = await readAs(clientB1, 'checkin_questions', 'coach_id', coachA.id)
    expect(rows).toHaveLength(0)
  })
  it('an OFFBOARDED client CANNOT read them (active-only)', async () => {
    const { rows } = await readAs(clientLeft, 'checkin_questions', 'coach_id', coachA.id)
    expect(rows).toHaveLength(0)
  })
  it('another coach CANNOT read them', async () => {
    const { rows } = await readAs(coachB, 'checkin_questions', 'coach_id', coachA.id)
    expect(rows).toHaveLength(0)
  })
  it('the owning coach can insert their own question', async () => {
    const { error } = await coachA.client.from('checkin_questions')
      .insert({ coach_id: coachA.id, prompt: 'Energy?', type: 'rating', config: { max: 10 }, position: 1 })
    expect(error).toBeNull()
  })
  it('a coach CANNOT create a question owned by another coach', async () => {
    const { error } = await coachB.client.from('checkin_questions')
      .insert({ coach_id: coachA.id, prompt: 'sneaky', type: 'text', position: 9 })
    expect(error).not.toBeNull()
  })
  it('a client CANNOT write questions', async () => {
    const { error } = await clientA1.client.from('checkin_questions')
      .insert({ coach_id: coachA.id, prompt: 'client-made', type: 'text', position: 9 })
    expect(error).not.toBeNull()
  })
})

describe('invitations (token-gated, not enumerable)', () => {
  it('an unrelated user CANNOT enumerate the invitations table', async () => {
    const { data } = await outsider.client.from('invitations').select('*')
    expect(data ?? []).toHaveLength(0)
  })
  it('a coach can read their own invitations', async () => {
    const { rows } = await readAs(coachA, 'invitations', 'coach_id', coachA.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('the secret token unlocks exactly that invite via the RPC', async () => {
    const { data } = await outsider.client
      .rpc('get_invitation_by_token', { p_token: inviteToken }).maybeSingle()
    expect(data?.client_email).toBe('invitee@example.test')
    expect(data?.coach_id).toBe(coachA.id)
  })
  it('an unknown token returns nothing via the RPC', async () => {
    const { data } = await outsider.client
      .rpc('get_invitation_by_token', { p_token: '00000000-0000-0000-0000-000000000000' }).maybeSingle()
    expect(data).toBeNull()
  })
})

describe('body_measurements (owner + active-coach read)', () => {
  it('the owner can read their own measurements', async () => {
    const { rows } = await readAs(clientA1, 'body_measurements', 'user_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('the active coach can read their client\'s measurements', async () => {
    const { rows } = await readAs(coachA, 'body_measurements', 'user_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('another tenant\'s coach CANNOT read them', async () => {
    const { rows } = await readAs(coachB, 'body_measurements', 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('an unrelated client CANNOT read them', async () => {
    const { rows } = await readAs(clientB1, 'body_measurements', 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('a coach CANNOT read an OFFBOARDED client\'s measurements (active-only)', async () => {
    const { rows } = await readAs(coachA, 'body_measurements', 'user_id', clientLeft.id)
    expect(rows).toHaveLength(0)
  })
  it('the owner can write their own measurements', async () => {
    const { error } = await clientA1.client.from('body_measurements')
      .insert({ user_id: clientA1.id, logged_date: '2025-01-01', unit: 'in', hips: 38 })
    expect(error).toBeNull()
  })
  it('a user CANNOT write measurements owned by someone else', async () => {
    const { error } = await clientB1.client.from('body_measurements')
      .insert({ user_id: clientA1.id, logged_date: '2020-01-01', unit: 'in', waist: 99 })
    expect(error).not.toBeNull()
  })
})

describe('notifications (own read/update; service-role insert only)', () => {
  it('the recipient can read their own notifications', async () => {
    const { rows } = await readAs(clientA1, 'notifications', 'user_id', clientA1.id)
    expect(rows.length).toBeGreaterThan(0)
  })
  it('another user CANNOT read them', async () => {
    const { rows } = await readAs(clientB1, 'notifications', 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('even the active coach CANNOT read a client\'s notifications', async () => {
    const { rows } = await readAs(coachA, 'notifications', 'user_id', clientA1.id)
    expect(rows).toHaveLength(0)
  })
  it('an authenticated user CANNOT insert a notification (service-role only)', async () => {
    const { error } = await clientA1.client.from('notifications')
      .insert({ user_id: clientA1.id, type: 'spoof', title: 'x', body: 'y', href: '/' })
    expect(error).not.toBeNull()
  })
  it('the recipient CAN mark their own notification read', async () => {
    const { data: n } = await admin.from('notifications').select('id').eq('user_id', clientA1.id).limit(1).single()
    const { error } = await clientA1.client.from('notifications')
      .update({ read_at: new Date().toISOString() }).eq('id', n.id)
    expect(error).toBeNull()
  })
})

describe('rate_limits + check_rate_limit (cost-abuse control)', () => {
  it('an authenticated user CANNOT read the rate_limits table', async () => {
    await admin.from('rate_limits')
      .upsert({ user_id: clientA1.id, bucket: 'probe', window_start: new Date().toISOString(), count: 1 })
    const { rows } = await readAs(outsider, 'rate_limits', 'bucket', 'probe')
    expect(rows).toHaveLength(0)
  })
  it('check_rate_limit allows up to the limit, then denies (fixed window)', async () => {
    const bucket = `rl-${Date.now()}`
    const call = () => admin.rpc('check_rate_limit', { p_user_id: clientB1.id, p_bucket: bucket, p_limit: 2, p_window_seconds: 3600 })
    expect((await call()).data).toBe(true)
    expect((await call()).data).toBe(true)
    expect((await call()).data).toBe(false)
  })
  it('an authenticated user CANNOT call check_rate_limit directly (service-role only)', async () => {
    const { error } = await clientA1.client
      .rpc('check_rate_limit', { p_user_id: clientA1.id, p_bucket: 'x', p_limit: 1, p_window_seconds: 60 })
    expect(error).not.toBeNull()
  })
})

// Erasure contract: every personal-data table delete-account clears must be
// seedable + deletable by service_role for a user. (The prod-specific grant gap
// that made some of these silently no-op was fixed in 20260624120000.)
describe('erasure contract (service_role clears every personal-data table)', () => {
  const SEEDS = {
    nutrition_log: { food: 'x', calories: 1, logged_date: today },
    weight_log: { weight: 80, unit: 'kg', logged_date: today, weighed_at: '08:00:00' },
    cardio_log: { exercise_type: 'run', duration: 30, logged_date: today },
    steps_log: { steps: 8000, logged_date: today },
    body_measurements: { logged_date: today, unit: 'in', waist: 30 },
    targets: { calories: 2000 },
    saved_meals: { name: 'usual breakfast' },
    day_complete: { logged_date: today },
    notifications: { type: 't', title: 't', body: 'b', href: '/' },
  }
  it.each(Object.keys(SEEDS))('service_role can seed + delete %s', async (table) => {
    const probe = await makeUser('solo', `erase-${table}`)
    all.push(probe)
    const { error: insErr } = await admin.from(table).insert({ user_id: probe.id, ...SEEDS[table] })
    expect(insErr).toBeNull()
    const { error: delErr } = await admin.from(table).delete().eq('user_id', probe.id)
    expect(delErr).toBeNull()
    const { data } = await admin.from(table).select('*').eq('user_id', probe.id)
    expect(data ?? []).toHaveLength(0)
  })
})
