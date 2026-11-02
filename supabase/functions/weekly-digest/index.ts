import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { wantsEmail } from '../_shared/notifications.ts'
import { makeTargetLookup, resolveDay, setsAnyDay, type TargetVersion } from '../_shared/targetHistory.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Cron-only. config.toml sets verify_jwt=true, so the gateway has already
// validated the JWT signature by the time we run — we can trust the decoded
// role claim. The weekly-coach-digest pg_cron job calls this with the service
// role key; the public anon key has role=anon and is rejected.
function jwtRole(token: string): string | null {
  try {
    const [, payload] = token.split('.')
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role ?? null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (jwtRole(token) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    await runDigest()
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Digest failed:', e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function runDigest() {
  const { data: relationships, error: relErr } = await supabase
    .from('coach_clients')
    .select('coach_id, client_id, profiles!coach_clients_client_id_fkey(full_name, email)')
    .eq('status', 'active')

  if (relErr) throw relErr
  if (!relationships || relationships.length === 0) return

  const coachMap: Record<string, { clients: any[] }> = {}
  for (const row of relationships) {
    if (!coachMap[row.coach_id]) coachMap[row.coach_id] = { clients: [] }
    coachMap[row.coach_id].clients.push({
      id: row.client_id,
      name: row.profiles?.full_name || row.profiles?.email || 'Client',
    })
  }

  const coachIds = Object.keys(coachMap)
  const { data: coachProfiles, error: cpErr } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .in('id', coachIds)

  if (cpErr) throw cpErr

  const today = new Date()
  const dayOfWeek = today.getDay()
  const prevSaturday = new Date(today)
  prevSaturday.setDate(today.getDate() - 1 - dayOfWeek)
  const prevSunday = new Date(prevSaturday)
  prevSunday.setDate(prevSaturday.getDate() - 6)

  const startDate = formatDate(prevSunday)
  const endDate = formatDate(prevSaturday)
  const weekLabel = `${formatDisplay(prevSunday)} - ${formatDisplay(prevSaturday)}`

  for (const coach of coachProfiles || []) {
    const clientList = coachMap[coach.id]?.clients || []
    if (clientList.length === 0) continue

    // Checked at the TOP of the loop, not at the send: a coach who muted the
    // digest should not have a week of their roster's logs queried and totalled
    // so the result can be thrown away.
    if (!(await wantsEmail(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, coach.id, 'weekly_digest'))) {
      continue
    }

    const clientIds = clientList.map((c: any) => c.id)

    const { data: allTargets } = await supabase
      .from('targets')
      .select('user_id, calories, protein, cardio_minutes, steps, day_plans')
      .in('user_id', clientIds)

    // Each day is graded against the plan in force that day, not today's.
    const { data: allVersions, error: versionsError } = await supabase
      .from('target_versions')
      .select('user_id, effective_date, calories, protein, cardio_minutes, steps, day_plans')
      .in('user_id', clientIds)
    if (versionsError) console.error('target_versions:', versionsError)

    const { data: nutritionLogs } = await supabase
      .from('nutrition_log')
      .select('user_id, calories, protein, logged_date')
      .in('user_id', clientIds)
      .gte('logged_date', startDate)
      .lte('logged_date', endDate)

    const { data: cardioLogs } = await supabase
      .from('cardio_log')
      .select('user_id, duration, logged_date')
      // Workouts that are not cardio (strength, yoga) are logged but do not
      // count toward the cardio target this digest grades against.
      .eq('counts_as_cardio', true)
      .in('user_id', clientIds)
      .gte('logged_date', startDate)
      .lte('logged_date', endDate)

    const { data: stepsLogs } = await supabase
      .from('steps_log')
      .select('user_id, steps, logged_date')
      .in('user_id', clientIds)
      .gte('logged_date', startDate)
      .lte('logged_date', endDate)

    // Any check-in whose period started in the last week. It was "keyed to
    // this Sunday", which only matched clients due on a Saturday: with a
    // per-client check-in day (coach_clients.checkin_weekday) a period can
    // start on any day. A client on a longer cadence whose period began
    // before that reads as not checked in this week, which is what the
    // digest's weekly column means.
    const weekAgo = new Date(today)
    weekAgo.setDate(today.getDate() - 6)
    const { data: checkIns } = await supabase
      .from('check_ins')
      .select('client_id, week_of')
      .in('client_id', clientIds)
      .gte('week_of', formatDate(weekAgo))

    const rows = clientList.map((client: any) => {
      const target = (allTargets || []).find((t: any) => t.user_id === client.id)
      const versions = (allVersions || []).filter((v: any) => v.user_id === client.id) as TargetVersion[]
      // No history readable: today's plan grades every day, as before.
      const targetOn = versions.length ? makeTargetLookup(versions) : (date: string) => resolveDay(target || null, date)
      const compliance = computeCompliance(
        client.id,
        target,
        targetOn,
        nutritionLogs || [],
        cardioLogs || [],
        stepsLogs || [],
      )
      const checkedIn = (checkIns || []).some((c: any) => c.client_id === client.id)

      return { name: client.name, compliance, checkedIn }
    })

    await sendDigestEmail(
      coach.email,
      coach.full_name || coach.email,
      rows,
      weekLabel,
    )
  }
}

function computeCompliance(
  clientId: string,
  target: any,
  targetOn: (date: string) => any,
  nutritionLogs: any[],
  cardioLogs: any[],
  stepsLogs: any[],
) {
  const myNutrition = nutritionLogs.filter((l) => l.user_id === clientId)
  const myCardio = cardioLogs.filter((l) => l.user_id === clientId)
  const mySteps = stepsLogs.filter((l) => l.user_id === clientId)

  // Graded when the base OR any day type sets it: a cardio target set only on
  // training days is still a target.
  const caloriesTarget = setsAnyDay(target, 'calories')
  const proteinTarget = setsAnyDay(target, 'protein')
  const cardioTarget = setsAnyDay(target, 'cardio_minutes')
  const stepsTarget = setsAnyDay(target, 'steps')

  const nutritionByDate: Record<string, { calories: number; protein: number }> = {}
  for (const log of myNutrition) {
    if (!nutritionByDate[log.logged_date]) nutritionByDate[log.logged_date] = { calories: 0, protein: 0 }
    nutritionByDate[log.logged_date].calories += log.calories || 0
    nutritionByDate[log.logged_date].protein += log.protein || 0
  }

  const cardioByDate: Record<string, number> = {}
  for (const log of myCardio) {
    cardioByDate[log.logged_date] = (cardioByDate[log.logged_date] || 0) + (log.duration || 0)
  }

  const stepsByDate: Record<string, number> = {}
  for (const log of mySteps) {
    stepsByDate[log.logged_date] = (stepsByDate[log.logged_date] || 0) + (log.steps || 0)
  }

  // Today's plan says which metrics are graded; each day is held to its own.
  const dayTarget = (date: string, key: string) => Number(targetOn(date)?.[key]) || 0
  const hits = (byDate: Record<string, number>, key: string) =>
    Object.entries(byDate).filter(([date, v]) => dayTarget(date, key) > 0 && v >= dayTarget(date, key) * 0.9).length

  const calDays = caloriesTarget
    ? Object.entries(nutritionByDate).filter(([date, v]) => dayTarget(date, 'calories') > 0 && v.calories >= dayTarget(date, 'calories') * 0.9).length
    : 0
  const proteinDays = proteinTarget
    ? Object.entries(nutritionByDate).filter(([date, v]) => dayTarget(date, 'protein') > 0 && v.protein >= dayTarget(date, 'protein') * 0.9).length
    : 0
  const cardioDays = cardioTarget ? hits(cardioByDate, 'cardio_minutes') : 0
  const stepsDays = stepsTarget ? hits(stepsByDate, 'steps') : 0
  const loggedDays = Object.keys(nutritionByDate).length

  return { calDays, proteinDays, cardioDays, stepsDays, loggedDays, caloriesTarget, proteinTarget, cardioTarget, stepsTarget }
}

function pillColor(days: number) {
  if (days >= 5) return '#34d399'
  if (days >= 3) return '#fbbf24'
  return '#f87171'
}

function pill(days: number, label: string, hasTarget: boolean) {
  if (!hasTarget) return `<span style="color:#555;font-size:12px">${label}: -</span>`
  const color = pillColor(days)
  return `<span style="display:inline-block;background:${color}22;color:${color};border:1px solid ${color}55;border-radius:4px;padding:2px 8px;font-size:12px;margin-right:4px">${label} ${days}/7</span>`
}

async function sendDigestEmail(
  coachEmail: string,
  coachName: string,
  rows: any[],
  weekLabel: string,
) {
  const clientRows = rows.map((r) => {
    const c = r.compliance
    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #242424;font-weight:600;color:#f4f4f4">${r.name}</td>
        <td style="padding:12px 16px;border-bottom:1px solid #242424">
          ${pill(c.calDays, 'Cal', !!c.caloriesTarget)}
          ${pill(c.proteinDays, 'Protein', !!c.proteinTarget)}
          ${pill(c.cardioDays, 'Cardio', !!c.cardioTarget)}
          ${pill(c.stepsDays, 'Steps', !!c.stepsTarget)}
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #242424;text-align:center;font-size:13px;color:${c.loggedDays === 0 ? '#f87171' : '#a3a3a3'}">${c.loggedDays}/7 days</td>
        <td style="padding:12px 16px;border-bottom:1px solid #242424;text-align:center;font-size:13px">
          ${r.checkedIn
            ? '<span style="color:#34d399">&#10003; Submitted</span>'
            : '<span style="color:#555">Not submitted</span>'
          }
        </td>
      </tr>
    `
  }).join('')

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0a;color:#a3a3a3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0">
  <div style="max-width:640px;margin:0 auto;padding:40px 24px">
    <p style="font-size:22px;font-weight:700;color:#f4f4f4;letter-spacing:-0.02em;margin:0 0 4px">Gardnr</p>
    <p style="font-size:13px;color:#555;margin:0 0 32px">Weekly Coach Digest</p>

    <h2 style="font-size:16px;font-weight:600;color:#f4f4f4;margin:0 0 4px">
      Week of ${weekLabel}
    </h2>
    <p style="font-size:13px;color:#555;margin:0 0 24px">
      Here's how your clients did this week.
    </p>

    <table style="width:100%;border-collapse:collapse;background:#141414;border:1px solid #242424;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#1a1a1a">
          <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#555;font-weight:500">Client</th>
          <th style="padding:10px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#555;font-weight:500">Compliance</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#555;font-weight:500">Logged</th>
          <th style="padding:10px 16px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#555;font-weight:500">Check-in</th>
        </tr>
      </thead>
      <tbody>
        ${clientRows}
      </tbody>
    </table>

    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #242424">
      <a href="https://www.gardnr.fit" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600">
        Open Gardnr
      </a>
    </div>

    <p style="margin-top:32px;font-size:11px;color:#333;line-height:1.6">
      You're receiving this because you have active clients on Gardnr.<br>
      <a href="https://www.gardnr.fit" style="color:#333">gardnr.fit</a>
    </p>
  </div>
</body>
</html>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Gardnr <noreply@gardnr.fit>',
      to: coachEmail,
      subject: `Your weekly client digest - ${weekLabel}`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`Failed to send to ${coachEmail}:`, err)
  }
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDisplay(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

