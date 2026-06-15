// Seed a realistic demo coach roster so the coach dashboard's triage badges +
// roster banner can be seen and demoed. Defaults to the LOCAL Supabase stack.
// Re-runnable (wipes prior demo accounts first). NOT for production.
//
//   SUPA_URL=... SERVICE_KEY=... node scripts/seed-demo-roster.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPA_URL
const serviceKey = process.env.SERVICE_KEY
if (!url || !serviceKey) { console.error('Set SUPA_URL and SERVICE_KEY'); process.exit(1) }
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

const PASSWORD = 'Demo!Passw0rd123'
const COACH_EMAIL = 'demo.coach@gardnr.test'

const dstr = (off) => { const d = new Date(); d.setDate(d.getDate() - off); return d.toISOString().slice(0, 10) }
const weekSunday = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) }

async function delUser(email) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const u = data?.users?.find((x) => x.email === email)
  if (u) await admin.auth.admin.deleteUser(u.id)
}
async function makeUser(email, full_name, role) {
  await delUser(email)
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw new Error(`${email}: ${error.message}`)
  await admin.from('profiles').upsert({ id: data.user.id, email, full_name, role })
  return data.user.id
}

// log = which of the last N days have a nutrition entry; onTarget hits >=90% of
// targets; weak = logs but well under. Designed to span red / yellow / green.
const SPECS = [
  { first: 'Ava',  name: 'Ava — on track',       log: [0, 1, 2, 3, 4, 5, 6], onTarget: true,  targets: true,  checkIn: true },
  { first: 'Ben',  name: 'Ben — on track',       log: [0, 1, 2, 3, 5, 6],     onTarget: true,  targets: true,  checkIn: true },
  { first: 'Cara', name: 'Cara — on track',      log: [0, 1, 2, 4, 5, 6],     onTarget: true,  targets: true,  checkIn: true },
  { first: 'Dan',  name: 'Dan — weak macros',    log: [0, 1, 2, 3, 4, 5, 6], onTarget: false, targets: true,  checkIn: true },
  { first: 'Eve',  name: 'Eve — no check-in',    log: [0, 1, 2, 3, 4],        onTarget: true,  targets: true,  checkIn: false },
  { first: 'Finn', name: 'Finn — no targets set', log: [0, 1, 2, 3],          onTarget: true,  targets: false, checkIn: true },
  { first: 'Gia',  name: 'Gia — 3 days quiet',   log: [3, 4, 5],              onTarget: true,  targets: true,  checkIn: true },
  { first: 'Hugo', name: 'Hugo — 5 days quiet',  log: [5, 6],                 onTarget: true,  targets: true,  checkIn: false },
  { first: 'Iris', name: 'Iris — never logged',  log: [],                     onTarget: true,  targets: true,  checkIn: false },
]

const coachId = await makeUser(COACH_EMAIL, 'Demo Coach', 'coach')
// Active subscription so the coach clears the paywall and reaches the dashboard.
await admin.from('subscriptions').insert({
  coach_id: coachId, status: 'active',
  current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
  stripe_customer_id: 'demo_cus', stripe_subscription_id: 'demo_sub',
})

for (const s of SPECS) {
  const clientId = await makeUser(`demo.${s.first.toLowerCase()}@gardnr.test`, s.name, 'client')
  // connection well in the past + lock cleared, so the spread is driven by the
  // logging/compliance pattern, not the lock grace period.
  await admin.from('coach_clients').insert({
    coach_id: coachId, client_id: clientId, status: 'active',
    created_at: new Date(Date.now() - 20 * 864e5).toISOString(), lock_cleared_at: dstr(0),
  })
  if (s.targets) {
    await admin.from('targets').insert({ user_id: clientId, calories: 2000, protein: 150, cardio_minutes: 120, steps: 10000 })
  }
  for (const off of s.log) {
    await admin.from('nutrition_log').insert({
      user_id: clientId, food: 'Demo meal',
      calories: s.onTarget ? 1950 : 1150, protein: s.onTarget ? 150 : 55, logged_date: dstr(off),
    })
  }
  if (s.checkIn) {
    await admin.from('check_ins').insert({ client_id: clientId, week_of: weekSunday(), adherence_rating: 4, energy_level: 4 })
  }
  console.log('seeded', s.name)
}

console.log(`\nDemo coach: ${COACH_EMAIL}  /  password: ${PASSWORD}`)
