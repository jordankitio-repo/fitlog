// A coached client's targets and goal belong to the coach
// (20261026010000_coach_owned_targets). The screens already said so; before
// that migration the database let the client PATCH both with their own session.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, relate, cleanupUsers } from './helpers.js'

let coach, coached, settingUp, solo
const all = []

beforeAll(async () => {
  coach = await makeUser('coach', 'cot-coach')
  coached = await makeUser('client', 'cot-coached')
  settingUp = await makeUser('client', 'cot-setup')
  solo = await makeUser('solo', 'cot-solo')
  all.push(coach, coached, settingUp, solo)
  await relate(coach.id, coached.id)
  await relate(coach.id, settingUp.id)
  // Finished setup / still in it.
  await admin.from('profiles').update({ onboarded_at: new Date().toISOString(), primary_goal: 'lose' }).eq('id', coached.id)
  await admin.from('profiles').update({ onboarded_at: null }).eq('id', settingUp.id)
  await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', solo.id)
  await admin.from('targets').insert({ user_id: coached.id, calories: 2000 })
  await admin.from('targets').insert({ user_id: solo.id, calories: 2000 })
}, 60000)

afterAll(async () => { await cleanupUsers(all) })

describe('a coached client after setup', () => {
  it('can read their targets', async () => {
    const { data } = await coached.client.from('targets').select('calories').eq('user_id', coached.id)
    expect(data).toHaveLength(1)
  })
  it('CANNOT change them', async () => {
    const { data } = await coached.client.from('targets').update({ calories: 3333 }).eq('user_id', coached.id).select()
    expect(data ?? []).toHaveLength(0)
    const { data: row } = await admin.from('targets').select('calories').eq('user_id', coached.id).single()
    expect(row.calories).toBe(2000)
  })
  it('CANNOT delete them', async () => {
    await coached.client.from('targets').delete().eq('user_id', coached.id)
    const { data } = await admin.from('targets').select('user_id').eq('user_id', coached.id)
    expect(data).toHaveLength(1)
  })
  it('CANNOT change their primary goal', async () => {
    const { error } = await coached.client.from('profiles').update({ primary_goal: 'gain' }).eq('id', coached.id)
    expect(error).not.toBeNull()
  })
  it('CAN still change the rest of their profile', async () => {
    const { error } = await coached.client.from('profiles').update({ full_name: 'Renamed' }).eq('id', coached.id)
    expect(error).toBeNull()
  })
})

describe('their coach', () => {
  it('can change the targets, and is recorded as the writer', async () => {
    const { data } = await coach.client.from('targets').update({ calories: 1800 }).eq('user_id', coached.id).select('calories, updated_by')
    expect(data).toEqual([{ calories: 1800, updated_by: coach.id }])
  })
  it('can set the goal through set_client_primary_goal', async () => {
    const { error } = await coach.client.rpc('set_client_primary_goal', { p_client_id: coached.id, p_goal: 'recomp' })
    expect(error).toBeNull()
  })
})

describe('a coached client still in setup', () => {
  it('can write their starting targets and goal', async () => {
    const { error } = await settingUp.client.from('targets').insert({ user_id: settingUp.id, calories: 2100 })
    expect(error).toBeNull()
    const { error: gErr } = await settingUp.client.from('profiles').update({ primary_goal: 'lose' }).eq('id', settingUp.id)
    expect(gErr).toBeNull()
  })
})

describe('a solo user', () => {
  it('still owns their targets and goal', async () => {
    const { data } = await solo.client.from('targets').update({ calories: 2400 }).eq('user_id', solo.id).select('calories')
    expect(data).toEqual([{ calories: 2400 }])
    const { error } = await solo.client.from('profiles').update({ primary_goal: 'gain' }).eq('id', solo.id)
    expect(error).toBeNull()
  })
})
