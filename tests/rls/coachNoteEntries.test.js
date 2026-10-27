// Private notes as rows (20261026040000_coach_note_entries.sql): the coach's
// own, written only about a client they coach now, never visible to anyone else.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { makeUser, relate, cleanupUsers } from './helpers.js'

let coach, client, otherCoach, otherClient, noteId
const all = []

beforeAll(async () => {
  coach = await makeUser('coach', 'cn-coach')
  client = await makeUser('client', 'cn-client')
  otherCoach = await makeUser('coach', 'cn-other')
  otherClient = await makeUser('client', 'cn-other-client')
  all.push(coach, client, otherCoach, otherClient)
  await relate(coach.id, client.id)
  await relate(otherCoach.id, otherClient.id)
}, 60000)

afterAll(async () => { await cleanupUsers(all) })

describe('coach note entries', () => {
  it('the coach adds a note about their client', async () => {
    const { data, error } = await coach.client.from('coach_note_entries').insert({ coach_id: coach.id, client_id: client.id, body: 'Travelling Tue-Thu.' }).select('id').single()
    expect(error).toBeNull()
    noteId = data.id
  })
  it('two adds never overwrite each other', async () => {
    await Promise.all([
      coach.client.from('coach_note_entries').insert({ coach_id: coach.id, client_id: client.id, body: 'From the laptop' }),
      coach.client.from('coach_note_entries').insert({ coach_id: coach.id, client_id: client.id, body: 'From the phone' }),
    ])
    const { data } = await coach.client.from('coach_note_entries').select('body').eq('client_id', client.id)
    expect(data.map(d => d.body).sort()).toEqual(['From the laptop', 'From the phone', 'Travelling Tue-Thu.'])
  })
  it('a coach cannot write a note about someone else\'s client', async () => {
    const { error } = await coach.client.from('coach_note_entries').insert({ coach_id: coach.id, client_id: otherClient.id, body: 'x' })
    expect(error).not.toBeNull()
  })
  it('a note over 5,000 characters is refused', async () => {
    const { error } = await coach.client.from('coach_note_entries').insert({ coach_id: coach.id, client_id: client.id, body: 'a'.repeat(5001) })
    expect(error).not.toBeNull()
  })
  it('the client and other coaches see nothing', async () => {
    for (const u of [client, otherCoach]) {
      const { data } = await u.client.from('coach_note_entries').select('id').eq('client_id', client.id)
      expect(data ?? []).toHaveLength(0)
    }
  })
  it('another coach cannot edit or delete the note', async () => {
    await otherCoach.client.from('coach_note_entries').update({ body: 'hijack' }).eq('id', noteId)
    await otherCoach.client.from('coach_note_entries').delete().eq('id', noteId)
    const { data } = await coach.client.from('coach_note_entries').select('body').eq('id', noteId).single()
    expect(data.body).toBe('Travelling Tue-Thu.')
  })
  it('the coach edits and deletes their own note', async () => {
    const u = await coach.client.from('coach_note_entries').update({ body: 'Travelling Wed-Fri.', updated_at: new Date().toISOString() }).eq('id', noteId)
    expect(u.error).toBeNull()
    const d = await coach.client.from('coach_note_entries').delete().eq('id', noteId)
    expect(d.error).toBeNull()
    const { data } = await coach.client.from('coach_note_entries').select('id').eq('id', noteId)
    expect(data).toHaveLength(0)
  })
  it('the coach flags a note; another coach cannot', async () => {
    const { data } = await coach.client.from('coach_note_entries').insert({ coach_id: coach.id, client_id: client.id, body: 'Left knee injury' }).select('id').single()
    await otherCoach.client.from('coach_note_entries').update({ flagged: true }).eq('id', data.id)
    let row = (await coach.client.from('coach_note_entries').select('flagged').eq('id', data.id).single()).data
    expect(row.flagged).toBe(false)
    await coach.client.from('coach_note_entries').update({ flagged: true }).eq('id', data.id)
    row = (await coach.client.from('coach_note_entries').select('flagged').eq('id', data.id).single()).data
    expect(row.flagged).toBe(true)
  })
  it('undo puts a deleted note back with its own id and date', async () => {
    const created_at = '2026-09-01T09:00:00.000Z'
    const { data } = await coach.client.from('coach_note_entries').insert({ coach_id: coach.id, client_id: client.id, body: 'Undo me', created_at }).select('id').single()
    await coach.client.from('coach_note_entries').delete().eq('id', data.id)
    const { error } = await coach.client.from('coach_note_entries').insert({ id: data.id, coach_id: coach.id, client_id: client.id, body: 'Undo me', created_at, flagged: false })
    expect(error).toBeNull()
    const back = (await coach.client.from('coach_note_entries').select('created_at').eq('id', data.id).single()).data
    expect(new Date(back.created_at).toISOString()).toBe(created_at)
  })
})
