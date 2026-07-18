// Seed the roster behind the landing-page hero screenshot.
//
// Sibling of seed-demo-roster.mjs, which exists for a different job: that one is
// QA data, spanning every triage edge case with names like "Ava — on track" and
// no weight/steps/cardio. Great for exercising badges, unusable in a hero image.
// This one is marketing data: three believable clients with two weeks of real
// logs behind them, so the charts have something to draw.
//
// Why a screenshot at all: the old hero was a hand-built mock of a coach
// dashboard that did not exist. A drawing of your product is a bad thing to put
// in front of someone deciding whether to trust you, and Gardnr's real dashboard
// is the argument — so photograph it instead.
//
// The three clients each tell a story triage is supposed to surface: one on
// target, one drifting, one who stopped logging days ago. A dashboard where
// everyone is green demonstrates nothing.
//
// REMOTE-ALLOWED COPY of seed-hero-roster.mjs, for the ISOLATED demo sandbox only.
// It creates users + health data, so it still refuses to run against an arbitrary
// host: a non-local host is permitted ONLY when ALLOW_REMOTE_HOST exactly equals
// that host. You would have to name the prod host explicitly to hit it — which this
// demo flow never does — so prod stays safe. Keep this file OUT of the local flow;
// use scripts/seed-hero-roster.mjs there.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPA_URL || 'http://127.0.0.1:54321'
const serviceKey = process.env.SERVICE_KEY

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)
const host = (() => { try { return new URL(url).host } catch { return null } })()
const remoteAllowed = !!process.env.ALLOW_REMOTE_HOST && process.env.ALLOW_REMOTE_HOST === host
if (!isLocal && !remoteAllowed) {
  console.error(`REFUSING TO RUN against ${url} — set ALLOW_REMOTE_HOST=${host} to seed this exact remote host on purpose.`)
  process.exit(1)
}
if (!serviceKey) {
  console.error('Set SERVICE_KEY (supabase status -> Secret key)')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

export const COACH_EMAIL = 'alex@gardnr.demo'
export const PASSWORD = 'Demo!Passw0rd123'

// Anchored to a fixed date rather than "now", so re-running produces the same
// roster and the hero image doesn't silently change from one day to the next.
const TODAY = new Date('2026-07-12T12:00:00Z')
const dstr = (off) => {
  const d = new Date(TODAY)
  d.setUTCDate(d.getUTCDate() - off)
  return d.toISOString().slice(0, 10)
}

async function delUser(email) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const u = data?.users?.find((x) => x.email === email)
  if (u) await admin.auth.admin.deleteUser(u.id)
}

async function makeUser(email, full_name, role, extra = {}) {
  await delUser(email)
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error) throw new Error(`${email}: ${error.message}`)
  await admin.from('profiles').upsert({ id: data.user.id, email, full_name, role, ...extra })
  return data.user.id
}

// The roster is built to land one client on each triage level, because a
// dashboard where everyone is the same colour demonstrates nothing. The rules it
// is aimed at (src/utils/attentionLevel.js) are:
//   RED    4+ days since a log
//   YELLOW 2-3 days quiet, OR no check-in, OR any metric under 3/7
//   GREEN  none of the above
// and "on target" for a day means 90-110% of the target (complianceSummary.js).
//
// NOTE cardio_minutes is a DAILY target — the form reads "Cardio (min/day)",
// placeholder "e.g. 30", and clientStats compares each day's total against it.
// Seeding it as a weekly figure (150) makes every client read Cardio 0/7,
// because no single day clears a 150-minute bar.
// Build a run of logged days from `from` back to `span`, dropping `skip` offsets.
// History runs 8 weeks deep rather than 2, for two reasons the shorter seed
// couldn't satisfy:
//   - the energy-balance read needs 8+ weigh-ins spanning 14+ days at 70%
//     coverage (energyBalanceRead.js) — 13 days of data spans only 13, so it
//     stayed locked behind "need a couple more weeks of logging"
//   - the 90-day compliance heatmap has almost nothing to draw with two weeks
const run = (from, span, skip = []) =>
  Array.from({ length: span - from + 1 }, (_, i) => from + i).filter((d) => !skip.includes(d))

