// A report is the coach's assessment of the client. The client must be able to
// mark it read and nothing else.
//
// This started as a probe rather than a test: the policy on `reports` is named
// "Clients can update their report read status", and that name describes an
// intent RLS cannot express, because RLS filters ROWS and has no opinion about
// COLUMNS. The probe replaced a coach's report body with the client's own text
// and got no error. The coach's sent list then showed the altered version back
// to them, since both sides read the same row.
//
// The fix is column privileges (20261019120000). These tests exist so the name
// and the behaviour can never drift apart again: the first asserts the capability
// the client is supposed to have, and the rest assert each one it is not.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { admin, makeUser, relate, cleanupUsers } from './helpers.js'

describe('reports: the client may mark read, and nothing else', () => {
  let coach, client, reportId
  const created = []

  beforeAll(async () => {
    coach = await makeUser('coach', 'intCoach')
    client = await makeUser('client', 'intClient')
    created.push(coach, client)
    await relate(coach.id, client.id)
  })

  afterAll(async () => {
    await admin.from('reports').delete().eq('coach_id', coach.id)
    await cleanupUsers(created)
  })

  // Fresh row per test: a blocked UPDATE leaves the row untouched, but a test
  // that depended on the previous one's state would hide a partial write.
  async function seedReport() {
    const { data, error } = await admin.from('reports')
      .insert({
        coach_id: coach.id,
        client_id: client.id,
        subject: 'Week of Oct 12',
        content: 'ORIGINAL assessment, written by the coach.',
        week_of: '2026-10-12',
      })
      .select().single()
    if (error) throw new Error(`seed report: ${error.message}`)
    reportId = data.id
    return data
  }

  it('lets the client mark their own report read', async () => {
    await seedReport()
    const { error } = await client.client.from('reports')
      .update({ read_at: new Date().toISOString() }).eq('id', reportId)
    expect(error).toBeNull()

    const { data } = await admin.from('reports').select('read_at').eq('id', reportId).single()
    expect(data.read_at).not.toBeNull()
  })

  it('refuses to let the client rewrite the report body', async () => {
    const seeded = await seedReport()
    const { error } = await client.client.from('reports')
      .update({ content: 'TAMPERED by the client.' }).eq('id', reportId)
    expect(error, 'the client was allowed to edit a coach report').not.toBeNull()

    const { data } = await admin.from('reports').select('content').eq('id', reportId).single()
    expect(data.content).toBe(seeded.content)
  })

  it('refuses to let the client rewrite the subject or re-date the report', async () => {
    const seeded = await seedReport()
    const subject = await client.client.from('reports')
      .update({ subject: 'Something else' }).eq('id', reportId)
    expect(subject.error).not.toBeNull()

    const week = await client.client.from('reports')
      .update({ week_of: '2020-01-01' }).eq('id', reportId)
    expect(week.error).not.toBeNull()

    const { data } = await admin.from('reports').select('subject, week_of').eq('id', reportId).single()
    expect(data.subject).toBe(seeded.subject)
    expect(data.week_of).toBe(seeded.week_of)
  })

  // The interesting one: a write that pairs the allowed column with a
  // forbidden one. A grant checked per-statement rather than per-column would
  // wave this through on the strength of read_at being present.
  it('refuses a mixed update that smuggles content in beside read_at', async () => {
    const seeded = await seedReport()
    const { error } = await client.client.from('reports')
      .update({ read_at: new Date().toISOString(), content: 'TAMPERED.' })
      .eq('id', reportId)
    expect(error).not.toBeNull()

    const { data } = await admin.from('reports').select('content, read_at').eq('id', reportId).single()
    expect(data.content).toBe(seeded.content)
    expect(data.read_at).toBeNull()
  })

  it("still refuses on another coach's client, for the row reason", async () => {
    await seedReport()
    const stranger = await makeUser('client', 'intStranger')
    created.push(stranger)
    const { error } = await stranger.client.from('reports')
      .update({ read_at: new Date().toISOString() }).eq('id', reportId)
    // RLS filters the row out, so the UPDATE matches nothing rather than
    // erroring. The assertion that matters is that read_at did not move.
    expect(error).toBeNull()
    const { data } = await admin.from('reports').select('read_at').eq('id', reportId).single()
    expect(data.read_at).toBeNull()
  })

  it('still lets a coach send a report', async () => {
    const { error } = await coach.client.from('reports').insert({
      coach_id: coach.id,
      client_id: client.id,
      content: 'A new report, sent after the column grant.',
      week_of: '2026-10-19',
    })
    expect(error, 'the column grant broke sending reports').toBeNull()
  })
})
