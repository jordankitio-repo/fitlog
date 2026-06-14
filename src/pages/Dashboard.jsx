import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'
import Button from '../components/Button'
import Skeleton from '../components/Skeleton'
import SectionHeader from '../components/SectionHeader'
import SoloUpgrade from '../components/SoloUpgrade'
import ComplianceHeatmap from '../components/ComplianceHeatmap'
import ComplianceSummary from '../components/ComplianceSummary'
import InfoTip from '../components/InfoTip'
import ChartColorToggle from '../components/ChartColorToggle'
import { CONSISTENCY_TIPS } from '../utils/consistencyTips'
import { metricBarData } from '../utils/metricBarChart'
import { usePlainCharts } from '../utils/usePlainCharts'
import { CHART } from '../utils/chartTheme'
import Reorderable from '../components/Reorderable'
import { resolveLockState } from '../utils/lockState'
import { getCurrentWeekSunday, toLocalDateString, parseLocalDateString } from '../utils/dateHelpers'
import { cardStyle as baseCardStyle } from '../utils/styles'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler
)

function computeRollingAverage(data, window = 7) {
  return data.map((_, i) => {
    const start = Math.max(0, i - window + 1)
    const slice = data.slice(start, i + 1)
    const avg = slice.reduce((sum, d) => sum + d.weight, 0) / slice.length
    return Math.round(avg * 10) / 10
  })
}

