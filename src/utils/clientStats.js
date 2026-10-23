// Shared client-stat computation. Extracted from CoachDashboard so the coach
// dashboard AND the notification bell derive the exact same facts (days since
// log, this-week check-in, 7-day compliance counts, lock state) and can never
// drift. Pure data — returns the stats map, no React/setState.
import { supabase } from '../supabase'
import { resolveLockState } from './lockState'
import { toLocalDateString, checkinPeriod } from './dateHelpers'
import { latestCheckIn, coversPeriod } from './checkinLookup'

// relationships: [{ client_id, created_at, lock_cleared_at, checkin_interval_weeks }]
// — needed for lock state + per-client check-in cadence. Pass [] to skip lock
// resolution (stats still compute, lock = active, cadence = weekly).
export async function computeClientStats(clientIds, relationships = []) {
  if (!clientIds || clientIds.length === 0) return {}

  const sevenDaysAgo = toLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  const today = toLocalDateString(new Date())
  // Each client's "current check-in" depends on their cadence, so fetch a
  // window wide enough to cover the longest interval and match per client.
  const checkInWindowStart = toLocalDateString(new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000))

  const [logsResult, checkInsResult, nutritionResult, cardioResult, stepsResult, targetsResult] = await Promise.all([
    // One row per client (the date they last logged), NOT their whole history.
    // This used to select every nutrition_log row for every client just to read
    // the newest one per client — unbounded, and silently wrong under a
    // db-max-rows cap, which truncates the oldest rows and so loses exactly the
    // dormant clients the roster needs to flag. The group-by lives in the
    // client_last_log_dates RPC because PostgREST aggregates are disabled here.
    // RLS still scopes it: the function is SECURITY INVOKER.
    supabase.rpc('client_last_log_dates', { p_client_ids: clientIds }),
    supabase.from('check_ins').select('*').in('client_id', clientIds).gte('week_of', checkInWindowStart),
    supabase.from('nutrition_log').select('user_id, logged_date, calories, protein').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
    supabase.from('cardio_log').select('user_id, logged_date, duration').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
    supabase.from('steps_log').select('user_id, logged_date, steps').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
    supabase.from('targets').select('user_id, calories, protein, cardio_minutes, steps').in('user_id', clientIds),
  ])

  const lastLogDates = new Map((logsResult.data || []).map(r => [r.user_id, r.last_logged_date]))
  const checkIns = checkInsResult.data || []
  const nutritionData = nutritionResult.data || []
  const cardioData = cardioResult.data || []
  const stepsData = stepsResult.data || []
  const targetsData = targetsResult.data || []

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i); return toLocalDateString(d)
  })

  const stats = {}
  clientIds.forEach(id => {
    const lastLogDate = lastLogDates.get(id) || null
    const relationship = relationships.find(r => r.client_id === id)
    const lockInfo = relationship ? resolveLockState({
      lastNutritionDate: lastLogDate,
      connectionCreatedAt: relationship.created_at?.split('T')[0],
      lockClearedAt: relationship.lock_cleared_at
    }) : { locked: false, days: 0, reason: 'active' }
    const todayStr = toLocalDateString(new Date())
    let daysSinceLog = null
    if (lastLogDate) daysSinceLog = Math.max(0, Math.floor((new Date(todayStr) - new Date(lastLogDate)) / 86400000))

    // Resolve THIS client's current-period check-in from their cadence.
    const interval = relationship?.checkin_interval_weeks || 1
    const period = checkinPeriod(interval)
    // The LATEST, not one matched to this period's key — see checkinLookup.js.
    // Matching the key meant a check-in filed under a shorter cadence vanished
    // the moment the coach lengthened it, and the roster called the client
    // overdue the day after they checked in.
    const checkIn = latestCheckIn(checkIns.filter(c => c.client_id === id))
    const checkInCurrent = coversPeriod(checkIn, period)
    const clientTargets = targetsData.find(t => t.user_id === id)


    const complianceItems = []

    if (clientTargets?.calories) {
      let count = 0
      let logged = 0
      last7Days.forEach(date => {
        const dayTotal = nutritionData.filter(n => n.user_id === id && n.logged_date === date).reduce((sum, n) => sum + (n.calories || 0), 0)
        if (dayTotal > 0) logged++
        if (dayTotal > 0 && dayTotal >= clientTargets.calories * 0.9) count++
      })
      complianceItems.push({ label: 'Calories', value: count, logged, hasData: logged > 0 })
    }

    if (clientTargets?.protein) {
      let count = 0
      let logged = 0
      last7Days.forEach(date => {
        const dayTotal = nutritionData.filter(n => n.user_id === id && n.logged_date === date).reduce((sum, n) => sum + (n.protein || 0), 0)
        if (dayTotal > 0) logged++
        if (dayTotal > 0 && dayTotal >= clientTargets.protein * 0.9) count++
      })
      complianceItems.push({ label: 'Protein', value: count, logged, hasData: logged > 0 })
    }

    if (clientTargets?.cardio_minutes) {
      let count = 0
      let logged = 0
      last7Days.forEach(date => {
        const dayTotal = cardioData.filter(c => c.user_id === id && c.logged_date === date).reduce((sum, c) => sum + (c.duration || 0), 0)
        if (dayTotal > 0) logged++
        if (dayTotal > 0 && dayTotal >= clientTargets.cardio_minutes * 0.9) count++
      })
      complianceItems.push({ label: 'Cardio', value: count, logged, hasData: logged > 0 })
    }

    if (clientTargets?.steps) {
      let count = 0
      let logged = 0
      last7Days.forEach(date => {
        const daySteps = stepsData.find(s => s.user_id === id && s.logged_date === date)
        if ((daySteps?.steps || 0) > 0) logged++
        if ((daySteps?.steps || 0) > 0 && daySteps.steps >= clientTargets.steps * 0.9) count++
      })
      complianceItems.push({ label: 'Steps', value: count, logged, hasData: logged > 0 })
    }

    stats[id] = { lastLogDate, daysSinceLog, checkIn, checkInCurrent, complianceItems, lockInfo, checkinInterval: interval, checkinDue: period.dueWindow }
  })

  return stats
}

