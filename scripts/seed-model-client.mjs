// Add a MODEL client to the local demo roster — one person who did everything
// right, for 90 days, so the coach dashboard can be seen at full extent.
//
// Why this exists: seed-demo-roster.mjs is QA data (triage edge cases, thin on
// purpose) and seed-hero-roster.mjs is marketing data frozen at 2026-07-12.
// Neither writes weight, cardio, steps, measurements, reports or messages, so
// every chart on ClientView renders one or two points and the page cannot be
// judged. Design review against a thin fixture is how a screen gets called
// clean when it is only empty.
//
// Anchored to TODAY, never a frozen date: a stale anchor makes every triage
// read RED and the "last 30 days" charts draw nothing.
//
// Re-runnable — deletes its own rows first. LOCAL ONLY.
//
//   node scripts/seed-model-client.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPA_URL || 'http://127.0.0.1:54321'
const serviceKey = process.env.SERVICE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

if (!/127\.0\.0\.1|localhost/.test(url)) {
  console.error('LOCAL ONLY — refusing to run against', url)
  process.exit(1)
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

const PASSWORD = 'Demo!Passw0rd123'
const COACH_EMAIL = 'demo.coach@gardnr.test'
const CLIENT = { email: 'demo.nora@gardnr.test', name: 'Nora Vance' }

// LOCAL date formatting, never toISOString(): that converts to UTC, so west of
// Greenwich an evening run rolls every date forward a day.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d }
const iso = (n) => new Date(daysAgo(n)).toISOString()

const TARGETS = { calories: 2100, protein: 155, carbs: 210, fat: 65, cardio_minutes: 30, steps: 9000 }
const START_WEIGHT = 178
const GOAL_WEIGHT = 168

async function userByEmail(email) {
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email === email)
    if (hit) return hit
    if (data.users.length < 200) return null
    page += 1
  }
}

async function ensureUser(email, name) {
  const existing = await userByEmail(email)
  if (existing) return existing
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name },
  })
  if (error) throw error
  return data.user
}

