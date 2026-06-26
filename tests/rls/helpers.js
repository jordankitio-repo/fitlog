// Test helpers for RLS isolation tests.
//
// Two kinds of Supabase client:
//   - `admin`  : service-role key, BYPASSES RLS. Used only to seed + clean up.
//   - per-user : anon key + a real signed-in session, so PostgREST attaches the
//                user's JWT and RLS is evaluated AS THAT USER — exactly like the app.
//
// RLS semantics we assert against:
//   - A forbidden SELECT returns an empty array, NOT an error (RLS filters rows).
//   - A forbidden INSERT/UPDATE returns an error (violates WITH CHECK / USING).
import { createClient } from '@supabase/supabase-js'
import { localEnv } from './env.js'

const { url, anonKey, serviceKey } = localEnv()

export const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'Test-Passw0rd!1'
export const today = new Date().toISOString().slice(0, 10)

// Create an auth user + matching profile row, and return a client already
// signed in as them (its requests run under that user's RLS context).
export async function makeUser(role, label) {
  const email = `rls.${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.test`
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  })
  if (error) throw new Error(`createUser(${label}): ${error.message}`)
  const id = data.user.id

  const { error: pErr } = await admin.from('profiles').upsert({ id, email, full_name: label, role })
  if (pErr) throw new Error(`seed profile(${label}): ${pErr.message}`)

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: sErr } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (sErr) throw new Error(`signIn(${label}): ${sErr.message}`)

  return { id, email, role, label, client }
}

export async function relate(coachId, clientId, status = 'active') {
  const { error } = await admin.from('coach_clients').insert({ coach_id: coachId, client_id: clientId, status })
  if (error) throw new Error(`relate(${status}): ${error.message}`)
}

// Seed one row in every per-client data table for the given client id.
export async function seedClientData(clientId, marker) {
  const rows = [
    ['nutrition_log', { user_id: clientId, food: `food-${marker}`, calories: 500, protein: 30, logged_date: today }],
    ['weight_log', { user_id: clientId, weight: 80, unit: 'kg', logged_date: today, weighed_at: '08:00:00' }],
    ['cardio_log', { user_id: clientId, exercise_type: 'run', duration: 30, calories_burned: 300, avg_heart_rate: 140, logged_date: today }],
    ['steps_log', { user_id: clientId, steps: 8000, distance: 6, logged_date: today }],
    ['targets', { user_id: clientId, calories: 2000, protein: 150, cardio_minutes: 120, steps: 10000 }],
    ['check_ins', { client_id: clientId, week_of: today, adherence_rating: 4, notes: `checkin-${marker}` }],
  ]
  for (const [table, row] of rows) {
    const { error } = await admin.from(table).insert(row)
    if (error) throw new Error(`seed ${table}(${marker}): ${error.message}`)
  }
}

export async function cleanupUsers(users) {
  const ids = users.map((u) => u.id)
  // Best-effort: clear rows that may not cascade, then delete the auth users.
  for (const t of [
    'nutrition_log', 'weight_log', 'cardio_log', 'steps_log', 'targets',
    'body_measurements', 'day_complete', 'saved_meal_items', 'saved_meals',
    'notifications', 'rate_limits',
  ]) {
    try { await admin.from(t).delete().in('user_id', ids) } catch { /* noop */ }
  }
  try { await admin.from('checkin_questions').delete().in('coach_id', ids) } catch { /* noop */ }
  for (const t of ['check_ins', 'reports', 'messages', 'coach_notes']) {
    try { await admin.from(t).delete().or(`client_id.in.(${ids.join(',')}),coach_id.in.(${ids.join(',')})`) } catch { /* noop */ }
  }
  try { await admin.from('coach_clients').delete().or(`coach_id.in.(${ids.join(',')}),client_id.in.(${ids.join(',')})`) } catch { /* noop */ }
  try { await admin.from('invitations').delete().in('coach_id', ids) } catch { /* noop */ }
  try { await admin.from('subscriptions').delete().or(`coach_id.in.(${ids.join(',')}),solo_id.in.(${ids.join(',')})`) } catch { /* noop */ }
  for (const u of users) {
    try { await admin.auth.admin.deleteUser(u.id) } catch { /* noop */ }
  }
}

// Convenience: rows a signed-in user can read from `table` filtered to a target id.
export async function readAs(user, table, col, targetId) {
  const { data, error } = await user.client.from(table).select('*').eq(col, targetId)
  return { rows: data ?? [], error }
}