function Dashboard({ profile, hasSoloPremium = true }) {
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [weightEntry, setWeightEntry] = useState(null)
  const [reports, setReports] = useState([])
  const [weightHistory, setWeightHistory] = useState([])
  const [plainCharts, togglePlain] = usePlainCharts()
  const [calorieHistory, setCalorieHistory] = useState([])
  const [targets, setTargets] = useState(null)
  const [cardioToday, setCardioToday] = useState({ minutes: 0, sessions: 0 })
  const [stepsToday, setStepsToday] = useState(null)
  const [cardioHistory, setCardioHistory] = useState([])
  const [stepsHistory, setStepsHistory] = useState([])
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [checkIn, setCheckIn] = useState({ adherence_rating: 5, energy_level: 5, obstacles: '', notes: '' })
  const [checkInSaved, setCheckInSaved] = useState(false)
  const [existingCheckIn, setExistingCheckIn] = useState(null)
  const [streak, setStreak] = useState(0)
  const [bestWeek, setBestWeek] = useState(null)
  const [consistency, setConsistency] = useState(null)
  const [heatmapData, setHeatmapData] = useState({})
  const [milestone, setMilestone] = useState(null)
  const [loggedToday, setLoggedToday] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [cardOrder, setCardOrder] = useState(profile?.layout?.dashboard || [])

  async function saveCardOrder(next) {
    setCardOrder(next)
    const { error } = await supabase
      .from('profiles')
      .update({ layout: { ...(profile?.layout || {}), dashboard: next } })
      .eq('id', profile.id)
    if (error) console.error(error)
  }
  const [pageLoading, setPageLoading] = useState(true)
  const [lockInfo, setLockInfo] = useState({ locked: false, days: 0, reason: 'active' })
  const [hideCalories, setHideCalories] = useState(false)
  const [showOffboardNotice, setShowOffboardNotice] = useState(false)
  const [offboardReason, setOffboardReason] = useState(null)
  const [showNudgeNotice, setShowNudgeNotice] = useState(false)
  const [nudgeTimestamp, setNudgeTimestamp] = useState('')
  const [showSelfOffboardConfirm, setShowSelfOffboardConfirm] = useState(false)
  const [selfOffboarding, setSelfOffboarding] = useState(false)
  const [selfOffboardError, setSelfOffboardError] = useState('')

  // Section collapse state
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    reports: false,
    checkin: false,
    stats: false,
    targets: false,
    weightChart: false,
    calorieChart: false,
    cardioChart: false,
    stepsChart: false,
  })
  const [collapsedWeeks, setCollapsedWeeks] = useState({})

  function formatTime(timeStr) {
    if (!timeStr) return null
    const [hours, minutes] = timeStr.split(':')
    const h = parseInt(hours)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${minutes} ${ampm}`
  }

  const [searchParams, setSearchParams] = useSearchParams()
  // Deep-link from a notification (?focus=reports): expand + scroll to it.
  // 'chat' is handled by ChatBubble.
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus || focus === 'chat') return
    let timer, tries = 0
    const scrollWhenReady = () => {
      const el = document.getElementById('section-' + focus)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else if (tries++ < 20) timer = setTimeout(scrollWhenReady, 100)
    }
    const raf = requestAnimationFrame(() => {
      setSectionsCollapsed(prev => ({ ...prev, [focus]: false }))
      timer = setTimeout(scrollWhenReady, 80)
    })
    const sp = new URLSearchParams(searchParams)
    sp.delete('focus')
    setSearchParams(sp, { replace: true })
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [searchParams, setSearchParams])

  function toggleSection(key) {
    setSectionsCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
    async function loadPage() {
      setPageLoading(true)
      await Promise.all([
        fetchTotals(),
        fetchWeight(),
        fetchReports(),
        fetchWeightHistory(),
        fetchCalorieHistory(),
        fetchTargets(),
        fetchCardioToday(),
        fetchStepsToday(),
        fetchCardioHistory(),
        fetchStepsHistory(),
        fetchStreak(),
        fetchNutritionAnalytics(),
      ])
      if (profile?.role === 'client') {
        await Promise.all([fetchCheckIn(), fetchLockState(), fetchNudgeNotice()])
      }
      if (profile?.role === 'solo') {
        await fetchOffboardNotice()
      }
      setPageLoading(false)
    }
    loadPage()
  }, [selectedDate])

  useEffect(() => {
    const MILESTONES = [7, 14, 30, 60, 90]
    // Clients and solo users both get the in-app celebration. The edge function
    // records the streak and only emails a coach when an active relationship
    // exists, so solo users (no coach) get the banner with no email side effect.
    if ((profile?.role !== 'client' && profile?.role !== 'solo') || !streak || !MILESTONES.includes(streak)) return

    async function fireMilestone() {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession) return

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/milestone-reached`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${currentSession.access_token}`,
            },
            body: JSON.stringify({ streakCount: streak }),
          },
        )
        const result = await res.json()
        if (result?.ok && result?.milestone) {
          setMilestone(result.milestone)
        }
      } catch (error) {
        console.error('Milestone check failed:', error)
      }
    }

    fireMilestone()
  }, [streak, profile?.role])

  async function fetchTotals() {
    const { data, error } = await supabase
      .from('nutrition_log').select('calories, protein, carbs, fat')
      .eq('logged_date', selectedDate)
    if (error) { console.error(error); return }
    const totals = data.reduce((acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
    setTotals(totals)
  }

  async function fetchWeight() {
    const { data, error } = await supabase
      .from('weight_log')
      .select('*')
      .eq('logged_date', selectedDate)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) { console.error(error); return }
    setWeightEntry(data?.[0] ?? null)
  }

  async function fetchReports() {
    const { data, error } = await supabase
      .from('reports').select('*').order('created_at', { ascending: false })
    if (error) console.error(error)
    else {
      setReports(data)
      // Auto-expand weeks with unread reports
      const grouped = {}
      data.filter(r => !r.archived).forEach(r => {
        if (!grouped[r.week_of]) grouped[r.week_of] = []
        grouped[r.week_of].push(r)
      })
      const newCollapsed = {}
      Object.entries(grouped).forEach(([week, weekReports]) => {
        const hasUnread = weekReports.some(r => !r.read_at)
        newCollapsed[week] = !hasUnread // expand if unread, collapse if all read
      })
      setCollapsedWeeks(newCollapsed)
    }
  }

  async function markAsRead(reportIds) {
    await supabase
      .from('reports')
      .update({ read_at: new Date().toISOString() })
      .in('id', reportIds)
      .is('read_at', null)
    fetchReports()
  }

  async function archiveReport(reportId) {
    await supabase.from('reports').update({ archived: true }).eq('id', reportId)
    fetchReports()
  }

  async function unarchiveReport(reportId) {
    await supabase.from('reports').update({ archived: false }).eq('id', reportId)
    fetchReports()
  }

  async function fetchWeightHistory() {
    const { data, error } = await supabase
      .from('weight_log').select('logged_date, weight, unit')
      .order('logged_date', { ascending: true }).limit(30)
    if (error) console.error(error)
    else setWeightHistory(data.map(d => ({ date: d.logged_date.slice(5), weight: parseFloat(d.weight) })))
  }

  async function fetchCalorieHistory() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)
    const { data, error } = await supabase
      .from('nutrition_log').select('logged_date, calories')
      .gte('logged_date', start.toISOString().split('T')[0])
      .lte('logged_date', end.toISOString().split('T')[0])
    if (error) console.error(error)
    else {
      const grouped = {}
      data.forEach(e => { grouped[e.logged_date] = (grouped[e.logged_date] || 0) + e.calories })
      setCalorieHistory(Object.entries(grouped).map(([date, calories]) => ({
        date: date.slice(5), calories
      })).sort((a, b) => a.date.localeCompare(b.date)))
    }
  }

  // Logging-consistency self-analytics, all from one 90-day nutrition pull:
  // best week, weekday/weekend split, and the heatmap grid. Purely descriptive —
  // reports the user's own consistency, never prescribes or adjusts a plan.
  async function fetchNutritionAnalytics() {
    const start = new Date()
    start.setDate(start.getDate() - 97)
    const { data, error } = await supabase
      .from('nutrition_log').select('logged_date, calories')
      .gte('logged_date', toLocalDateString(start))
    if (error) { console.error(error); return }

    // Heatmap: total calories per logged date.
    const byDate = {}
    data.forEach(e => {
      if (!byDate[e.logged_date]) byDate[e.logged_date] = { calories: 0 }
      byDate[e.logged_date].calories += e.calories || 0
    })
    setHeatmapData(byDate)

    const loggedDates = new Set(Object.keys(byDate))

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Best week: most logged days in any Sun–Sat window over the last 13 weeks.
    const currentWeekStart = new Date(today)
    currentWeekStart.setDate(today.getDate() - today.getDay())
    let best = null
    let bestCount = -1
    for (let w = 0; w < 13; w++) {
      const weekStart = new Date(currentWeekStart)
      weekStart.setDate(currentWeekStart.getDate() - w * 7)
      const count = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
        return toLocalDateString(d)
      }).filter(d => loggedDates.has(d)).length
      if (count > bestCount) {
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 6)
        bestCount = count
        best = { count, startDate: weekStart, endDate: weekEnd }
      }
    }
    setBestWeek(best)

    // Weekday vs weekend logging over the last 30 days.
    const last30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - i)
      return { dateStr: toLocalDateString(d), dow: d.getDay() }
    })
    const weekday = last30.filter(o => o.dow >= 1 && o.dow <= 5)
    const weekend = last30.filter(o => o.dow === 0 || o.dow === 6)
    setConsistency({
      weekdayLogged: weekday.filter(o => loggedDates.has(o.dateStr)).length,
      weekdayTotal: weekday.length,
      weekendLogged: weekend.filter(o => loggedDates.has(o.dateStr)).length,
      weekendTotal: weekend.length,
    })
  }

  async function fetchTargets() {
    const { data, error } = await supabase
      .from('targets').select('*')
      .eq('user_id', (await supabase.auth.getSession()).data.session.user.id)
      .maybeSingle()
    if (error) console.error(error)
    else setTargets(data)
  }

  async function fetchCardioToday() {
    const { data, error } = await supabase
      .from('cardio_log').select('duration').eq('logged_date', selectedDate)
    if (error) console.error(error)
    else setCardioToday({
      minutes: data.reduce((sum, e) => sum + (e.duration || 0), 0),
      sessions: data.length
    })
  }

  async function fetchStepsToday() {
    const { data, error } = await supabase
      .from('steps_log').select('*').eq('logged_date', selectedDate).maybeSingle()
    if (error) console.error(error)
    else setStepsToday(data)
  }

  async function fetchCardioHistory() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)
    const { data, error } = await supabase
      .from('cardio_log').select('logged_date, duration')
      .gte('logged_date', start.toISOString().split('T')[0])
      .lte('logged_date', end.toISOString().split('T')[0])
    if (error) console.error(error)
    else {
      const grouped = {}
      data.forEach(e => { grouped[e.logged_date] = (grouped[e.logged_date] || 0) + e.duration })
      setCardioHistory(Object.entries(grouped).map(([date, minutes]) => ({
        date: date.slice(5), minutes
      })).sort((a, b) => a.date.localeCompare(b.date)))
    }
  }

  async function fetchStepsHistory() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 29)
    const { data, error } = await supabase
      .from('steps_log').select('logged_date, steps')
      .gte('logged_date', start.toISOString().split('T')[0])
      .lte('logged_date', end.toISOString().split('T')[0])
    if (error) console.error(error)
    else setStepsHistory(data.map(d => ({
      date: d.logged_date.slice(5), steps: d.steps
    })).sort((a, b) => a.date.localeCompare(b.date)))
  }

  async function fetchStreak() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const { data, error } = await supabase
      .from('nutrition_log')
      .select('logged_date')
      .eq('user_id', currentSession.user.id)
      .gte('logged_date', toLocalDateString(new Date(new Date().setDate(new Date().getDate() - 60))))
      .order('logged_date', { ascending: false })
    if (error) { console.error(error); return }
    const loggedDates = [...new Set(data.map(e => e.logged_date))]
    const today = new Date()
    const startOffset = loggedDates.includes(toLocalDateString(today)) ? 0 : 1
    let count = 0
    for (let i = startOffset; i < 60; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (loggedDates.includes(toLocalDateString(d))) count++
      else break
    }
    setLoggedToday(loggedDates.includes(toLocalDateString(today)))
    setStreak(count)
  }

  // Client messaging moved to <ClientChat>, mounted globally in App so the
  // bubble is available on every page (not just the dashboard).

  async function fetchCheckIn() {
    const weekOf = getCurrentWeekSunday()
    const { data, error } = await supabase
      .from('check_ins').select('*')
      .eq('client_id', (await supabase.auth.getSession()).data.session.user.id)
      .eq('week_of', weekOf).maybeSingle()
    if (error) console.error(error)
    else if (data) {
      setExistingCheckIn(data)
      setCheckIn({
        adherence_rating: data.adherence_rating || 5,
        energy_level: data.energy_level || 5,
        obstacles: data.obstacles || '',
        notes: data.notes || ''
      })
    }
  }

  async function saveCheckIn() {
    if (!checkIn.obstacles.trim()) {
      alert('Please fill in the obstacles field before submitting.')
      return
    }
    if (!checkIn.notes.trim()) {
      alert('Please fill in the notes for your coach before submitting.')
      return
    }

    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const weekOf = getCurrentWeekSunday()

    // Get coach info
    const { data: coachRelation } = await supabase
      .from('coach_clients')
      .select('coach_id')
      .eq('client_id', currentSession.user.id)
      .eq('status', 'active')
      .maybeSingle()

    // Used only to decide whether there's a coach to notify; the notify-checkin
    // function derives the recipient + names server-side from the caller.
    let coachEmail = null
    if (coachRelation) {
      const { data: coachProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', coachRelation.coach_id)
        .single()
      coachEmail = coachProfile?.email
    }

    const { error } = await supabase.from('check_ins').upsert({
      client_id: currentSession.user.id, week_of: weekOf,
      adherence_rating: checkIn.adherence_rating, energy_level: checkIn.energy_level,
      obstacles: checkIn.obstacles, notes: checkIn.notes
    }, { onConflict: 'client_id,week_of' })
    if (error) console.error(error)
    else {
      setCheckInSaved(true); setShowCheckIn(false); fetchCheckIn(); setTimeout(() => setCheckInSaved(false), 3000)
      // Notify coach by email
      if (coachEmail) {
        fetch('https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/notify-checkin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
          body: JSON.stringify({
            adherence: checkIn.adherence_rating,
            energy: checkIn.energy_level,
            obstacles: checkIn.obstacles,
            notes: checkIn.notes
          }),
        })
      }
    }
  }

  async function fetchLockState() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const { data: connection } = await supabase
      .from('coach_clients')
      .select('id, created_at, lock_cleared_at, hide_calories')
      .eq('client_id', currentSession.user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!connection) {
      setHideCalories(false)
      return // no active coach — lock never applies
    }
    setHideCalories(Boolean(connection.hide_calories))
    const { data: lastLog } = await supabase
      .from('nutrition_log')
      .select('logged_date')
      .eq('user_id', currentSession.user.id)
      .order('logged_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const result = resolveLockState({
      lastNutritionDate: lastLog?.logged_date || null,
      connectionCreatedAt: connection.created_at.split('T')[0],
      lockClearedAt: connection.lock_cleared_at || null,
    })
    setLockInfo(result)
  }

  async function fetchOffboardNotice() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (!currentSession) return

    const { data } = await supabase
      .from('profiles')
      .select('offboarded_at, offboard_reason')
      .eq('id', currentSession.user.id)
      .maybeSingle()

    const coachInitiated =
      data?.offboard_reason === 'coach_offboarded' ||
      data?.offboard_reason === 'coach_deleted'

    if (!data?.offboarded_at || !coachInitiated) return

    setOffboardReason(data.offboard_reason)
    setShowOffboardNotice(true)
  }

  async function fetchNudgeNotice() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (!currentSession?.user?.id) return

    const { data: connection, error: connectionError } = await supabase
      .from('coach_clients')
      .select('last_nudged_at')
      .eq('client_id', currentSession.user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (connectionError) {
      console.error(connectionError)
      return
    }

    const lastNudgedAt = connection?.last_nudged_at
    if (!lastNudgedAt) {
      setShowNudgeNotice(false)
      return
    }

    const nudgeTime = new Date(lastNudgedAt).getTime()
    const isRecent = Date.now() - nudgeTime < 48 * 60 * 60 * 1000
    if (!isRecent) {
      setShowNudgeNotice(false)
      return
    }

    const dismissed = localStorage.getItem(`nudge_dismissed_${currentSession.user.id}_${lastNudgedAt}`)
    if (dismissed) {
      setShowNudgeNotice(false)
      return
    }

    const { data: todayLog, error: logError } = await supabase
      .from('nutrition_log')
      .select('id')
      .eq('user_id', currentSession.user.id)
      .eq('logged_date', toLocalDateString(new Date()))
      .limit(1)
      .maybeSingle()

    if (logError) {
      console.error(logError)
      return
    }

    setNudgeTimestamp(lastNudgedAt)
    setShowNudgeNotice(!todayLog)
  }

  async function selfOffboard() {
    setSelfOffboarding(true)
    setSelfOffboardError('')

    const { error } = await supabase.functions.invoke('offboard-self')

    if (error) {
      setSelfOffboardError(error.message)
      setSelfOffboarding(false)
      return
    }

    await supabase.auth.refreshSession()
    setTimeout(() => window.location.reload(), 800)
  }

  const isToday = selectedDate === toLocalDateString(new Date())
  function goToPrevDay() { const d = parseLocalDateString(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toLocalDateString(d)) }
  function goToNextDay() { const d = parseLocalDateString(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toLocalDateString(d)) }

  const inputStyle = {
    backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)', padding: '6px 12px',
    color: 'var(--color-text)', fontSize: '1rem'
  }
  const chartOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: {
        display: true,
        labels: {
          color: CHART.tick,
          boxWidth: 12,
          padding: 12,
          font: { size: 11 },
        }
      },
      tooltip: {
        backgroundColor: CHART.tooltipBg,
        borderColor: CHART.tooltipBorder,
        borderWidth: 1,
        titleColor: CHART.tooltipTitle,
        bodyColor: CHART.tooltipBody,
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
      }
    },
    scales: {
      x: { ticks: { color: CHART.tick }, grid: { color: CHART.grid } },
      y: { ticks: { color: CHART.tick }, grid: { color: CHART.grid } }
    }
  }
  const cardStyle = {
    ...baseCardStyle,
    display: 'flex', flexDirection: 'column', gap: '12px'
  }
  const activeReports = reports.filter(r => !r.archived)
  const archivedReports = reports.filter(r => r.archived)
  const unreadCount = activeReports.filter(r => !r.read_at).length

  const groupByWeek = (list) => {
    const grouped = {}
    list.forEach(r => {
      if (!grouped[r.week_of]) grouped[r.week_of] = []
      grouped[r.week_of].push(r)
    })
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))
  }

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {pageLoading ? (
        <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Streak skeleton */}
          <Skeleton height="100px" />

          {/* Date nav skeleton */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Skeleton width="40px" height="38px" />
            <Skeleton width="140px" height="38px" />
            <Skeleton width="40px" height="38px" />
          </div>

          {/* Stats skeleton */}
          <div style={cardStyle}>
            <Skeleton height="22px" width="120px" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              {[...Array(6)].map((_, i) => <Skeleton key={i} height="72px" />)}
            </div>
          </div>

          {/* Targets skeleton */}
          <div style={{ ...cardStyle, gap: '14px' }}>
            <Skeleton height="22px" width="140px" />
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Skeleton height="14px" width="70px" />
                  <Skeleton height="14px" width="110px" />
                </div>
                <Skeleton height="6px" borderRadius="3px" />
              </div>
            ))}
          </div>

          {/* Chart skeleton */}
          <div style={cardStyle}>
            <Skeleton height="22px" width="160px" />
            <Skeleton height="180px" />
          </div>
        </div>
	      ) : (
	      <>
	      {milestone && (
	        <div style={{
	          background: 'linear-gradient(135deg, var(--color-surface-2) 0%, #1f2a1f 100%)',
	          border: '1px solid #34d399',
	          borderRadius: 'var(--radius)',
	          padding: '16px 20px',
	          display: 'flex',
	          alignItems: 'center',
	          justifyContent: 'space-between',
	          gap: 16,
	        }}>
	          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
	            <span style={{ fontSize: '1.5rem' }}>🔥</span>
	            <div>
	              <p style={{ fontWeight: 700, color: '#34d399', margin: 0, fontSize: 'var(--text-md)' }}>
	                {milestone}-day streak!
	              </p>
	              <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: 'var(--text-xs)' }}>
	                {milestone === 7 && 'One week straight. Keep it going.'}
	                {milestone === 14 && "Two weeks consistent. You're building a habit."}
	                {milestone === 30 && '30 days. This is who you are now.'}
	                {milestone === 60 && '60 days. Seriously impressive.'}
	                {milestone === 90 && "90 days. You've changed your life."}
	              </p>
	            </div>
	          </div>
	          <button
	            onClick={() => setMilestone(null)}
	            style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1rem', padding: 4 }}
	          >
	            ✕
	          </button>
	        </div>
	      )}

	      {showOffboardNotice && (
	        <div style={{
	          padding: '14px 16px',
	          border: '1px solid var(--color-border)',
	          borderLeft: '4px solid #f87171',
	          borderRadius: 'var(--radius)',
	          backgroundColor: 'rgba(248,113,113,0.05)',
	          display: 'flex',
	          justifyContent: 'space-between',
	          alignItems: 'flex-start',
	          gap: '12px'
	        }}>
	          <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', margin: 0, lineHeight: '1.6' }}>
	            {offboardReason === 'coach_deleted'
	              ? "Your coach's account was closed. Your data is preserved — you're now on a solo plan and can keep tracking on your own."
	              : "Your coach ended the coaching relationship. Your data is preserved — you're now on a solo plan and can keep tracking on your own."
	            }
	          </p>
	          <button
	            onClick={async () => {
	              const { data: { session } } = await supabase.auth.getSession()
	              if (session) {
	                const { error } = await supabase
	                  .from('profiles')
	                  .update({ offboarded_at: null, offboard_reason: null })
	                  .eq('id', session.user.id)
	                if (error) console.warn('Failed to clear offboard notice:', error.message)
	              }
	              setShowOffboardNotice(false)
	            }}
	            style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1rem', padding: '0', flexShrink: 0 }}
	          >
	            ✕
	          </button>
	        </div>
	      )}

	      {showNudgeNotice && (
	        <div style={{
	          padding: '14px 16px',
	          border: '1px solid var(--color-border)',
	          borderLeft: '4px solid var(--color-primary)',
	          borderRadius: 'var(--radius)',
	          backgroundColor: 'var(--color-primary-dim)',
	          display: 'flex',
	          justifyContent: 'space-between',
	          alignItems: 'flex-start',
	          gap: '12px'
	        }}>
	          <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', margin: 0, lineHeight: '1.6' }}>
	            Your coach checked in on you. Log your nutrition today to keep your progress on track.
	          </p>
	          <button
	            onClick={() => {
	              localStorage.setItem(`nudge_dismissed_${profile.id}_${nudgeTimestamp}`, 'true')
	              setShowNudgeNotice(false)
	            }}
	            style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1rem', padding: '0', flexShrink: 0 }}
	          >
	            ✕
	          </button>
	        </div>
	      )}

	      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
	        <h1>{profile?.role === 'client' ? 'My Progress' : 'Dashboard'}</h1>

        {streak > 0 && (
          <div style={{
            background: streak >= 7 ? 'linear-gradient(135deg, #065f46, #064e3b)' : 'linear-gradient(135deg, #052e16, #14532d)',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius)', padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: '#86efac', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Logging streak</p>
              <p style={{ fontWeight: 800, fontSize: '2rem', color: 'var(--color-primary)', lineHeight: 1 }}>
                {streak} <span style={{ fontSize: '1rem', fontWeight: 400 }}>{streak === 1 ? 'day' : 'days'}</span>
              </p>
              {streak >= 7 && loggedToday && <p style={{ fontSize: '0.75rem', color: '#6ee7b7', marginTop: '4px' }}>Keep it going — you're on a roll!</p>}
              {!loggedToday && <p style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '4px' }}>Log today to keep your streak!</p>}
            </div>
            <span style={{ fontSize: streak >= 7 ? '2.5rem' : '2rem' }}>
              {streak >= 30 ? '🏆' : streak >= 14 ? '🔥' : streak >= 7 ? '⭐' : '💪'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button onClick={goToPrevDay} variant="muted" size="sm">←</Button>
          <input type="date" value={selectedDate} max={toLocalDateString(new Date())} onChange={(e) => setSelectedDate(e.target.value)} style={inputStyle} />
          <Button onClick={goToNextDay} disabled={isToday} variant="muted" size="sm">→</Button>
          {isToday && <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', letterSpacing: '0.05em' }}>TODAY</span>}
          {!isToday && <Button onClick={() => setSelectedDate(toLocalDateString(new Date()))} variant="outline" size="sm">Today</Button>}
	        </div>
	      </div>

	      {profile?.role === 'client' && (lockInfo.locked || lockInfo.reason === 'coach-unlocked') && (
	        <div style={{
	          ...cardStyle,
	          borderColor: '#f87171',
	          borderLeftWidth: '4px',
	          backgroundColor: 'rgba(248, 113, 113, 0.05)',
	        }}>
	          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
	            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
	              <span style={{ fontSize: '1.25rem' }}>🔒</span>
	              <h2 style={{ margin: 0 }}>Progress view paused</h2>
	            </div>
		            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: '1.6', margin: 0 }}>
		              {lockInfo.reason === 'coach-unlocked'
		                ? 'Your coach unlocked your account. You have 48 hours to log your nutrition before it locks again.'
		                : `No nutrition logged for ${lockInfo.days} ${lockInfo.days === 1 ? 'day' : 'days'}. Log today to bring your progress view back, or ask your coach to unlock it.`}
		            </p>
	            <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', margin: 0 }}>
	              Your logging form is still fully available — keep adding entries any time.
	            </p>
	          </div>
	        </div>
	      )}


      {/* Coach reports */}
      {reports.length > 0 && (
        <div id="section-reports" style={cardStyle}>
          <SectionHeader
            title="Reports from your coach"
            collapsed={sectionsCollapsed.reports}
            onToggle={() => toggleSection('reports')}
            badge={unreadCount > 0 ? `${unreadCount} new` : null}
          >
          {groupByWeek(activeReports).map(([week, weekReports]) => {
            const isWeekCollapsed = collapsedWeeks[week]
            const weekUnread = weekReports.filter(r => !r.read_at).length
            return (
              <div key={week} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                <div
                  onClick={() => {
                    if (collapsedWeeks[week]) {
                      const unreadIds = weekReports.filter(r => !r.read_at).map(r => r.id)
                      if (unreadIds.length > 0) markAsRead(unreadIds)
                    }
                    setCollapsedWeeks(prev => ({ ...prev, [week]: !prev[week] }))
                  }}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', backgroundColor: 'var(--color-bg)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Week of {week}</span>
                    <span style={{ backgroundColor: 'var(--color-border)', color: 'var(--color-muted)', fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                      {weekReports.length} {weekReports.length === 1 ? 'message' : 'messages'}
                    </span>
                    {weekUnread > 0 && (
                      <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                        {weekUnread} unread
                      </span>
                    )}
                  </div>
                  <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{isWeekCollapsed ? '▶' : '▼'}</span>
                </div>
                {!isWeekCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
                    {weekReports.map((r) => (
                      <div key={r.id} style={{ borderLeft: '3px solid var(--color-primary)', backgroundColor: 'var(--color-bg)', borderRadius: '0 var(--radius) var(--radius) 0', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                            Sent {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {!r.read_at && <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '999px' }}>NEW</span>}
                            {r.read_at && (
                              <button onClick={() => archiveReport(r.id)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '2px 10px', cursor: 'pointer', fontSize: '0.7rem' }}>
                                Archive
                              </button>
                            )}
                          </div>
                        </div>
                        <p style={{ color: 'var(--color-text)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{r.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Archived section */}
          {archivedReports.length > 0 && (
            <div>
              <button onClick={() => setShowArchived(!showArchived)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 0' }}>
                {showArchived ? '▼' : '▶'} Archived ({archivedReports.length})
              </button>
              {showArchived && groupByWeek(archivedReports).map(([week, weekReports]) => {
                const isArchivedWeekCollapsed = collapsedWeeks[`archived_${week}`] !== false
                return (
                  <div key={week} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden', marginTop: '8px', opacity: 0.7 }}>
                    <div
                      onClick={() => setCollapsedWeeks(prev => ({ ...prev, [`archived_${week}`]: !isArchivedWeekCollapsed }))}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', backgroundColor: 'var(--color-bg)' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-muted)' }}>Week of {week}</span>
                        <span style={{ backgroundColor: 'var(--color-border)', color: 'var(--color-muted)', fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                          {weekReports.length} {weekReports.length === 1 ? 'message' : 'messages'}
                        </span>
                      </div>
                      <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{isArchivedWeekCollapsed ? '▶' : '▼'}</span>
                    </div>
                    {!isArchivedWeekCollapsed && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
                        {weekReports.map((r) => (
                          <div key={r.id} style={{ borderLeft: '3px solid var(--color-border)', backgroundColor: 'var(--color-bg)', borderRadius: '0 var(--radius) var(--radius) 0', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                                Sent {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <button onClick={() => unarchiveReport(r.id)} style={{ backgroundColor: 'transparent', color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '2px 10px', cursor: 'pointer', fontSize: '0.7rem' }}>
                                Unarchive
                              </button>
                            </div>
                            <p style={{ color: 'var(--color-muted)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{r.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </SectionHeader>
        </div>
      )}

      {/* Weekly check-in */}
      {profile?.role === 'client' && (
        <div style={cardStyle}>
          <SectionHeader
            title="Weekly check-in"
            collapsed={sectionsCollapsed.checkin}
            onToggle={() => toggleSection('checkin')}
            badge={!existingCheckIn ? 'To do' : null}
            badgeColor="#f87171"
          >
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginTop: '8px', marginBottom: '8px' }}>
                {existingCheckIn ? '✓ Submitted this week' : 'Let your coach know how your week went.'}
              </p>
              <Button
                onClick={() => setShowCheckIn(!showCheckIn)}
                variant={existingCheckIn ? 'ghost' : 'primary'}
                size="sm"
              >
                {existingCheckIn ? 'Edit' : 'Fill out'}
              </Button>
              {showCheckIn && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Adherence — how well did you follow the plan? <strong>{checkIn.adherence_rating}/10</strong></p>
                    <input type="range" min="1" max="10" value={checkIn.adherence_rating} onChange={(e) => setCheckIn({ ...checkIn, adherence_rating: parseInt(e.target.value) })} style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Energy levels this week <strong>{checkIn.energy_level}/10</strong></p>
                    <input type="range" min="1" max="10" value={checkIn.energy_level} onChange={(e) => setCheckIn({ ...checkIn, energy_level: parseInt(e.target.value) })} style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Any obstacles or challenges?</p>
                    <textarea value={checkIn.obstacles} onChange={(e) => setCheckIn({ ...checkIn, obstacles: e.target.value })} placeholder="Stress, travel, injury, time constraints..." rows={3} style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '0.875rem', width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: '0.875rem', marginBottom: '8px' }}>Notes for your coach</p>
                    <textarea value={checkIn.notes} onChange={(e) => setCheckIn({ ...checkIn, notes: e.target.value })} placeholder="Anything else you want your coach to know..." rows={3} style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '0.875rem', width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <Button onClick={saveCheckIn} variant="primary">Submit check-in</Button>
                </div>
              )}
              {checkInSaved && <p style={{ color: '#34d399', fontSize: '0.875rem' }}>✓ Check-in submitted successfully.</p>}
          </SectionHeader>
        </div>
      )}

      {/* Stat cards */}
      <div style={cardStyle}>
        <SectionHeader title="Today's stats" collapsed={sectionsCollapsed.stats} onToggle={() => toggleSection('stats')}>
          <div className="today-stats-grid">
            {!hideCalories && <StatCard label="Calories" value={totals.calories} color="var(--color-calories)" />}
            <StatCard label="Protein" value={`${totals.protein}g`} color="var(--color-protein)" />
            <StatCard label="Carbs" value={`${totals.carbs}g`} color="var(--color-carbs)" />
            <StatCard label="Fat" value={`${totals.fat}g`} color="var(--color-fat)" />
            <StatCard label="Weight" value={weightEntry ? `${weightEntry.weight} ${weightEntry.unit}` : '—'} sub={weightEntry?.weighed_at ? formatTime(weightEntry.weighed_at) : null} color="var(--color-weight)" />
            <StatCard label="Cardio" value={cardioToday?.minutes > 0 ? `${cardioToday.minutes} min` : '—'} color="var(--color-cardio)" />
            <div style={{ gridColumn: '1 / -1' }}>
              <StatCard label="Steps" value={stepsToday ? stepsToday.steps.toLocaleString() : '—'} color="var(--color-steps)" />
            </div>
          </div>
        </SectionHeader>
      </div>

      {/* Today vs target — hidden when client is locked */}
      <Reorderable order={cardOrder} onReorder={saveCardOrder} enabled={profile?.role === 'solo' && hasSoloPremium}>

      {!(profile?.role === 'client' && lockInfo.locked) && targets && (
        <div key="targets" style={cardStyle}>
          <SectionHeader title="Today vs target" collapsed={sectionsCollapsed.targets} onToggle={() => toggleSection('targets')}>
              {[
                ...(!hideCalories ? [{ label: 'Calories', actual: totals.calories, target: targets.calories, unit: 'cal', color: 'var(--color-calories)' }] : []),
                { label: 'Protein', actual: totals.protein, target: targets.protein, unit: 'g', color: 'var(--color-protein)' },
                { label: 'Carbs', actual: totals.carbs, target: targets.carbs, unit: 'g', color: 'var(--color-carbs)' },
                { label: 'Fat', actual: totals.fat, target: targets.fat, unit: 'g', color: 'var(--color-fat)' },
                { label: 'Cardio', actual: cardioToday.minutes, target: targets.cardio_minutes, unit: ' min', color: 'var(--color-cardio)' },
                { label: 'Steps', actual: stepsToday?.steps || 0, target: targets.steps, unit: '', color: 'var(--color-steps)' },
              ].filter(m => m.target).map(m => {
                const pct = Math.min(Math.round((m.actual / m.target) * 100), 100)
                return (
                  <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span>{m.label}</span>
                      <span style={{ color: 'var(--color-muted)' }}>{m.actual} / {m.target}{m.unit} ({pct}%)</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: m.color, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                )
              })}
              {targets.weight_goal && weightEntry && (
                <div style={{ fontSize: '0.875rem', color: 'var(--color-muted)', paddingTop: '4px' }}>
                  Weight goal: {targets.weight_goal} {targets.weight_goal_unit} · Current: {weightEntry.weight} {weightEntry.unit} ·{' '}
                  <span style={{ color: Math.abs(weightEntry.weight - targets.weight_goal) < 1 ? '#34d399' : 'var(--color-primary)' }}>
                    {weightEntry.weight > targets.weight_goal ? `${(weightEntry.weight - targets.weight_goal).toFixed(1)} to go` : weightEntry.weight < targets.weight_goal ? `${(targets.weight_goal - weightEntry.weight).toFixed(1)} below goal` : 'Goal reached! 🎉'}
                  </span>
                </div>
              )}
          </SectionHeader>
        </div>
      )}

      {/* Weight trend */}
      {!(profile?.role === 'client' && lockInfo.locked) && weightHistory.length > 1 && (
        <div key="weightChart" style={cardStyle}>
          <SectionHeader title="Weight trend" collapsed={sectionsCollapsed.weightChart} onToggle={() => toggleSection('weightChart')} animated={false}>
            {!sectionsCollapsed.weightChart && (
              <>
                <Line
                  data={{
                    labels: weightHistory.map(d => d.date),
                    datasets: [
                      {
                        label: 'Weight',
                        data: weightHistory.map(d => d.weight),
                        borderColor: '#34d399',
                        backgroundColor: 'rgba(52, 211, 153, 0.15)',
                        pointBackgroundColor: '#34d399',
                        pointRadius: 3,
                        tension: 0.3,
                        fill: true,
                      },
                      ...(hasSoloPremium ? [{
                        label: '7-day avg',
                        data: computeRollingAverage(weightHistory),
                        borderColor: 'rgba(52, 211, 153, 0.45)',
                        backgroundColor: 'transparent',
                        borderDash: [4, 4],
                        pointRadius: 0,
                        tension: 0.3,
                        fill: false,
                      }] : []),
                    ]
                  }}
                  options={chartOptions}
                />
                {!hasSoloPremium && profile?.role !== 'client' && (
                  <div style={{ marginTop: 16 }}>
                    <SoloUpgrade feature="The 7-day weight average" />
                  </div>
                )}
              </>
            )}
          </SectionHeader>
        </div>
      )}

      {/* Logging consistency — Solo Premium self-analytics. Descriptive only:
          best week, weekday/weekend split, and a 90-day heatmap. Reports the
          user's own consistency, never prescribes or adjusts a plan. */}
      {profile?.role !== 'client' && (
        <div key="consistency" style={cardStyle}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 4px' }}>Logging consistency</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', margin: '0 0 14px' }}>
            How steadily you've logged over the last 90 days.
          </p>
          {hasSoloPremium ? (
            <>
              {/* Weekday vs weekend split (last 30 days) */}
              {consistency && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Weekdays (Mon–Fri) <InfoTip text={CONSISTENCY_TIPS.weekdays} /></p>
                    <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.8 ? '#34d399' : consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.5 ? '#fbbf24' : '#f87171' }}>
                      {consistency.weekdayLogged}
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 400 }}>/{consistency.weekdayTotal}</span>
                    </p>
                    <p style={{ fontSize: '0.65rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                      {consistency.weekdayTotal > 0 ? Math.round((consistency.weekdayLogged / consistency.weekdayTotal) * 100) : 0}%
                    </p>
                  </div>
                  <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Weekends (Sat–Sun) <InfoTip text={CONSISTENCY_TIPS.weekends} /></p>
                    <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.weekendLogged / (consistency.weekendTotal || 1) >= 0.8 ? '#34d399' : consistency.weekendLogged / (consistency.weekendTotal || 1) >= 0.5 ? '#fbbf24' : '#f87171' }}>
                      {consistency.weekendLogged}
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 400 }}>/{consistency.weekendTotal}</span>
                    </p>
                    <p style={{ fontSize: '0.65rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                      {consistency.weekendTotal > 0 ? Math.round((consistency.weekendLogged / consistency.weekendTotal) * 100) : 0}%
                    </p>
                  </div>
                </div>
              )}

              {/* Best week (last 90 days) */}
              {bestWeek && bestWeek.count > 0 && (
                <div style={{
                  backgroundColor: 'var(--color-bg)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 18px',
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Best week (last 90 days) <InfoTip text={CONSISTENCY_TIPS.bestWeek} /></p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text)', margin: 0 }}>
                      {bestWeek.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' – '}
                      {bestWeek.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{
                      fontWeight: 700,
                      fontSize: '1.5rem',
                      color: bestWeek.count === 7 ? '#34d399' : bestWeek.count >= 5 ? '#fbbf24' : 'var(--color-muted)',
                      margin: 0,
                      lineHeight: 1,
                    }}>
                      {bestWeek.count}
                      <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 400 }}>/7</span>
                    </p>
                    <p style={{ fontSize: '0.65rem', color: 'var(--color-muted)', marginTop: '2px' }}>days logged</p>
                  </div>
                </div>
              )}

              {/* 90-day heatmap (left) + summary totals (fills the space at right) */}
              <div style={{ marginTop: '16px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'stretch' }}>
                <div style={{ flex: '1 1 300px', minWidth: 0, maxWidth: 440 }}>
                  <ComplianceHeatmap logsByDate={heatmapData} calorieTarget={targets?.calories} />
                </div>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <ComplianceSummary logsByDate={heatmapData} calorieTarget={targets?.calories} variant="solo" />
                </div>
              </div>

              {!bestWeek?.count && Object.keys(heatmapData).length === 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)', margin: '12px 0 0' }}>
                  Log a few more days and your consistency trends will show up here.
                </p>
              )}
            </>
          ) : (
            <SoloUpgrade feature="Logging consistency" />
          )}
        </div>
      )}

      {/* Calories chart */}
      {!(profile?.role === 'client' && lockInfo.locked) && !hideCalories && calorieHistory.length > 0 && (
        <div key="calorieChart" style={cardStyle}>
          <SectionHeader title="Calories — last 30 days" action={<ChartColorToggle plain={plainCharts.has('calorieChart')} onToggle={() => togglePlain('calorieChart')} />} collapsed={sectionsCollapsed.calorieChart} onToggle={() => toggleSection('calorieChart')} animated={false}>
            {!sectionsCollapsed.calorieChart && (
              <Bar data={metricBarData({ history: calorieHistory, valueKey: 'calories', label: 'Calories', target: parseInt(targets?.calories) || null, fallback: (a) => `rgba(251, 191, 36, ${a})`, bidirectional: true, plain: plainCharts.has('calorieChart') })} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      {/* Cardio chart */}
      {!(profile?.role === 'client' && lockInfo.locked) && cardioHistory.length > 0 && (
        <div key="cardioChart" style={cardStyle}>
          <SectionHeader title="Cardio — last 30 days" action={<ChartColorToggle plain={plainCharts.has('cardioChart')} onToggle={() => togglePlain('cardioChart')} />} collapsed={sectionsCollapsed.cardioChart} onToggle={() => toggleSection('cardioChart')} animated={false}>
            {!sectionsCollapsed.cardioChart && (
              <Bar data={metricBarData({ history: cardioHistory, valueKey: 'minutes', label: 'Minutes', target: parseInt(targets?.cardio_minutes) || null, fallback: (a) => `rgba(59, 130, 246, ${a})`, plain: plainCharts.has('cardioChart') })} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      {/* Steps chart */}
      {!(profile?.role === 'client' && lockInfo.locked) && stepsHistory.length > 0 && (
        <div key="stepsChart" style={cardStyle}>
          <SectionHeader title="Steps — last 30 days" action={<ChartColorToggle plain={plainCharts.has('stepsChart')} onToggle={() => togglePlain('stepsChart')} />} collapsed={sectionsCollapsed.stepsChart} onToggle={() => toggleSection('stepsChart')} animated={false}>
            {!sectionsCollapsed.stepsChart && (
              <Bar data={metricBarData({ history: stepsHistory, valueKey: 'steps', label: 'Steps', target: parseInt(targets?.steps) || null, fallback: (a) => `rgba(167, 139, 250, ${a})`, plain: plainCharts.has('stepsChart') })} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      </Reorderable>

      {profile?.role === 'client' && (
        <div style={cardStyle}>
          <h2>Coaching</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', lineHeight: '1.6', margin: 0 }}>
            Leave your current coaching plan and return to an individual account. Your data is preserved.
          </p>
          {!showSelfOffboardConfirm ? (
            <Button onClick={() => setShowSelfOffboardConfirm(true)} variant="danger" size="sm">
              Leave coaching plan
            </Button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '0.875rem', margin: 0 }}>
                Are you sure? You'll return to a solo account.
              </p>
              {selfOffboardError && <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{selfOffboardError}</p>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button onClick={selfOffboard} variant="danger-solid" size="sm" loading={selfOffboarding}>
                  Confirm
                </Button>
                <Button onClick={() => { setShowSelfOffboardConfirm(false); setSelfOffboardError('') }} variant="ghost" size="sm">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  )
}

export default Dashboard
