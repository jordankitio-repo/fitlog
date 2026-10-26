// Automatic nudges: each coach's one rule, "nudge a client who has not logged
// food for N days", applied once a day by pg_cron (service_role only, like
// weekly-digest).
//
// The same guard rails as the Nudge button, so automation can never be noisier
// than a coach pressing it by hand: a 48-hour cooldown per client (shared
// with the button through last_nudged_at), active relationships only, paused
// clients skipped, and the client's own email preference respected. The
// in-app notice comes from last_nudged_at, so a muted client still sees it.
import { wantsEmail } from '../_shared/notifications.ts'
import { buildNudgeEmail } from '../_shared/nudgeEmail.ts'

const COOLDOWN_MS = 48 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function jwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role ?? null
  } catch {
    return null
  }
}

// Whole days between a YYYY-MM-DD date and today (UTC). The roster counts in
// the coach's local day; a one-day difference at the edges is acceptable for
// a rule measured in days, and errs towards nudging a day later, not earlier.
function daysSince(date: string, todayMs: number) {
  return Math.floor((todayMs - Date.parse(`${date}T00:00:00Z`)) / DAY_MS)
}

Deno.serve(async (req) => {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (jwtRole(token) !== 'service_role') return jsonResponse({ error: 'Forbidden' }, 403)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' }
  const get = async (path: string) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers })
    if (!res.ok) throw new Error(`${path}: ${await res.text()}`)
    return res.json()
  }

  const now = Date.now()
  const today = new Date(now).toISOString().slice(0, 10)
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  const result = { coaches: 0, considered: 0, nudged: 0, emailed: 0, errors: 0 }

  try {
    const rules = await get('coach_automations?select=coach_id,nudge_after_days&nudge_after_days=not.is.null')
    for (const rule of rules) {
      result.coaches += 1
      const rels = await get(
        `coach_clients?select=id,client_id,created_at,last_nudged_at,paused_until` +
        `&coach_id=eq.${rule.coach_id}&status=eq.active`,
      )
      const due = rels.filter((r: any) =>
        !(r.paused_until && r.paused_until >= today) &&
        !(r.last_nudged_at && now - Date.parse(r.last_nudged_at) < COOLDOWN_MS))
      if (!due.length) continue

      const ids = due.map((r: any) => r.client_id)
      const coach = (await get(`profiles?select=full_name&id=eq.${rule.coach_id}`))[0]
      const clients = await get(`profiles?select=id,email,full_name&id=in.(${ids.join(',')})`)

      for (const rel of due) {
        result.considered += 1
        try {
          const last = (await get(
            `nutrition_log?select=logged_date&user_id=eq.${rel.client_id}&order=logged_date.desc&limit=1`,
          ))[0]
          // Never logged: counted from when they joined, so a client who
          // joined this morning is not nudged tonight.
          const quiet = last ? daysSince(last.logged_date, todayMs) : daysSince(rel.created_at.slice(0, 10), todayMs)
          if (quiet < rule.nudge_after_days) continue

          const client = clients.find((c: any) => c.id === rel.client_id)
          if (!client?.email) continue
          const sendEmail = resendApiKey ? await wantsEmail(supabaseUrl, serviceKey, client.id, 'nudge') : false
          if (sendEmail) {
            const { subject, html } = buildNudgeEmail({
              reason: 'log', days: last ? quiet : null,
              coachName: coach?.full_name || 'Your coach', clientName: client.full_name || 'there',
            })
            const mail = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendApiKey}` },
              body: JSON.stringify({ from: 'Gardnr <noreply@gardnr.fit>', to: [client.email], subject, html }),
            })
            if (!mail.ok) { result.errors += 1; continue }
            result.emailed += 1
          }
          const upd = await fetch(`${supabaseUrl}/rest/v1/coach_clients?id=eq.${rel.id}`, {
            method: 'PATCH', headers, body: JSON.stringify({ last_nudged_at: new Date().toISOString() }),
          })
          if (!upd.ok) { result.errors += 1; continue }
          result.nudged += 1
        } catch (err) {
          console.error('auto-nudge client failed:', err)
          result.errors += 1
        }
      }
    }
    return jsonResponse({ success: true, ...result })
  } catch (error) {
    console.error('auto-nudge failed:', error)
    return jsonResponse({ error: (error as Error).message, ...result }, 500)
  }
})
