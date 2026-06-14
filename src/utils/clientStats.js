// Shared client-stat computation. Extracted from CoachDashboard so the coach
// dashboard AND the notification bell derive the exact same facts (days since
// log, this-week check-in, 7-day compliance counts, lock state) and can never
// drift. Pure data — returns the stats map, no React/setState.
import { supabase } from '../supabase'
import { resolveLockState } from './lockState'
import { getCurrentWeekSunday, toLocalDateString } from './dateHelpers'

// relationships: [{ client_id, created_at, lock_cleared_at }] — needed for lock
// state. Pass [] to skip lock resolution (stats still compute, lock = active).
export async function computeClientStats(clientIds, relationships = []) {
  if (!clientIds || clientIds.length === 0) return {}

  const weekOf = getCurrentWeekSunday()
  const sevenDaysAgo = toLocalDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  const today = toLocalDateString(new Date())

  const [logsResult, checkInsResult, nutritionResult, cardioResult, stepsResult, targetsResult] = await Promise.all([
    supabase.from('nutrition_log').select('user_id, logged_date').in('user_id', clientIds).order('logged_date', { ascending: false }),
    supabase.from('check_ins').select('*').in('client_id', clientIds).eq('week_of', weekOf),
    supabase.from('nutrition_log').select('user_id, logged_date, calories, protein').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
    supabase.from('cardio_log').select('user_id, logged_date, duration').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
    supabase.from('steps_log').select('user_id, logged_date, steps').in('user_id', clientIds).gte('logged_date', sevenDaysAgo).lte('logged_date', today),
    supabase.from('targets').select('user_id, calories, protein, cardio_minutes, steps').in('user_id', clientIds),
  ])

  const recentLogs = logsResult.data || []
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
    const clientLogs = recentLogs.filter(l => l.user_id === id)
    const lastLogDate = clientLogs.length > 0 ? clientLogs[0].logged_date : null
    const relationship = relationships.find(r => r.client_id === id)
    const lockInfo = relationship ? resolveLockState({
      lastNutritionDate: lastLogDate,
      connectionCreatedAt: relationship.created_at?.split('T')[0],
      lockClearedAt: relationship.lock_cleared_at
    }) : { locked: false, days: 0, reason: 'active' }
    const todayStr = toLocalDateString(new Date())
    let daysSinceLog = null
    if (lastLogDate) daysSinceLog = Math.max(0, Math.floor((new Date(todayStr) - new Date(lastLogDate)) / 86400000))

    const checkIn = checkIns.find(c => c.client_id === id) || null
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

    stats[id] = { lastLogDate, daysSinceLog, checkIn, complianceItems, lockInfo }
  })

  return stats
}

// A single client's own lock state (for the client-facing bell alert). Returns
// null when the client has no active coach (lock never applies).
export async function computeClientLock(userId) {
  const { data: connection } = await supabase
    .from('coach_clients')
    .select('created_at, lock_cleared_at')
    .eq('client_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (!connection) return null

  const { data: lastLog } = await supabase
    .from('nutrition_log')
    .select('logged_date')
    .eq('user_id', userId)
    .order('logged_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return resolveLockState({
    lastNutritionDate: lastLog?.logged_date || null,
    connectionCreatedAt: connection.created_at.split('T')[0],
    lockClearedAt: connection.lock_cleared_at || null,
  })
}
