import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { parseLocalDateString, toLocalDateString, addDays } from '../utils/dateHelpers'
import { convertWeight, normUnit, unitLabel } from '../utils/weightTarget'

// The numbers for the period a check-in covers (see components/CheckinWeek).

const kfmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString())

async function loadWeek(clientId, weekOf, intervalWeeks) {
  const start = parseLocalDateString(weekOf)
  const fullEnd = addDays(start, Math.max(1, intervalWeeks) * 7 - 1)
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const end = fullEnd < today ? fullEnd : today
  const from = toLocalDateString(start)
  const to = toLocalDateString(end)
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1)
  const [food, weights, before, steps, targets] = await Promise.all([
    supabase.from('nutrition_log').select('logged_date, calories').eq('user_id', clientId).gte('logged_date', from).lte('logged_date', to),
    supabase.from('weight_log').select('logged_date, weight, unit').eq('user_id', clientId).gte('logged_date', from).lte('logged_date', to)
      .order('logged_date', { ascending: false }).order('weighed_at', { ascending: false }).limit(1),
    supabase.from('weight_log').select('logged_date, weight, unit').eq('user_id', clientId).lt('logged_date', from)
      .order('logged_date', { ascending: false }).order('weighed_at', { ascending: false }).limit(1),
    supabase.from('steps_log').select('logged_date, steps').eq('user_id', clientId).gte('logged_date', from).lte('logged_date', to),
    supabase.from('targets').select('calories').eq('user_id', clientId).maybeSingle(),
  ])
  const err = [food, weights, before, steps, targets].find(r => r.error)
  if (err) throw err.error
  const byDay = {}
  for (const r of food.data || []) byDay[r.logged_date] = (byDay[r.logged_date] || 0) + (r.calories || 0)
  const logged = Object.values(byDay).filter(c => c > 0)
  const stepDays = (steps.data || []).filter(r => r.steps > 0)
  return {
    days,
    logged: logged.length,
    avgCalories: logged.length ? logged.reduce((a, b) => a + b, 0) / logged.length : null,
    calorieTarget: Number(targets.data?.calories) || null,
    avgSteps: stepDays.length ? stepDays.reduce((a, r) => a + r.steps, 0) / stepDays.length : null,
    weight: weights.data?.[0] || null,
    weightBefore: before.data?.[0] || null,
  }
}

// The period's four cells, [{ label, value, sub }], or null while loading /
// after a failure. Shared by the strip below and the compare view's rows.
export function useCheckinWeekCells(clientId, weekOf, intervalWeeks = 1, weightUnit = null) {
  const [week, setWeek] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!clientId || !weekOf) return undefined
    let live = true
    loadWeek(clientId, weekOf, intervalWeeks)
      .then(w => { if (live) { setWeek(w); setFailed(false) } })
      .catch(e => { console.error(e); if (live) setFailed(true) })
    return () => { live = false }
  }, [clientId, weekOf, intervalWeeks])

  if (failed || !week) return null
  const unit = weightUnit || normUnit(week?.weight?.unit)
  const w = (row) => Math.round(convertWeight(Number(row.weight), normUnit(row.unit), unit) * 10) / 10
  const delta = week?.weight && week?.weightBefore ? Math.round((w(week.weight) - w(week.weightBefore)) * 10) / 10 : null

  return [
    {
      label: 'Weight',
      value: week.weight ? `${w(week.weight).toFixed(1)} ${unitLabel(unit)}` : '—',
      sub: delta == null ? null : delta === 0 ? 'No change' : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}`,
    },
    { label: 'Logged', value: `${week.logged}/${week.days}`, sub: 'days' },
    {
      label: 'Calories',
      value: week.avgCalories == null ? '—' : week.calorieTarget ? `${Math.round((week.avgCalories / week.calorieTarget) * 100)}%` : kfmt(week.avgCalories),
      sub: week.avgCalories == null ? null : week.calorieTarget ? 'of target' : 'a day',
    },
    { label: 'Steps', value: week.avgSteps == null ? '—' : kfmt(week.avgSteps), sub: week.avgSteps == null ? null : 'a day' },
  ]
}
