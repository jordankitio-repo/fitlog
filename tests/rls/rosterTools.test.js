// Roster tools (20261026020000_roster_tools.sql): pausing, groups, the
// automatic-nudge rule, and the two holes closed with
// them (a client rewriting their relationship row; a coach messaging someone
// who is not their client).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, makeUser, relate, cleanupUsers } from './helpers.js'

let coach, client, otherCoach, otherClient
const all = []

beforeAll(async () => {
  coach = await makeUser('coach', 'rt-coach')
  client = await makeUser('client', 'rt-client')
  otherCoach = await makeUser('coach', 'rt-other-coach')
  otherClient = await makeUser('client', 'rt-other-client')
  all.push(coach, client, otherCoach, otherClient)
  await relate(coach.id, client.id)
  await relate(otherCoach.id, otherClient.id)
}, 60000)

afterAll(async () => { await cleanupUsers(all) })

describe('pausing', () => {
  it('the coach can pause and resume their client', async () => {
    const { error } = await coach.client.from('coach_clients')
      .update({ paused_until: '2099-01-01', pause_reason: 'Holiday' }).eq('client_id', client.id)
    expect(error).toBeNull()
    const { error: e2 } = await coach.client.from('coach_clients')
      .update({ paused_until: null, pause_reason: null }).eq('client_id', client.id)
    expect(e2).toBeNull()
  })
  it('the client cannot write their relationship row (lift a lock, end a pause)', async () => {
    const { error } = await client.client.from('coach_clients')
      .update({ lock_cleared_at: new Date().toISOString() }).eq('client_id', client.id)
    expect(error).not.toBeNull()
  })
  it('the client can still read it', async () => {
    const { data } = await client.client.from('coach_clients').select('paused_until').eq('client_id', client.id)
    expect(data).toHaveLength(1)
  })
})

describe('messages', () => {
  it('a coach can message their own client, and the client their coach', async () => {
    const a = await coach.client.from('messages').insert({ coach_id: coach.id, client_id: client.id, sender_id: coach.id, content: 'hi' })
    expect(a.error).toBeNull()
    const b = await client.client.from('messages').insert({ coach_id: coach.id, client_id: client.id, sender_id: client.id, content: 'hey' })
    expect(b.error).toBeNull()
  })
  it('a coach cannot message someone who is not their client', async () => {
    const { error } = await coach.client.from('messages')
      .insert({ coach_id: coach.id, client_id: otherClient.id, sender_id: coach.id, content: 'spam' })
    expect(error).not.toBeNull()
  })
  it('nobody can send as somebody else', async () => {
    const { error } = await client.client.from('messages')
      .insert({ coach_id: coach.id, client_id: client.id, sender_id: coach.id, content: 'forged' })
    expect(error).not.toBeNull()
  })
})

describe('groups', () => {
  let groupId
  it('a coach can create a group and add their client', async () => {
    const { data, error } = await coach.client.from('coach_groups').insert({ coach_id: coach.id, name: 'Online' }).select('id').single()
    expect(error).toBeNull()
    groupId = data.id
    const { error: e2 } = await coach.client.from('coach_group_members').insert({ group_id: groupId, client_id: client.id })
    expect(e2).toBeNull()
  })
  it('a coach cannot add another coach\'s client to their group', async () => {
    const { error } = await coach.client.from('coach_group_members').insert({ group_id: groupId, client_id: otherClient.id })
    expect(error).not.toBeNull()
  })
  it('another coach cannot see or use the group', async () => {
    const { data } = await otherCoach.client.from('coach_groups').select('id').eq('id', groupId)
    expect(data ?? []).toHaveLength(0)
    const { error } = await otherCoach.client.from('coach_group_members').insert({ group_id: groupId, client_id: otherClient.id })
    expect(error).not.toBeNull()
  })
  it('the client cannot see which groups they are in', async () => {
    const { data } = await client.client.from('coach_group_members').select('group_id')
    expect(data ?? []).toHaveLength(0)
  })
  it('group names are unique per coach, ignoring case', async () => {
    const { error } = await coach.client.from('coach_groups').insert({ coach_id: coach.id, name: 'online' })
    expect(error).not.toBeNull()
  })
})

describe('automations', () => {
  it('a coach sets their own rule, within 2 to 14 days', async () => {
    const ok = await coach.client.from('coach_automations').upsert({ coach_id: coach.id, nudge_after_days: 3 })
    expect(ok.error).toBeNull()
    const bad = await coach.client.from('coach_automations').upsert({ coach_id: coach.id, nudge_after_days: 1 })
    expect(bad.error).not.toBeNull()
  })
  it('a coach cannot set another coach\'s rule', async () => {
    const { error } = await coach.client.from('coach_automations').upsert({ coach_id: otherCoach.id, nudge_after_days: 3 })
    expect(error).not.toBeNull()
  })
})
