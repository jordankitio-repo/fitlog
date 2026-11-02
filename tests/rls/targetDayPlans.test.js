// Day types (20261102000000_target_day_plans). The database guarantees the
// shape of targets.day_plans and versions it with the rest of the plan; who
// may write it is the targets policies' job, unchanged.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, relate, cleanupUsers, today } from './helpers.js'

let coach, client, solo
const all = []
const training = { name: 'Training', days: [1, 3, 5], calories: 2400, carbs: 280 }

const latestVersion = async (uid) => {
  const { data, error } = await admin.from('target_versions')
    .select('effective_date, calories, day_plans').eq('user_id', uid)
    .order('effective_date', { ascending: false }).limit(1).single()
  if (error) throw error
  return data
}

beforeAll(async () => {
  coach = await makeUser('coach', 'dp-coach')
  client = await makeUser('client', 'dp-client')
  solo = await makeUser('solo', 'dp-solo')
  all.push(coach, client, solo)
  await relate(coach.id, client.id)
  await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).in('id', [client.id, solo.id])
  await admin.from('targets').insert({ user_id: solo.id, calories: 2000 })
  await admin.from('targets').insert({ user_id: client.id, calories: 2000 })
}, 60000)

afterAll(async () => { await cleanupUsers(all) })

describe('the shape is enforced', () => {
  it.each([
    ['a weekday in two types', [{ name: 'A', days: [1] }, { name: 'B', days: [1] }]],
    ['three types', [{ name: 'A', days: [1] }, { name: 'B', days: [2] }, { name: 'C', days: [3] }]],
    ['a weekday out of range', [{ name: 'A', days: [7] }]],
    ['no days', [{ name: 'A', days: [] }]],
    ['no name', [{ name: ' ', days: [1] }]],
    ['not an array', { name: 'A', days: [1] }],
  ])('rejects %s', async (_, plans) => {
    const { error } = await solo.client.from('targets').update({ day_plans: plans }).eq('user_id', solo.id)
    expect(error).not.toBeNull()
  })
})

describe('versioning', () => {
  it('a day-type change alone is a plan change from today', async () => {
    const { error } = await solo.client.from('targets')
      .update({ day_plans: [training], effective_date: today }).eq('user_id', solo.id)
    expect(error).toBeNull()
    const v = await latestVersion(solo.id)
    expect(v).toMatchObject({ effective_date: today, calories: 2000, day_plans: [training] })
  })
  it('the first plan reaches back with its day types', async () => {
    const fresh = await makeUser('solo', 'dp-fresh')
    all.push(fresh)
    await fresh.client.from('targets').insert({ user_id: fresh.id, calories: 1800, day_plans: [training] })
    expect(await latestVersion(fresh.id)).toMatchObject({ effective_date: '1970-01-01', day_plans: [training] })
  })
})

describe('who writes day types', () => {
  it('a coached client cannot', async () => {
    await client.client.from('targets').update({ day_plans: [training] }).eq('user_id', client.id)
    const { data } = await admin.from('targets').select('day_plans').eq('user_id', client.id).single()
    expect(data.day_plans).toEqual([])
  })
  it('their coach can', async () => {
    const { data, error } = await coach.client.from('targets')
      .update({ day_plans: [training], effective_date: today }).eq('user_id', client.id).select('day_plans')
    expect(error).toBeNull()
    expect(data).toEqual([{ day_plans: [training] }])
  })
})
