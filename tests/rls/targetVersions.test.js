// Target history (20261101000000_target_versions). A past day is graded against
// the plan in force that day, so the history has to be written by the database
// alone, be impossible to backdate, and be readable only by the people who can
// read the targets themselves.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, relate, cleanupUsers, today } from './helpers.js'

let coach, client, solo, exCoach, stranger
const all = []

const versionsOf = async (uid) => {
  const { data, error } = await admin.from('target_versions')
    .select('effective_date, calories, protein, set_by')
    .eq('user_id', uid).order('effective_date')
  if (error) throw error
  return data
}

beforeAll(async () => {
  coach = await makeUser('coach', 'tv-coach')
  exCoach = await makeUser('coach', 'tv-excoach')
  client = await makeUser('client', 'tv-client')
  solo = await makeUser('solo', 'tv-solo')
  stranger = await makeUser('coach', 'tv-stranger')
  all.push(coach, exCoach, client, solo, stranger)
  await relate(coach.id, client.id)
  await relate(exCoach.id, client.id, 'offboarded')
  await admin.from('profiles').update({ onboarded_at: new Date().toISOString() }).in('id', [client.id, solo.id])
}, 60000)

afterAll(async () => { await cleanupUsers(all) })

describe('the trigger writes the history', () => {
  it("a user's first plan reaches back to the beginning", async () => {
    const { error } = await solo.client.from('targets')
      .insert({ user_id: solo.id, calories: 2000, protein: 140, effective_date: today })
    expect(error).toBeNull()
    expect(await versionsOf(solo.id)).toEqual([
      { effective_date: '1970-01-01', calories: 2000, protein: 140, set_by: solo.id },
    ])
  })

  it('a later change starts on the day it was made, and same-day edits collapse', async () => {
    await solo.client.from('targets').update({ calories: 1900, effective_date: today }).eq('user_id', solo.id)
    await solo.client.from('targets').update({ calories: 1800, effective_date: today }).eq('user_id', solo.id)
    const v = await versionsOf(solo.id)
    expect(v).toHaveLength(2)
    expect(v[0]).toMatchObject({ effective_date: '1970-01-01', calories: 2000 })
    expect(v[1]).toMatchObject({ effective_date: today, calories: 1800, protein: 140 })
  })

  it('an edit that changes no graded field records nothing', async () => {
    const before = await versionsOf(solo.id)
    await solo.client.from('targets').update({ weight_goal: 70, effective_date: '2020-01-01' }).eq('user_id', solo.id)
    expect(await versionsOf(solo.id)).toEqual(before)
  })

  it('a backdated effective date is clamped to today, never written into the past', async () => {
    const { error } = await solo.client.from('targets')
      .update({ calories: 1700, effective_date: '2026-01-01' }).eq('user_id', solo.id)
    expect(error).toBeNull()
    const v = await versionsOf(solo.id)
    expect(v.map((r) => r.effective_date)).toEqual(['1970-01-01', today])
    expect(v[1].calories).toBe(1700)
  })

  it("the coach's change is recorded with the coach as setter", async () => {
    await admin.from('targets').insert({ user_id: client.id, calories: 2200 })
    const { error } = await coach.client.from('targets')
      .update({ calories: 2000, effective_date: today }).eq('user_id', client.id)
    expect(error).toBeNull()
    const v = await versionsOf(client.id)
    expect(v[v.length - 1]).toMatchObject({ effective_date: today, calories: 2000, set_by: coach.id })
  })

  it("a locked client's refused write leaves no version", async () => {
    const before = await versionsOf(client.id)
    await client.client.from('targets').update({ calories: 3333, effective_date: today }).eq('user_id', client.id)
    expect(await versionsOf(client.id)).toEqual(before)
  })
})

describe('nobody writes the history directly', () => {
  it('a user cannot insert, update or delete their own versions', async () => {
    const { error: insErr } = await solo.client.from('target_versions')
      .insert({ user_id: solo.id, effective_date: '2025-01-01', calories: 1 })
    expect(insErr).not.toBeNull()
    await solo.client.from('target_versions').update({ calories: 1 }).eq('user_id', solo.id)
    await solo.client.from('target_versions').delete().eq('user_id', solo.id)
    const v = await versionsOf(solo.id)
    expect(v).toHaveLength(2)
    expect(v.every((r) => r.calories !== 1)).toBe(true)
  })

  it('a coach cannot rewrite their client\'s versions', async () => {
    const before = await versionsOf(client.id)
    await coach.client.from('target_versions').update({ calories: 1 }).eq('user_id', client.id)
    await coach.client.from('target_versions').delete().eq('user_id', client.id)
    expect(await versionsOf(client.id)).toEqual(before)
  })
})

describe('who can read it', () => {
  it('the owner', async () => {
    const { data } = await client.client.from('target_versions').select('id').eq('user_id', client.id)
    expect((data ?? []).length).toBeGreaterThan(0)
  })
  it('the active coach', async () => {
    const { data } = await coach.client.from('target_versions').select('id').eq('user_id', client.id)
    expect((data ?? []).length).toBeGreaterThan(0)
  })
  it('NOT an offboarded coach', async () => {
    const { data } = await exCoach.client.from('target_versions').select('id').eq('user_id', client.id)
    expect(data ?? []).toHaveLength(0)
  })
  it('NOT an unrelated coach', async () => {
    const { data } = await stranger.client.from('target_versions').select('id').eq('user_id', solo.id)
    expect(data ?? []).toHaveLength(0)
  })
})
