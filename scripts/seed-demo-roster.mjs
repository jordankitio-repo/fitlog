// Seed a coach roster that survives being shown to a coach.
//
// This is the DEMO fixture — the one you sign into when someone is watching.
// (seed-hero-roster.mjs is for the landing-page screenshot and holds three
// clients frozen to an anchor date; this one dates everything relative to now,
// so it is correct whenever it is run and stale the moment it isn't.)
//
// RE-RUN IT BEFORE EVERY DEMO. Dates are relative to the run, so a roster
// seeded last week shows every client lapsed in red today. That is not a
// hypothetical: on 2026-10-19 the local roster was ten days old and every
// client read as "10 days no log", which is a product that looks abandoned.
//
// WHAT CHANGED, AND WHY EACH OF IT MATTERED. A walkthrough as a prospective
// coach found five things that said "test data" before any feature did:
//
//   * The macros did not add up. Every day was one row called "Demo meal" with
//     calories and protein and nothing else, so a client's record read 1,950
//     cal / 150g protein / 0g carbs / 0g fat. That is physically impossible,
//     and macros are the one subject a nutrition coach is expert in. Days are
//     built from real meals now, and every day's calories equal 4p + 4c + 9f.
//   * Seven days of history. Every 30-day window therefore read red even for
//     the best client on the roster — "7/30" under a client labelled On track.
//     The UI was being honest; there was nothing to be honest about. 60 days.
//   * No steps, weight or cardio at all, while targets for them existed. A
//     coach opens those. They are logged now, with a weight trend that drifts
//     the way a real one does.
//   * Emails at `@gardnr.test`, printed nine times on the roster and again
//     under the client's name on their record.
//   * Eight of nine clients red or amber. Triage demonstrated itself and the
//     practice looked like it was collapsing. The spread below is five on
//     track, two drifting, two needing attention — enough to show the feature
//     working on a business worth running.
//
//   SUPA_URL=... SERVICE_KEY=... node scripts/seed-demo-roster.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPA_URL
const serviceKey = process.env.SERVICE_KEY
if (!url || !serviceKey) { console.error('Set SUPA_URL and SERVICE_KEY'); process.exit(1) }

// LOCAL ONLY. This creates users and writes health data, and it now writes data
// designed to look real — which makes pointing it at production worse, not
// better. The hero seed has carried this guard from the start; this one did
// not, and the difference was only ever that nobody had noticed.
if (!/^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url)) {
  console.error(`REFUSING TO RUN against ${url} — this seeds users and health data. Local only.`)
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

const PASSWORD = 'Demo!Passw0rd123'
const COACH_EMAIL = 'demo.coach@gardnr.test'
const COACH_NAME = 'Marta Nowak'
const DAYS = 60

// LOCAL date formatting, never toISOString(). toISOString() converts to UTC, so
// west of Greenwich an evening run rolls every date forward a day: seeded
// check-ins landed on week_of 09-14 while the app (which computes the week
// start locally) looked for 09-13, and every client showed "No check-in"
// despite having one. The app's own toLocalDateString does exactly this.
const local = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dstr = (off) => { const d = new Date(); d.setDate(d.getDate() - off); return local(d) }
const weekSundayAgo = (weeks) => {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() - weeks * 7)
  return local(d)
}
const dow = (off) => { const d = new Date(); d.setDate(d.getDate() - off); return d.getDay() }

// Deterministic jitter. A fixture that reshuffles itself every run cannot be
// compared against yesterday's screenshot, and "it looked different last time"
// is a bug report nobody can act on.
let seed = 20261019
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const jitter = (base, pct) => Math.round(base * (1 + (rnd() * 2 - 1) * pct))