const CLIENTS = [
  {
    email: 'maya@gardnr.demo',
    name: 'Maya Chen',
    goal: 'Cut phase',
    sex: 'female', height: 168, startWeight: 71.4, perDay: -0.055,
    targets: { calories: 1850, protein: 140, carbs: 165, fat: 60, cardio_minutes: 35, steps: 9000 },
    // GREEN. Logged today, checked in, and every metric clears 3/7 — including
    // cardio, which needs 4+ sessions inside the 7-day window to get there.
    // Near-perfect adherence over eight weeks, so the heatmap and the energy
    // balance read both have something honest to say.
    logDays: run(0, 55, [12, 19, 26, 33, 40, 47]),
    hit: 0.94, steps: 9600,
    cardioDays: [0, 2, 4, 5, 8, 11, 15, 18, 22, 25, 29, 32, 36, 39, 43, 46, 50, 53],
    checkIn: { adherence_rating: 4, energy_level: 4, notes: 'Good week. Weekend was harder but I stayed in range.' },
    // A recomp the scale would hide: weight down a little, waist down a lot,
    // arm up. This is the argument for tracking measurements at all.
    measurements: { neck: [32.5, 32.0], chest: [94, 92.5], waist: [78, 72.5], hips: [98, 95], arm: [28.5, 29.4], thigh: [56, 54.5] },
  },
  {
    email: 'marcus@gardnr.demo',
    name: 'Marcus Webb',
    goal: 'Reverse diet',
    sex: 'male', height: 179, startWeight: 80.9, perDay: 0.012,
    targets: { calories: 2600, protein: 175, carbs: 280, fat: 80, cardio_minutes: 30, steps: 10000 },
    // YELLOW. Weight holding flat, which is what a reverse should do, and he has
    // checked in — but his cardio and steps have quietly stopped. Exactly the
    // drift a spreadsheet hides and the pills surface.
    logDays: run(1, 55, [5, 6, 12, 13, 20, 27, 34, 41, 48]),
    hit: 1.08, steps: 7400, cardioDays: [3, 10, 17, 24, 31, 38],
    checkIn: { adherence_rating: 3, energy_level: 3, notes: 'Travelling for work, missed a couple of sessions.' },
  },
  {
    email: 'sam@gardnr.demo',
    name: 'Sam Rivera',
    goal: 'Maintenance',
    sex: 'male', height: 175, startWeight: 78.2, perDay: 0.02,
    targets: { calories: 2400, protein: 160, carbs: 250, fat: 80, cardio_minutes: 30, steps: 8000 },
    // RED. Went quiet five days ago — past the 4-day threshold — and never
    // checked in. The client the dashboard exists to catch, and the one a
    // spreadsheet lets you forget about until the call.
    logDays: run(5, 55, [8, 11, 14, 16, 21, 23, 28, 30, 35, 37, 42, 44, 49, 51]),
    hit: 0.71, steps: 4900, cardioDays: [6, 20, 33],
    checkIn: null,
  },
]

// The Sunday that starts the current week — check_ins are keyed by week_of.
const weekOf = (() => {
  const d = new Date(TODAY)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
})()

// Nobody eats the same percentage of their target 50 days running. A flat `hit`
// produced a heatmap that was a solid wall of identical green — which reads as
// fake, and wastes the legend the heatmap actually has (90-110% green, >110%
// orange, 60-89% amber, <60% red). This scatters days around the client's
// average so the grid looks like a person ate it.
//
// Deterministic on the day offset, not random: the seed must be reproducible or
// the hero image quietly changes every time someone re-runs it.
function hitForDay(base, off) {
  const wobble = (((off * 37) % 15) - 7) / 100        // ±7% day to day
  const blowout = off % 17 === 3 ? 0.28 : 0           // an over-target day now and then
  const skimped = off % 11 === 5 ? -0.22 : 0          // and a day they under-ate
  return Math.max(0.4, base + wobble + blowout + skimped)
}

// A day's eating split across meals, scaled to hit a share of the calorie target.
function mealsFor(userId, date, t, hit) {
  const total = Math.round(t.calories * hit)
  return [
    ['breakfast', 0.25, 'Greek yoghurt, berries, granola'],
    ['lunch', 0.35, 'Chicken, rice and greens'],
    ['dinner', 0.3, 'Salmon, potatoes, broccoli'],
    ['snack', 0.1, 'Protein shake'],
  ].map(([meal, share, food]) => {
    const calories = Math.round(total * share)
    return {
      user_id: userId, food, meal, calories,
      protein: Math.round((calories * 0.32) / 4),
      carbs: Math.round((calories * 0.42) / 4),
      fat: Math.round((calories * 0.26) / 9),
      logged_date: date, serving_size: 1, serving_unit: 'serving',
    }
  })
}

