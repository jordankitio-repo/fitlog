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

// LOCAL date formatting, never toISOString(). toISOString() converts to UTC, so
// west of Greenwich an evening run rolls every date forward a day: seeded
// check-ins landed on week_of 09-14 while the app (which computes the week
// start locally) looked for 09-13, and every client showed "No check-in"
// despite having one. The app's own toLocalDateString does exactly this.
const local = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dstr = (off) => { const d = new Date(); d.setDate(d.getDate() - off); return local(d) }
const weekSunday = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return local(d) }

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
// `adh`/`nrg` are the check-in's self-reported adherence and energy, and they
// vary per client on purpose. They used to be hardcoded 4 and 4 for everyone,
// which made the roster's two stat columns a wall of identical numbers — and a
// column of identical values cannot show that it is misaligned, which is the
// failure A4 exists to catch. A fixture that cannot distinguish a good score
// from a bad one is not exercising the screen it was built for.
//
// `reviewed` puts a check-in in the ALREADY-REVIEWED state. Without it no
// client ever reached "on track": the strong loggers all carried an unreviewed
// check-in, which outranks a green grade in the triage roll-up, so the roster
// reported `0 on track` and the healthy row was unreachable in the demo.
const SPECS = [
  { first: 'Ava',  name: 'Ava Lindqvist',  log: [0, 1, 2, 3, 4, 5, 6], onTarget: true,  targets: true,  checkIn: true,  adh: 9, nrg: 8, reviewed: true },
  { first: 'Ben',  name: 'Ben Osei',       log: [0, 1, 2, 3, 5, 6],    onTarget: true,  targets: true,  checkIn: true,  adh: 7, nrg: 7 },
  { first: 'Cara', name: 'Cara Whitfield', log: [0, 1, 2, 4, 5, 6],    onTarget: true,  targets: true,  checkIn: true,  adh: 8, nrg: 6 },
  { first: 'Dan',  name: 'Dan Moreau',     log: [0, 1, 2, 3, 4, 5, 6], onTarget: false, targets: true,  checkIn: true,  adh: 3, nrg: 4 },
  { first: 'Eve',  name: 'Eve Nakamura',   log: [0, 1, 2, 3, 4],       onTarget: true,  targets: true,  checkIn: false },
  { first: 'Finn', name: 'Finn Halloran',  log: [0, 1, 2, 3],          onTarget: true,  targets: false, checkIn: true,  adh: 6, nrg: 7 },
  { first: 'Gia',  name: 'Gia Ferrante',   log: [3, 4, 5],             onTarget: true,  targets: true,  checkIn: true,  adh: 5, nrg: 3 },
  { first: 'Hugo', name: 'Hugo Bennett',   log: [5, 6],                onTarget: true,  targets: true,  checkIn: false },
  { first: 'Iris', name: 'Iris Calder',    log: [],                    onTarget: true,  targets: true,  checkIn: false },
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
    await admin.from('check_ins').insert({
      client_id: clientId, week_of: weekSunday(),
      adherence_rating: s.adh, energy_level: s.nrg,
      ...(s.reviewed
        ? { reviewed_at: new Date().toISOString(), coach_comment: 'Strong week. Hold the same plan.' }
        : {}),
    })
  }
  console.log('seeded', s.name)
}

console.log(`\nDemo coach: ${COACH_EMAIL}  /  password: ${PASSWORD}`)