// Everything this fixture has ever created, not just what it is about to
// create. Deleting only by the email in hand leaves ORPHANS the moment an
// address changes: renaming the clients from `demo.x@gardnr.test` to realistic
// ones stranded nine old accounts with the same display names, invisible on
// the roster (no relationship to the coach) and confusing everywhere else —
// a lookup by name then returns a client this coach cannot read, and the
// record renders its "no permission" fallback. That looked exactly like a bug
// in the app, and was not one.
const LEGACY = /@gardnr\.test$/
async function purgePriorSeed(currentEmails) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const doomed = (data?.users || []).filter(
    (u) => currentEmails.includes(u.email) || (LEGACY.test(u.email || '') && u.email !== COACH_EMAIL),
  )
  for (const u of doomed) await admin.auth.admin.deleteUser(u.id)
  return doomed.length
}

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

// A day of eating, built from meals that actually sum to the day's calories.
//
// The split is roughly 30/40/30 protein/carbs/fat by calories, which is a
// normal coaching split, and the arithmetic is checked below rather than
// trusted: calories = 4p + 4c + 9f. A record whose macros do not reconcile is
// the first thing a nutrition coach will spot and the last thing they forget.
const MEALS = [
  { name: 'Greek yoghurt, berries, granola', meal: 'breakfast', share: 0.22 },
  { name: 'Chicken, rice and greens',        meal: 'lunch',      share: 0.34 },
  { name: 'Salmon, potatoes, broccoli',      meal: 'dinner',     share: 0.33 },
  { name: 'Protein shake',                   meal: 'snack',      share: 0.11 },
]

function dayOfMeals(userId, date, dayCalories) {
  return MEALS.map(({ name, meal, share }) => {
    const cal = Math.round(dayCalories * share)
    // Hold the split, then derive grams from it so the three macros and the
    // calorie figure cannot disagree.
    const protein = Math.round((cal * 0.30) / 4)
    const carbs = Math.round((cal * 0.40) / 4)
    const fat = Math.round((cal * 0.30) / 9)
    return {
      user_id: userId, food: name, meal,
      calories: 4 * protein + 4 * carbs + 9 * fat,
      protein, carbs, fat,
      serving_size: 1, serving_unit: 'serving', logged_date: date,
    }
  })
}

// Five on track, two drifting, two needing attention.
//
//   density   how much of the last 60 days they logged
//   gap       days since their last log (0 = logged today)
//   hits      do their days land near target, or well under
const SPECS = [
  { first: 'ava',   name: 'Ava Lindqvist',  email: 'ava.lindqvist@gmail.com',   density: 0.93, gap: 0, hits: true,  targets: true,  checkIns: 4, adh: 9, nrg: 8, reviewed: true,  weight: [68.4, 66.9], weight_goal: 66, weight_goal_unit: 'kg' },
  { first: 'ben',   name: 'Ben Osei',       email: 'b.osei@outlook.com',        density: 0.88, gap: 0, hits: true,  targets: true,  checkIns: 4, adh: 8, nrg: 7, reviewed: true,  weight: [91.2, 88.1], weight_goal: 88.5, weight_goal_unit: 'kg' },
  { first: 'cara',  name: 'Cara Whitfield', email: 'cara.whitfield@gmail.com',  density: 0.85, gap: 0, hits: true,  targets: true,  checkIns: 3, adh: 8, nrg: 6, reviewed: true,  weight: [74.0, 72.6], weight_goal: 71.5, weight_goal_unit: 'kg' },
  { first: 'priya', name: 'Priya Raman',    email: 'priya.raman@proton.me',     density: 0.90, gap: 0, hits: true,  targets: true,  checkIns: 4, adh: 9, nrg: 9, reviewed: true,  weight: [59.8, 59.1], weight_goal: 58.5, weight_goal_unit: 'kg' },
  { first: 'tom',   name: 'Tom Byrne',      email: 'tom.byrne88@gmail.com',     density: 0.80, gap: 1, hits: true,  targets: true,  checkIns: 3, adh: 7, nrg: 7, reviewed: true,  weight: [84.5, 83.2], weight_goal: 82, weight_goal_unit: 'kg' },
  // Drifting: logs most days but well under target, and a check-in waiting.
  { first: 'dan',   name: 'Dan Moreau',     email: 'dan.moreau@gmail.com',      density: 0.75, gap: 0, hits: false, targets: true,  checkIns: 3, adh: 4, nrg: 4, weight: [86.3, 86.1], weight_goal: 83, weight_goal_unit: 'kg' },  // plateau despite logging — a real coaching problem
  { first: 'gia',   name: 'Gia Ferrante',   email: 'gia.ferrante@icloud.com',   density: 0.55, gap: 3, hits: true,  targets: true,  checkIns: 2, adh: 5, nrg: 4, weight: [70.2, 71.4], weight_goal: 68, weight_goal_unit: 'kg' },  // creeping up while logging tails off
  // Needs attention.
  { first: 'hugo',  name: 'Hugo Bennett',   email: 'hugo.bennett@gmail.com',    density: 0.35, gap: 6, hits: false, targets: true,  checkIns: 1, adh: 4, nrg: 3, weight: [102.5, 101.9], weight_goal: 96, weight_goal_unit: 'kg' },
  // Genuinely new: connected three days ago and has not started. A real state,
  // and the one empty record worth having on screen.
  { first: 'iris',  name: 'Iris Calder',    email: 'iris.calder@gmail.com',     density: 0,    gap: null, hits: true, targets: false, checkIns: 0, joinedDaysAgo: 3 },
]