const main = async () => {
  const coach = await userByEmail(COACH_EMAIL)
  if (!coach) {
    console.error(`No ${COACH_EMAIL}. Run: node scripts/seed-demo-roster.mjs first.`)
    process.exit(1)
  }
  const client = await ensureUser(CLIENT.email, CLIENT.name)
  console.log('coach', coach.id, '\nclient', client.id)

  await admin.from('profiles').upsert({ id: client.id, full_name: CLIENT.name, role: 'client' })

  // Re-runnable: clear this client's own rows before writing.
  for (const t of ['nutrition_log', 'weight_log', 'cardio_log', 'steps_log', 'body_measurements', 'day_complete']) {
    await admin.from(t).delete().eq('user_id', client.id)
  }
  for (const t of ['check_ins']) await admin.from(t).delete().eq('client_id', client.id)
  for (const t of ['reports', 'messages']) await admin.from(t).delete().eq('client_id', client.id)
  await admin.from('coach_clients').delete().eq('client_id', client.id)
  await admin.from('targets').delete().eq('user_id', client.id)

  await admin.from('coach_clients').insert({
    coach_id: coach.id, client_id: client.id, status: 'active',
    checkin_interval_weeks: 1, created_at: iso(95),
  })
  await admin.from('targets').insert({ user_id: client.id, ...TARGETS, weight_goal: GOAL_WEIGHT, weight_goal_unit: 'lbs' })

  const nutrition = [], weights = [], cardio = [], steps = [], meas = [], complete = []

  for (let n = 89; n >= 0; n--) {
    const date = ymd(daysAgo(n))
    const dow = daysAgo(n).getDay()

    // Nutrition: logged ~93% of days. Mostly on target, with a handful of
    // genuine over/under days so the compliance heatmap shows all four buckets
    // rather than a wall of one colour.
    if (n % 15 !== 7) {
      const pct = n % 23 === 0 ? 1.18 : n % 17 === 0 ? 0.72 : n % 29 === 0 ? 0.52 : 0.92 + ((n * 7) % 16) / 100
      const cal = Math.round(TARGETS.calories * pct)
      // Keys, not labels — the column has a CHECK constraint and the app's
      // MEALS list is lower-case (utils/meals.js).
      const meals = [['breakfast', 0.25], ['lunch', 0.35], ['dinner', 0.30], ['snack', 0.10]]
      for (const [meal, share] of meals) {
        nutrition.push({
          user_id: client.id, logged_date: date, meal,
          food: { breakfast: 'Oats, berries, whey', lunch: 'Chicken, rice, greens', dinner: 'Salmon, potatoes, salad', snack: 'Greek yogurt' }[meal],
          calories: Math.round(cal * share),
          protein: Math.round(TARGETS.protein * pct * share),
          carbs: Math.round(TARGETS.carbs * pct * share),
          fat: Math.round(TARGETS.fat * pct * share),
          serving_size: 1, serving_unit: 'serving', created_at: iso(n),
        })
      }
      complete.push({ user_id: client.id, logged_date: date, completed_at: iso(n) })
    }

    // Weigh-ins 5x/week, trending START -> GOAL with believable daily noise, so
    // the trend line, the 7-day average and the goal marker all have something
    // to draw.
    if (dow !== 0 && dow !== 6) {
      const progress = (89 - n) / 89
      const noise = ((n * 13) % 9 - 4) / 10
      weights.push({
        user_id: client.id, logged_date: date,
        weight: Math.round((START_WEIGHT - (START_WEIGHT - GOAL_WEIGHT) * progress + noise) * 10) / 10,
        unit: 'lbs', weighed_at: '07:15:00', created_at: iso(n),
      })
    }

    // Cardio 4x/week, steps daily.
    if ([1, 2, 4, 6].includes(dow)) {
      cardio.push({
        user_id: client.id, logged_date: date,
        exercise_type: ['Run', 'Cycling', 'Row', 'Walk'][n % 4],
        duration: 28 + (n % 4) * 6, calories_burned: 240 + (n % 5) * 30,
        avg_heart_rate: 138 + (n % 7), created_at: iso(n),
      })
    }
    steps.push({
      user_id: client.id, logged_date: date,
      steps: 8200 + ((n * 97) % 4200), distance: Math.round((8200 + ((n * 97) % 4200)) * 0.00047 * 100) / 100,
      created_at: iso(n),
    })

    // Tape every 14 days, shrinking where a cut should show it.
    if (n % 14 === 0) {
      const p = (89 - n) / 89
      meas.push({
        user_id: client.id, logged_date: date, unit: 'in',
        neck: Math.round((15.5 - 0.3 * p) * 10) / 10,
        chest: Math.round((41 - 1.2 * p) * 10) / 10,
        waist: Math.round((34.5 - 2.6 * p) * 10) / 10,
        hips: Math.round((39 - 1.4 * p) * 10) / 10,
        arm: Math.round((13.8 + 0.2 * p) * 10) / 10,
        thigh: Math.round((22.5 - 0.8 * p) * 10) / 10,
        created_at: iso(n),
      })
    }
  }

  const chunk = async (table, rows) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from(table).insert(rows.slice(i, i + 500))
      if (error) throw new Error(`${table}: ${error.message}`)
    }
    console.log(`${table.padEnd(18)} ${rows.length}`)
  }
  await chunk('nutrition_log', nutrition)
  await chunk('weight_log', weights)
  await chunk('cardio_log', cardio)
  await chunk('steps_log', steps)
  await chunk('body_measurements', meas)
  await chunk('day_complete', complete)

  // Weekly check-ins, all reviewed but the most recent — so the coach lands on
  // one piece of outstanding work rather than a page with nothing to do.
  const checkIns = []
  for (let w = 12; w >= 0; w--) {
    const d = daysAgo(w * 7)
    d.setDate(d.getDate() - d.getDay())
    checkIns.push({
      client_id: client.id, week_of: ymd(d),
      adherence_rating: 8 + (w % 3), energy_level: 7 + (w % 3),
      obstacles: w % 4 === 0 ? 'Travel midweek, ate out twice.' : null,
      notes: 'Felt strong in the gym. Sleep has been good.',
      created_at: iso(w * 7),
      reviewed_at: w === 0 ? null : iso(w * 7 - 1),
      coach_comment: w === 0 ? null : 'Great week. Hold the same targets.',
    })
  }
  await chunk('check_ins', checkIns)

  // Sent reports — the Sent-reports section had never been seen with data.
  const reports = []
  for (let w = 4; w >= 1; w--) {
    const d = daysAgo(w * 7)
    d.setDate(d.getDate() - d.getDay())
    reports.push({
      coach_id: coach.id, client_id: client.id, week_of: ymd(d),
      content: `Week of ${ymd(d)}\n\nAdherence is holding at 95%+ and the weight trend is on schedule for ${GOAL_WEIGHT} lbs.\n\nKeep protein at ${TARGETS.protein}g. No changes this week.`,
      created_at: iso(w * 7 - 1),
      read_at: w > 2 ? iso(w * 7 - 1) : null,
      archived: false,
    })
  }
  await chunk('reports', reports)

  await chunk('messages', [
    { coach_id: coach.id, client_id: client.id, sender_id: coach.id, content: 'Weigh-ins look great this week.', created_at: iso(5), read_at: iso(5) },
    { coach_id: coach.id, client_id: client.id, sender_id: client.id, content: 'Thanks! Feeling much better on the higher protein.', created_at: iso(4), read_at: iso(4) },
    { coach_id: coach.id, client_id: client.id, sender_id: client.id, content: 'Quick one — should I keep cardio at 4x next week?', created_at: iso(1), read_at: null },
  ])

  console.log(`\nDone. ${CLIENT.name} <${CLIENT.email}> / ${PASSWORD}`)
  console.log(`Coach: ${COACH_EMAIL} / ${PASSWORD}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
