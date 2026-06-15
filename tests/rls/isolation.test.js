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