const purged = await purgePriorSeed(SPECS.map((x) => x.email))
if (purged) console.log(`removed ${purged} account(s) from a previous seed`)

const coachId = await makeUser(COACH_EMAIL, COACH_NAME, 'coach')
await admin.from('subscriptions').insert({
  coach_id: coachId, status: 'active', billing_interval: 'monthly',
  current_period_end: new Date(Date.now() + 23 * 864e5).toISOString(),
  stripe_customer_id: 'demo_cus', stripe_subscription_id: 'demo_sub',
})

let checked = 0
for (const s of SPECS) {
  const clientId = await makeUser(s.email, s.name, 'client')
  const joined = s.joinedDaysAgo ?? 70
  await admin.from('coach_clients').insert({
    coach_id: coachId, client_id: clientId, status: 'active',
    created_at: new Date(Date.now() - joined * 864e5).toISOString(),
    // Cleared TODAY, deliberately. A client who stops logging gets LOCKED, and
    // a locked row shows "Locked" in the attention column instead of the
    // reason they are there — so the demo's two lapsed clients read as a
    // mechanism the viewer has not been told about rather than as "6 days no
    // log". The lock is a real feature; it is not the one being shown in the
    // first sixty seconds.
    lock_cleared_at: dstr(0),
  })

  if (s.targets) {
    await admin.from('targets').insert({
      user_id: clientId, calories: 2000, protein: 150, carbs: 200, fat: 67,
      cardio_minutes: 120, steps: 10000,
      // Every client here had a null weight goal, which left the chart's goal
      // line, its reached-goal marker and the "x to lose" caption unrendered
      // across the whole roster — three shipped features a coach being walked
      // through the demo never saw. Each goal is set against that client's own
      // `weight: [start, end]` above, so the roster carries a client still
      // working toward one, one drifting AWAY from one (Gia), a plateau short
      // of one (Dan), and one who crosses it (Ben) — the last being the only
      // way the marker and its date ever appear.
      weight_goal: s.weight_goal ?? null,
      weight_goal_unit: s.weight_goal_unit ?? 'kg',
    })
  }

  // Which of the last 60 days this person logged. The gap at the front is what
  // the roster's triage reads, so it is explicit rather than emergent.
  const days = []
  if (s.gap !== null) {
    // The gap is EXACT, not a floor. Letting the density roll decide the most
    // recent day made every client look worse than specified — "2 days no log"
    // on the client the spec says logged today — and that number is the first
    // thing the roster grades on.
    days.push(s.gap)

    // Compliance is graded on the last 7 days, so an on-track client has to
    // have actually logged them. Density alone left the best clients at 18/28
    // and the roster reporting 0 on track: a roster that cannot show its own
    // healthy state is not demonstrating triage, it is just failing quietly.
    const solid = s.hits ? 9 : 0
    for (let off = s.gap + 1; off < s.gap + solid; off++) days.push(off)

    for (let off = s.gap + Math.max(solid, 1); off < DAYS; off++) {
      // Weekends are likelier to be missed, which is the pattern the weekday /
      // weekend split on My Progress exists to show. A fixture with no weekend
      // dip leaves that panel saying nothing.
      const weekend = dow(off) === 0 || dow(off) === 6
      if (rnd() < s.density * (weekend ? 0.7 : 1)) days.push(off)
    }
  }

  const nutrition = []
  const steps = []
  const cardio = []
  for (const off of days) {
    const date = dstr(off)
    // Tight, because compliance is graded per METRIC over a 7-day window (four
    // metrics reads as "n/28"). A ±25% swing on steps around a 10,000 target
    // misses half the time, which is how the first version of this seed put
    // "10/28 days on target" in red under its own best client. On-target
    // clients sit just ABOVE each target; the drifting ones sit clearly below.
    nutrition.push(...dayOfMeals(clientId, date, s.hits ? jitter(2060, 0.03) : jitter(1350, 0.12)))
    steps.push({ user_id: clientId, logged_date: date, steps: s.hits ? jitter(11200, 0.08) : jitter(5200, 0.3) })
    // Most days for someone on track — the cardio target is weekly minutes, and
    // three sessions does not reach 120.
    if (rnd() < (s.hits ? 0.8 : 0.35)) {
      cardio.push({
        user_id: clientId, logged_date: date,
        exercise_type: rnd() < 0.5 ? 'Run' : 'Cycling',
        duration: jitter(34, 0.15), calories_burned: jitter(360, 0.25), avg_heart_rate: jitter(142, 0.08),
      })
    }
  }

  // Weight: a gentle trend between two endpoints, weighed every few days, with
  // the noise a real scale has. A perfectly smooth line is the giveaway.
  const weights = []
  if (s.weight) {
    const [from, to] = s.weight
    for (let off = DAYS; off >= (s.gap ?? 0); off -= 3) {
      const t = (DAYS - off) / DAYS
      const w = from + (to - from) * t + (rnd() - 0.5) * 0.45
      weights.push({
        user_id: clientId, logged_date: dstr(off), weighed_at: '07:15:00',
        weight: Math.round(w * 10) / 10, unit: 'kg',
      })
    }
  }

  for (const [table, rows] of [['nutrition_log', nutrition], ['steps_log', steps], ['cardio_log', cardio], ['weight_log', weights]]) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from(table).insert(rows.slice(i, i + 200))
      if (error) throw new Error(`${s.name} ${table}: ${error.message}`)
    }
  }

  // Several weeks of check-ins, so the Check-in section has a history rather
  // than a single row. The most recent one is left UNREVIEWED for the drifting
  // clients, which is what puts them in "needs review" on the roster.
  for (let w = 0; w < s.checkIns; w++) {
    const isLatest = w === 0
    await admin.from('check_ins').insert({
      client_id: clientId, week_of: weekSundayAgo(w),
      adherence_rating: Math.max(1, Math.min(10, s.adh + (w === 0 ? 0 : Math.round((rnd() - 0.5) * 2)))),
      energy_level: Math.max(1, Math.min(10, s.nrg + (w === 0 ? 0 : Math.round((rnd() - 0.5) * 2)))),
      notes: isLatest ? 'Travel midweek made dinners harder, otherwise steady.' : 'Good week overall.',
      ...(!isLatest || s.reviewed
        ? { reviewed_at: new Date(Date.now() - w * 7 * 864e5).toISOString(), coach_comment: 'Strong week. Hold the same plan.' }
        : {}),
    })
  }
  if (s.checkIns && !s.reviewed) checked++

  console.log(`seeded ${s.name.padEnd(16)} ${days.length} days logged, ${weights.length} weigh-ins, ${cardio.length} sessions`)
}

console.log(`\nDemo coach: ${COACH_EMAIL}  /  password: ${PASSWORD}`)
console.log(`${SPECS.length} clients · ${DAYS} days of history · ${checked} check-ins awaiting review`)
console.log('Re-run this before every demo: the dates are relative to now.')
