// Progress photos (20261026030000_progress_photos.sql): the owner and their
// ACTIVE coach can see them; nobody else, and only the owner can write.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, makeUser, relate, cleanupUsers } from './helpers.js'

let coach, client, otherCoach, formerCoach, stranger
const all = []
// A real (tiny) JPEG: the bucket only takes image/jpeg.
const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='), c => c.charCodeAt(0))
const upload = (u, path) => u.client.storage.from('progress-photos').upload(path, new Blob([JPEG], { type: 'image/jpeg' }), { contentType: 'image/jpeg' })
let path

beforeAll(async () => {
  coach = await makeUser('coach', 'pp-coach')
  client = await makeUser('client', 'pp-client')
  otherCoach = await makeUser('coach', 'pp-other')
  formerCoach = await makeUser('coach', 'pp-former')
  stranger = await makeUser('client', 'pp-stranger')
  all.push(coach, client, otherCoach, formerCoach, stranger)
  await relate(coach.id, client.id)
  await relate(formerCoach.id, client.id, 'offboarded')
  path = `${client.id}/t1.jpg`
}, 60000)

afterAll(async () => {
  await admin.storage.from('progress-photos').remove([path, `${client.id}/t2.jpg`])
  await cleanupUsers(all)
})

describe('progress photos', () => {
  it('the client uploads a photo into their own folder and records it', async () => {
    const up = await upload(client, path)
    expect(up.error).toBeNull()
    const { error } = await client.client.from('progress_photos').insert({ user_id: client.id, taken_on: '2026-10-01', pose: 'front', path })
    expect(error).toBeNull()
  })
  it('nobody can upload into someone else\'s folder', async () => {
    const up = await upload(coach, `${client.id}/forged.jpg`)
    expect(up.error).not.toBeNull()
  })
  it('a row cannot point at someone else\'s folder', async () => {
    await upload(client, `${client.id}/t2.jpg`)
    const { error } = await stranger.client.from('progress_photos').insert({ user_id: stranger.id, taken_on: '2026-10-01', pose: 'front', path: `${client.id}/t2.jpg` })
    expect(error).not.toBeNull()
  })
  it('the active coach can see the row and sign the photo', async () => {
    const { data } = await coach.client.from('progress_photos').select('id').eq('user_id', client.id)
    expect(data).toHaveLength(1)
    const { data: s, error } = await coach.client.storage.from('progress-photos').createSignedUrl(path, 60)
    expect(error).toBeNull()
    expect(s?.signedUrl).toBeTruthy()
  })
  it('the coach cannot delete or change them', async () => {
    await coach.client.from('progress_photos').delete().eq('user_id', client.id)
    const { data } = await admin.from('progress_photos').select('id').eq('user_id', client.id)
    expect(data).toHaveLength(1)
    const { data: removed } = await coach.client.storage.from('progress-photos').remove([path])
    expect(removed ?? []).toHaveLength(0)
  })
  for (const [who, get] of [['another coach', () => otherCoach], ['a former coach', () => formerCoach], ['another client', () => stranger]]) {
    it(`${who} sees nothing and cannot sign the photo`, async () => {
      const u = get()
      const { data } = await u.client.from('progress_photos').select('id').eq('user_id', client.id)
      expect(data ?? []).toHaveLength(0)
      const { data: s } = await u.client.storage.from('progress-photos').createSignedUrl(path, 60)
      expect(s?.signedUrl).toBeFalsy()
    })
  }
})