// A client's own action-items, for the client-facing bell alerts. Mirrors the
// signals the dashboard already shows (lock banner, "To do" check-in badge,
// coach-nudge banner) so the bell and the page agree. Returns hasCoach:false
// when there's no active coach (none of these apply to solo users).
const NUDGE_WINDOW_MS = 48 * 60 * 60 * 1000

export async function computeClientAlerts(userId) {
  const { data: connection } = await supabase
    .from('coach_clients')
    .select('created_at, lock_cleared_at, last_nudged_at, checkin_interval_weeks')
    .eq('client_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (!connection) return { hasCoach: false, lock: null, checkInDue: false, nudged: false }

  const today = toLocalDateString(new Date())
  const period = checkinPeriod(connection.checkin_interval_weeks || 1)
  const [lastLogRes, checkInRes] = await Promise.all([
    supabase.from('nutrition_log').select('logged_date').eq('user_id', userId).order('logged_date', { ascending: false }).limit(1).maybeSingle(),
    // Same rule as the coach's side: the latest one, then a range test. Keyed
    // on week_of this told a client their check-in was still due the day after
    // they filed it, if their coach had just lengthened the cadence.
    supabase.from('check_ins').select('id, week_of').eq('client_id', userId)
      .order('week_of', { ascending: false }).limit(1),
  ])

  const lastLogDate = lastLogRes.data?.logged_date || null
  const loggedToday = lastLogDate === today

  const lock = resolveLockState({
    lastNutritionDate: lastLogDate,
    connectionCreatedAt: connection.created_at.split('T')[0],
    lockClearedAt: connection.lock_cleared_at || null,
  })

  // Only prompt in the period's due window (its last 3 days) — the same
  // restraint as the coach's Nudge button, so we don't nag at the start.
  const checkInDue = !coversPeriod(latestCheckIn(checkInRes.data || []), period) && period.dueWindow
  const nudgedRecently = connection.last_nudged_at &&
    (Date.now() - new Date(connection.last_nudged_at).getTime() < NUDGE_WINDOW_MS)

  return { hasCoach: true, lock, checkInDue, nudged: Boolean(nudgedRecently && !loggedToday) }
}