const coachId = await makeUser(COACH_EMAIL, 'Alex Moreau', 'coach', {
  onboarded_at: TODAY.toISOString(),
})
// Active subscription so the coach clears the paywall if BILLING_ENABLED is ever
// flipped back on. Harmless while it's off.
await admin.from('subscriptions').insert({
  coach_id: coachId,
  status: 'active',
  current_period_end: new Date(TODAY.getTime() + 30 * 864e5).toISOString(),
  stripe_customer_id: 'demo_cus',
  stripe_subscription_id: 'demo_sub',
})
console.log(`coach   Alex Moreau <${COACH_EMAIL}>`)

for (const c of CLIENTS) {
  const id = await makeUser(c.email, c.name, 'client', {
    sex: c.sex,
    height_cm: c.height,
    birth_date: '1994-03-14',
    activity_level: 'moderate',
    unit_preference: 'metric',
    onboarded_at: TODAY.toISOString(),
  })

  await admin.from('coach_clients').insert({
    coach_id: coachId,
    client_id: id,
    status: 'active',
    // Connected well in the past with the lock cleared, so triage is driven by
    // the logging pattern rather than a new-client grace period.
    created_at: new Date(TODAY.getTime() - 40 * 864e5).toISOString(),
    lock_cleared_at: dstr(0),
    checkin_interval_weeks: 1,
  })

  await admin.from('targets').insert({ user_id: id, ...c.targets })

  const nutrition = []
  const weights = []
  const steps = []
  for (const off of c.logDays) {
    const date = dstr(off)
    nutrition.push(...mealsFor(id, date, c.targets, hitForDay(c.hit, off)))
    weights.push({
      user_id: id,
      // Trends toward the goal with a little daily noise, so the line looks like
      // a person rather than a ruler.
      weight: +(c.startWeight + c.perDay * (14 - off) + ((off % 3) - 1) * 0.15).toFixed(1),
      unit: 'kg',
      logged_date: date,
      weighed_at: '07:15:00', // `time`, not a timestamp — the date lives in logged_date
    })
    steps.push({ user_id: id, steps: c.steps + ((off * 137) % 1600) - 800, logged_date: date })
  }
  const cardio = c.cardioDays.map((off) => ({
    user_id: id,
    exercise_type: 'Zone 2 walk',
    duration: 35 + (off % 3) * 10,
    calories_burned: 240 + (off % 4) * 30,
    logged_date: dstr(off),
  }))

  for (const [table, rows] of [
    ['nutrition_log', nutrition], ['weight_log', weights],
    ['steps_log', steps], ['cardio_log', cardio],
  ]) {
    if (!rows.length) continue
    const { error } = await admin.from(table).insert(rows)
    if (error) throw new Error(`${c.name} ${table}: ${error.message}`)
  }

  if (c.measurements) {
    // Six tape sessions across the eight weeks, interpolated between the start
    // and current value per site. Two points would satisfy "change since day
    // one" but there'd be no per-site *trend* to draw, which is the thing the
    // copy actually promises.
    const SESSIONS = [55, 44, 33, 22, 11, 0]
    const rows = SESSIONS.map((off, i) => {
      const t = i / (SESSIONS.length - 1) // 0 at the first session, 1 at today
      return {
        user_id: id,
        logged_date: dstr(off),
        unit: 'cm',
        ...Object.fromEntries(
          Object.entries(c.measurements).map(([site, [from, to]]) => {
            // Straight interpolation plus a little measurement noise — a tape
            // measure read by a human doesn't move in a perfect line.
            const noise = (((i * 29) % 7) - 3) / 20
            return [site, +(from + (to - from) * t + noise).toFixed(1)]
          }),
        ),
      }
    })
    const { error } = await admin.from('body_measurements').insert(rows)
    if (error) throw new Error(`${c.name} body_measurements: ${error.message}`)
  }

  if (c.checkIn) {
    // Left unreviewed on purpose: the roster banner's "N check-ins to review" is
    // a live to-do, and a hero image should show the product with work in it.
    const { error } = await admin.from('check_ins').insert({
      client_id: id, week_of: weekOf, ...c.checkIn,
    })
    if (error) throw new Error(`${c.name} check_ins: ${error.message}`)
  }

  const last = Math.min(...c.logDays)
  console.log(
    `client  ${c.name.padEnd(12)} ${c.goal.padEnd(13)} ` +
    `${c.logDays.length} days logged · last ${last === 0 ? 'today' : `${last}d ago`}`,
  )
}

console.log(`\nSign in: ${COACH_EMAIL} / ${PASSWORD}`)
