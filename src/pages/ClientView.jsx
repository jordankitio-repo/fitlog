import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import SectionHeader from '../components/SectionHeader'
import Toast from '../components/Toast'
import ComplianceHeatmap from '../components/ComplianceHeatmap'
import ComplianceSummary from '../components/ComplianceSummary'
import ComplianceBreakdown from '../components/ComplianceBreakdown'
import EnergyBalanceRead from '../components/EnergyBalanceRead'
import ChatBubble from '../components/ChatBubble'
import InfoTip from '../components/InfoTip'
import ChartColorToggle from '../components/ChartColorToggle'
import { CONSISTENCY_TIPS } from '../utils/consistencyTips'
import { metricBarData } from '../utils/metricBarChart'
import { usePlainCharts } from '../utils/usePlainCharts'
import { CHART } from '../utils/chartTheme'
import Reorderable from '../components/Reorderable'
import SectionRail from '../components/SectionRail'
import TargetCalculator from '../components/TargetCalculator'
import { mergeOrder } from '../utils/cardOrder'
import { resolveLockState } from '../utils/lockState'
import { energyBalanceRead } from '../utils/energyBalanceRead'
import { complianceBreakdown } from '../utils/complianceBreakdown'
import { nudgeReason } from '../utils/nudgeReason'
import { CADENCE_OPTIONS, cadenceLabel } from '../utils/cadence'
import { formatAnswer } from '../utils/checkinQuestions'
import {
  addDays,
  checkinPeriod,
  getDatesInRange,
  getWeeklyReportRange,
  parseLocalDateString,
  toLocalDateString
} from '../utils/dateHelpers'
import { cardStyle } from '../utils/styles'
import { groupEntriesByMeal, groupLoggedMeals } from '../utils/meals'
import { Line, Bar, Chart } from 'react-chartjs-2'
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

// Map a check-in row into the report/call-prep `checkIn` contract. A custom
// questionnaire folds its rating answers into adherence/energy and the full
// Q&A into notes, so the report edge functions need no changes.
// Section-rail metadata. Labels keyed by the section key (matches the id
// anchors + sectionsCollapsed keys). REORDERABLE_KEYS is the default order of
// the drag-reorderable sections (stats is pinned above them) — used to resolve
// the live order via mergeOrder(savedOrder, presentKeys), same as Reorderable.
const SECTION_LABELS = {
  stats: 'Stats', consistency: 'Consistency', sentReports: 'Reports', targets: 'Targets',
  nutritionLog: 'Nutrition', checkIn: 'Check-in', privateNotes: 'Notes', correlatedChart: 'Progress',
  weightChart: 'Weight', calorieChart: 'Calories', cardioChart: 'Cardio', stepsChart: 'Steps',
}
const REORDERABLE_KEYS = ['consistency', 'sentReports', 'targets', 'nutritionLog', 'checkIn', 'privateNotes', 'correlatedChart', 'weightChart', 'calorieChart', 'cardioChart', 'stepsChart']

function checkInPayload(c) {
  if (!c) return null
  if (Array.isArray(c.answers) && c.answers.length > 0) {
    const ratings = c.answers.filter(a => a.type === 'rating')
    return {
      adherence: ratings[0]?.value ?? null,
      energy: ratings[1]?.value ?? null,
      obstacles: null,
      notes: c.answers.map(a => `${a.prompt}: ${formatAnswer(a)}`).join('\n'),
    }
  }
  return { adherence: c.adherence_rating, energy: c.energy_level, obstacles: c.obstacles, notes: c.notes }
}

function ClientView({ profile }) {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))
  const [clientProfile, setClientProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [dayComplete, setDayComplete] = useState(false)
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [weightEntry, setWeightEntry] = useState(null)
  const [report, setReport] = useState('')
  const [reportWeekRange, setReportWeekRange] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [weightHistory, setWeightHistory] = useState([])
  const [plainCharts, togglePlain] = usePlainCharts()
  const [calorieHistory, setCalorieHistory] = useState([])
  const [cardioHistory, setCardioHistory] = useState([])
  const [stepsHistory, setStepsHistory] = useState([])
  const [clientTargets, setClientTargets] = useState({
    calories: '', protein: '', carbs: '', fat: '',
    cardio_minutes: '', steps: '', weight_goal: '', weight_goal_unit: 'lbs'
  })
  const [targetsSaved, setTargetsSaved] = useState(false)
  const [showTargetCalc, setShowTargetCalc] = useState(false)
  const [clientCheckIn, setClientCheckIn] = useState(null)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [lockInfo, setLockInfo] = useState({ locked: false, days: 0, reason: 'active' })
  const [daysSinceLog, setDaysSinceLog] = useState(null)
  const [hideCaloriesToggle, setHideCaloriesToggle] = useState(false)
  const [checkinInterval, setCheckinInterval] = useState(1)
  const [savingCadence, setSavingCadence] = useState(false)
  const [coachNotes, setCoachNotes] = useState('')
  const [newNoteEntry, setNewNoteEntry] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [consistency, setConsistency] = useState({
    streak: 0,
    days7: 0,
    days30: 0,
    weekdayLogged: 0,
    weekendLogged: 0,
    weekdayTotal: 0,
    weekendTotal: 0,
    bestWeekCount: 0,
    bestWeekStart: null,
    bestWeekEnd: null,
  })
  const [heatmapData, setHeatmapData] = useState({})
  const [energySeries, setEnergySeries] = useState({ calories: [], weights: [] })
  const [cardOrder, setCardOrder] = useState(profile?.layout?.clientView || [])
  const canReorder = profile?.role === 'coach'
  const [activeSection, setActiveSection] = useState(null) // scroll-spy: section currently in view

  async function saveCardOrder(next) {
    setCardOrder(next)
    const { error } = await supabase
      .from('profiles')
      .update({ layout: { ...(profile?.layout || {}), clientView: next } })
      .eq('id', profile.id)
    if (error) console.error(error)
  }
  const [sentReports, setSentReports] = useState([])
  const [collapsedSentWeeks, setCollapsedSentWeeks] = useState({})
  const [messages, setMessages] = useState([])
  const [callBriefing, setCallBriefing] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [aiToolsCollapsed, setAiToolsCollapsed] = useState(false)
  const [showOffboardConfirm, setShowOffboardConfirm] = useState(false)
  const [offboarding, setOffboarding] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    stats: false,
    consistency: false,
    sentReports: false,
    targets: false,
    nutritionLog: false,
    checkIn: false,
    privateNotes: false,
    correlatedChart: false,
    weightChart: true,
    calorieChart: true,
    cardioChart: true,
    stepsChart: true,
  })

  function formatTime(timeStr) {
    if (!timeStr) return null
    const [hours, minutes] = timeStr.split(':')
    const h = parseInt(hours)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${minutes} ${ampm}`
  }

  // Expand a section (if collapsed) and smooth-scroll to it. Shared by the
  // section rail and the ?focus= notification deep-link, so they can't drift.
  function goToSection(key) {
    let tries = 0
    const scroll = () => {
      const el = document.getElementById('section-' + key)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else if (tries++ < 20) setTimeout(scroll, 100)
    }
    // Expand + scroll deferred to a frame so calling this from the deep-link
    // effect doesn't setState synchronously within the effect.
    requestAnimationFrame(() => {
      setSectionsCollapsed(prev => ({ ...prev, [key]: false }))
      setTimeout(scroll, 80)
    })
  }

  // Deep-link from a notification (?focus=checkIn etc.): expand + scroll to it.
  // 'chat' is handled by ChatBubble; other values name a section here.
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus || focus === 'chat') return
    goToSection(focus)
    const sp = new URLSearchParams(searchParams)
    sp.delete('focus')
    setSearchParams(sp, { replace: true })
  }, [searchParams, setSearchParams])

  function toggleSection(key) {
    setSectionsCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Scroll-spy: highlight the rail item for whichever section is near the top.
  // Observes every rendered section anchor, so it tracks the live (reordered,
  // present-only) set automatically. setState lives in the IO callback (async),
  // so it never fires synchronously within the effect.
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('[id^="section-"]'))
    if (!els.length) return
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter(e => e.isIntersecting)
      if (!vis.length) return
      const top = vis.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b))
      setActiveSection(top.target.id.replace('section-', ''))
    }, { rootMargin: '-88px 0px -65% 0px', threshold: 0 })
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [cardOrder, weightHistory, calorieHistory, cardioHistory, stepsHistory, sentReports])

  function showToast(message, type = 'success') {
    setToast({ message, type })
  }

  function groupByWeek(list) {
    const grouped = {}
    list.forEach(r => {
      if (!grouped[r.week_of]) grouped[r.week_of] = []
      grouped[r.week_of].push(r)
    })
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))
  }

  useEffect(() => {
    const subscription = supabase
      .channel(`check_ins_${clientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'check_ins',
        filter: `client_id=eq.${clientId}`
      }, () => {
        fetchClientCheckIn()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [clientId])

  useEffect(() => {
  fetchClientProfile()
  fetchWeightHistory()
  fetchCalorieHistory()
  fetchCardioHistory()
  fetchStepsHistory()
  fetchClientTargets()
  fetchClientCheckIn()
  fetchLockState()
  fetchCoachNotes()
  fetchConsistency()
  fetchHeatmapData()
  fetchEnergyBalance()
  fetchSentReports()
  fetchMessages()
}, [clientId])

  useEffect(() => {
    fetchEntries()
    fetchWeight()
  }, [clientId, selectedDate])

  async function fetchClientProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', clientId)
      .single()
    if (error) console.error('Error fetching client profile:', error)
    else setClientProfile(data)
  }

  async function fetchLockState() {
    if (!profile?.id) return

    const [{ data: relationship, error: relationshipError }, { data: latestLog, error: latestLogError }] = await Promise.all([
      supabase
        .from('coach_clients')
        .select('created_at, lock_cleared_at, hide_calories, checkin_interval_weeks')
        .eq('coach_id', profile.id)
        .eq('client_id', clientId)
        .eq('status', 'active')
        .maybeSingle(),
      supabase
        .from('nutrition_log')
        .select('logged_date')
        .eq('user_id', clientId)
        .order('logged_date', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])

    if (relationshipError) {
      console.error(relationshipError)
      return
    }
    if (latestLogError) {
      console.error(latestLogError)
      return
    }
    if (!relationship) {
      setLockInfo({ locked: false, days: 0, reason: 'active' })
      setDaysSinceLog(null)
      setHideCaloriesToggle(false)
      return
    }

    const interval = relationship.checkin_interval_weeks || 1
    setCheckinInterval(interval)
    fetchClientCheckIn(interval) // resolve the right period once cadence is known

    setDaysSinceLog(latestLog?.logged_date
      ? Math.floor((new Date() - new Date(`${latestLog.logged_date}T00:00:00`)) / 86400000)
      : null
    )
    setHideCaloriesToggle(Boolean(relationship.hide_calories))
    setLockInfo(resolveLockState({
      lastNutritionDate: latestLog?.logged_date || null,
      connectionCreatedAt: relationship.created_at?.split('T')[0],
      lockClearedAt: relationship.lock_cleared_at
    }))
  }

  async function unlockClient() {
    if (!profile?.id) return

    const { error } = await supabase
      .from('coach_clients')
      .update({ lock_cleared_at: new Date().toISOString() })
      .eq('coach_id', profile.id)
      .eq('client_id', clientId)

    if (error) {
      console.error(error)
      showToast('Could not unlock client. Try again.', 'error')
    } else {
      await fetchLockState()
      showToast('Client unlocked.', 'success')
    }
  }

  async function toggleHideCalories() {
    if (!profile?.id) return

    const newValue = !hideCaloriesToggle
    setHideCaloriesToggle(newValue)

    const { error } = await supabase
      .from('coach_clients')
      .update({ hide_calories: newValue })
      .eq('coach_id', profile.id)
      .eq('client_id', clientId)

    if (error) {
      console.error(error)
      setHideCaloriesToggle(!newValue)
      showToast('Could not update client setting. Try again.', 'error')
    }
  }

  async function offboardClient() {
    setOffboarding(true)
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const res = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/offboard-client',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ clientId }),
      }
    )
    const data = await res.json()
    if (data.error) {
      showToast('Failed to offboard client', 'error')
      setOffboarding(false)
    } else {
      navigate('/')
    }
  }

  async function nudgeClient(nudge) {
    setNudging(true)
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const response = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/nudge-client',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
        body: JSON.stringify({ clientId, reason: nudge?.key, days: nudge?.days ?? null }),
      }
    )
    const data = await response.json()

    if (data.error === 'too_soon') {
      showToast(`You nudged ${clientProfile?.full_name || 'this client'} recently. Wait 48 hours before nudging again.`, 'error')
    } else if (data.error) {
      showToast('Could not send nudge. Try again.', 'error')
    } else {
      showToast(`Nudge sent to ${clientProfile?.full_name || 'client'}.`, 'success')
    }

    setNudging(false)
  }

  async function fetchEntries() {
    const { data: dc } = await supabase
      .from('day_complete').select('logged_date')
      .eq('user_id', clientId).eq('logged_date', selectedDate).maybeSingle()
    setDayComplete(Boolean(dc))

    const { data, error } = await supabase
      .from('nutrition_log')
      .select('*')
      .eq('user_id', clientId)
      .eq('logged_date', selectedDate)
      .order('created_at', { ascending: true })
    if (error) console.error('Error fetching entries:', error)
    else {
      setEntries(data)
      const totals = data.reduce((acc, entry) => ({
        calories: acc.calories + (entry.calories || 0),
        protein: acc.protein + (entry.protein || 0),
        carbs: acc.carbs + (entry.carbs || 0),
        fat: acc.fat + (entry.fat || 0),
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
      setTotals(totals)
    }
  }

  async function fetchWeight() {
    const { data, error } = await supabase
      .from('weight_log')
      .select('*')
      .eq('user_id', clientId)
      .eq('logged_date', selectedDate)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) console.error('Error fetching weight:', error)
    else setWeightEntry(data?.[0] ?? null)
  }
  async function fetchWeightHistory() {
  const { data, error } = await supabase
    .from('weight_log').select('logged_date, weight')
    .eq('user_id', clientId)
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
    .eq('user_id', clientId)
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

async function fetchCardioHistory() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  const { data, error } = await supabase
    .from('cardio_log').select('logged_date, duration')
    .eq('user_id', clientId)
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
    .eq('user_id', clientId)
    .gte('logged_date', start.toISOString().split('T')[0])
    .lte('logged_date', end.toISOString().split('T')[0])
  if (error) console.error(error)
  else setStepsHistory(data.map(d => ({
    date: d.logged_date.slice(5), steps: d.steps
  })).sort((a, b) => a.date.localeCompare(b.date)))
}

  async function fetchClientCheckIn(interval = checkinInterval) {
  const weekOf = checkinPeriod(interval).weekOf
  const { data, error } = await supabase
    .from('check_ins')
    .select('*')
    .eq('client_id', clientId)
    .eq('week_of', weekOf)
    .maybeSingle()
  if (error) console.error(error)
  else setClientCheckIn(data)
}

  async function updateCadence(weeks) {
    if (!profile?.id) return
    const prev = checkinInterval
    setSavingCadence(true)
    setCheckinInterval(weeks)
    const { error } = await supabase
      .from('coach_clients')
      .update({ checkin_interval_weeks: weeks })
      .eq('coach_id', profile.id)
      .eq('client_id', clientId)
    setSavingCadence(false)
    if (error) {
      console.error(error)
      setCheckinInterval(prev)
      showToast('Could not update check-in cadence. Try again.', 'error')
    } else {
      fetchClientCheckIn(weeks) // period changed → reload the relevant check-in
    }
  }

  async function reviewCheckIn() {
    if (!clientCheckIn?.id) return
    setReviewing(true)
    const comment = reviewComment.trim() || null
    const { error } = await supabase.rpc('review_checkin', { p_id: clientCheckIn.id, p_comment: comment })
    if (error) console.error('Error reviewing check-in:', error)
    else {
      setReviewComment(''); fetchClientCheckIn()
      // Notify the client by email; their bell derives the event from check_ins.
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-checkin-review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ clientId, comment }),
        }).catch(() => {})
      }
    }
    setReviewing(false)
  }

  async function fetchCoachNotes() {
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const { data, error } = await supabase
    .from('coach_notes')
    .select('content')
    .eq('coach_id', currentSession.user.id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) console.error(error)
  else if (data) setCoachNotes(data.content || '')
}

async function fetchConsistency() {
  const { data, error } = await supabase
    .from('nutrition_log')
    .select('logged_date')
    .eq('user_id', clientId)
    .gte('logged_date', toLocalDateString(new Date(new Date().setDate(new Date().getDate() - 90))))
    .order('logged_date', { ascending: false })

  if (error) { console.error(error); return }

  const loggedDates = [...new Set(data.map(e => e.logged_date))]

  const today = new Date()
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - i); return toLocalDateString(d)
  })
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - i); return toLocalDateString(d)
  })

  const days7 = last7.filter(d => loggedDates.includes(d)).length
  const days30 = last30.filter(d => loggedDates.includes(d)).length

  const last30WithDow = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    return { dateStr: toLocalDateString(d), dow: d.getDay() }
  })

  const weekdayDates = last30WithDow.filter(o => o.dow >= 1 && o.dow <= 5)
  const weekendDates = last30WithDow.filter(o => o.dow === 0 || o.dow === 6)

  const weekdayLogged = weekdayDates.filter(o => loggedDates.includes(o.dateStr)).length
  const weekendLogged = weekendDates.filter(o => loggedDates.includes(o.dateStr)).length
  const weekdayTotal = weekdayDates.length
  const weekendTotal = weekendDates.length

  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    if (loggedDates.includes(toLocalDateString(d))) streak++
    else break
  }

  // Best week - find the Sun-Sat window with most logged days in last 90 days.
  const today2 = new Date()
  today2.setHours(0, 0, 0, 0)
  const dow = today2.getDay()
  const currentWeekStart = new Date(today2)
  currentWeekStart.setDate(today2.getDate() - dow)

  let bestWeek = null
  let bestCount = -1

  for (let w = 0; w < 13; w++) {
    const weekStart = new Date(currentWeekStart)
    weekStart.setDate(currentWeekStart.getDate() - w * 7)
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return toLocalDateString(d)
    })
    const count = weekDays.filter(d => loggedDates.includes(d)).length
    if (count > bestCount) {
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      bestCount = count
      bestWeek = {
        count,
        startDate: weekStart,
        endDate: weekEnd,
      }
    }
  }

  setConsistency({
    streak,
    days7,
    days30,
    weekdayLogged,
    weekendLogged,
    weekdayTotal,
    weekendTotal,
    bestWeekCount: bestWeek?.count ?? 0,
    bestWeekStart: bestWeek?.startDate ?? null,
    bestWeekEnd: bestWeek?.endDate ?? null,
  })
}

async function fetchHeatmapData() {
  const start = new Date()
  start.setDate(start.getDate() - 97)

  const { data, error } = await supabase
    .from('nutrition_log')
    .select('logged_date, calories')
    .eq('user_id', clientId)
    .gte('logged_date', toLocalDateString(start))

  if (error) { console.error(error); return }

  const byDate = {}
  data.forEach(entry => {
    if (!byDate[entry.logged_date]) byDate[entry.logged_date] = { calories: 0 }
    byDate[entry.logged_date].calories += entry.calories || 0
  })

  setHeatmapData(byDate)
}

// Dedicated 45-day pull for the Energy Balance Read — full dates + weight unit,
// recent window (the chart fetches are year-stripped, 30-day, and earliest-30).
async function fetchEnergyBalance() {
  const start = new Date(); start.setDate(start.getDate() - 44)
  const startStr = toLocalDateString(start)
  const [nut, wt] = await Promise.all([
    supabase.from('nutrition_log').select('logged_date, calories').eq('user_id', clientId).gte('logged_date', startStr),
    supabase.from('weight_log').select('logged_date, weight, unit').eq('user_id', clientId).gte('logged_date', startStr),
  ])
  if (nut.error) console.error(nut.error)
  if (wt.error) console.error(wt.error)
  const grouped = {}
  ;(nut.data || []).forEach(e => { grouped[e.logged_date] = (grouped[e.logged_date] || 0) + (e.calories || 0) })
  setEnergySeries({
    calories: Object.entries(grouped).map(([date, calories]) => ({ date, calories })),
    weights: (wt.data || []).map(w => ({ date: w.logged_date, weight: w.weight, unit: w.unit })),
  })
}

async function saveCoachNotes() {
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const { error } = await supabase
    .from('coach_notes')
    .upsert({
      coach_id: currentSession.user.id,
      client_id: clientId,
      content: coachNotes,
      updated_at: new Date().toISOString()
    }, { onConflict: 'coach_id,client_id' })
  if (error) console.error(error)
  else { setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2000) }
}

async function addNoteEntry() {
  if (!newNoteEntry.trim()) return

  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const dateStamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const entry = `── ${dateStamp} ──\n${newNoteEntry.trim()}`
  const updatedContent = coachNotes ? `${entry}\n\n${coachNotes}` : entry

  const { error } = await supabase.from('coach_notes').upsert({
    coach_id: currentSession.user.id,
    client_id: clientId,
    content: updatedContent,
    updated_at: new Date().toISOString()
  }, { onConflict: 'coach_id,client_id' })

  if (error) console.error(error)
  else {
    setCoachNotes(updatedContent)
    setNewNoteEntry('')
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }
}

  async function fetchClientTargets() {
  const { data, error } = await supabase
    .from('targets')
    .select('*')
    .eq('user_id', clientId)
    .maybeSingle()
  if (error) console.error(error)
  else if (data) {
    setClientTargets({
      calories: data.calories?.toString() || '',
      protein: data.protein?.toString() || '',
      carbs: data.carbs?.toString() || '',
      fat: data.fat?.toString() || '',
      cardio_minutes: data.cardio_minutes?.toString() || '',
      steps: data.steps?.toString() || '',
      weight_goal: data.weight_goal?.toString() || '',
      weight_goal_unit: data.weight_goal_unit || 'lbs'
    })
  }
}

  async function saveClientTargets() {
  const { error } = await supabase
    .from('targets')
    .upsert({
      user_id: clientId,
      calories: parseInt(clientTargets.calories) || null,
      protein: parseInt(clientTargets.protein) || null,
      carbs: parseInt(clientTargets.carbs) || null,
      fat: parseInt(clientTargets.fat) || null,
      cardio_minutes: parseInt(clientTargets.cardio_minutes) || null,
      steps: parseInt(clientTargets.steps) || null,
      weight_goal: parseFloat(clientTargets.weight_goal) || null,
      weight_goal_unit: clientTargets.weight_goal_unit,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

  if (error) console.error(error)
  else { setTargetsSaved(true); setTimeout(() => setTargetsSaved(false), 2000) }
}

  async function generateWeeklyReport() {
    setReportLoading(true)
    setReport('')
    setReportWeekRange(null)

    const { data: { session } } = await supabase.auth.getSession()

    const weekRange = getWeeklyReportRange()
    const days = getDatesInRange(weekRange.start, weekRange.end)

    const { data: nutritionData } = await supabase
      .from('nutrition_log').select('*').eq('user_id', clientId).in('logged_date', days)

    const { data: weightData } = await supabase
      .from('weight_log').select('*').eq('user_id', clientId).in('logged_date', days)

    const { data: cardioData } = await supabase
      .from('cardio_log').select('*').eq('user_id', clientId).in('logged_date', days)

    const { data: stepsData } = await supabase
      .from('steps_log').select('*').eq('user_id', clientId).in('logged_date', days)

    const { data: checkInData } = await supabase
      .from('check_ins').select('*').eq('client_id', clientId).eq('week_of', weekRange.endDate).maybeSingle()

    const weekData = days.map(date => {
      const dayEntries = nutritionData?.filter(e => e.logged_date === date) || []
      const dayWeight = weightData?.find(w => w.logged_date === date)
      const dayCardio = cardioData?.filter(c => c.logged_date === date) || []
      const daySteps = stepsData?.find(s => s.logged_date === date)

      return {
        date,
        weight: dayWeight ? `${dayWeight.weight} ${dayWeight.unit}` : null,
        totalCalories: dayEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
        totalProtein: dayEntries.reduce((sum, e) => sum + (e.protein || 0), 0),
        totalCarbs: dayEntries.reduce((sum, e) => sum + (e.carbs || 0), 0),
        totalFat: dayEntries.reduce((sum, e) => sum + (e.fat || 0), 0),
        meals: dayEntries.map(e => e.food),
        cardioSessions: dayCardio.map(c => `${c.exercise_type} ${c.duration}min${c.calories_burned ? ` ${c.calories_burned}cal` : ''}`),
        steps: daySteps ? daySteps.steps : null
      }
    })

    const response = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/weekly-report',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clientId,
          clientName: clientProfile?.full_name || 'Client',
          weekRange: {
            startDate: weekRange.startDate,
            endDate: weekRange.endDate,
            label: weekRange.label
          },
          weekData,
          checkIn: checkInPayload(checkInData)
        }),
      }
    )

    const data = await response.json()
    setReport(data.report || data.error || 'Failed to generate report.')
    setReportWeekRange({
      startDate: weekRange.startDate,
      endDate: weekRange.endDate,
      label: weekRange.label
    })
    setReportLoading(false)
  }

  async function sendReport() {
    const { data: { session } } = await supabase.auth.getSession()

    const weekRange = reportWeekRange || (() => {
      const fallback = getWeeklyReportRange()
      return {
        startDate: fallback.startDate,
        endDate: fallback.endDate,
        label: fallback.label
      }
    })()

    const { error } = await supabase
      .from('reports')
      .insert([{
        coach_id: session.user.id,
        client_id: clientId,
        content: report,
        week_of: weekRange.startDate
      }])

    if (error) {
      console.error('Error sending report:', error)
    } else {
      setReport('')
      setToast({ message: 'Report sent to client.', type: 'success' })
      // Notify client by email
      fetch('https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/notify-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clientId,
          weekOf: weekRange.label
        }),
      })
    }
  }

  async function generateCallPrep() {
    setBriefingLoading(true)
    setCallBriefing('')

    const { data: { session } } = await supabase.auth.getSession()

    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(toLocalDateString(d))
    }

    const [nutritionResult, weightResult, cardioResult, stepsResult] = await Promise.all([
      supabase.from('nutrition_log').select('*').eq('user_id', clientId).in('logged_date', days),
      supabase.from('weight_log').select('*').eq('user_id', clientId).in('logged_date', days),
      supabase.from('cardio_log').select('*').eq('user_id', clientId).in('logged_date', days),
      supabase.from('steps_log').select('*').eq('user_id', clientId).in('logged_date', days),
    ])

    const weekOf = checkinPeriod(checkinInterval).weekOf
    const { data: checkInData } = await supabase
      .from('check_ins').select('*').eq('client_id', clientId).eq('week_of', weekOf).maybeSingle()

    const { data: messagesData } = await supabase
      .from('messages').select('content, reaction, created_at')
      .eq('coach_id', session.user.id).eq('client_id', clientId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })

    const weekData = days.map(date => {
      const dayEntries = nutritionResult.data?.filter(e => e.logged_date === date) || []
      const dayWeight = weightResult.data?.find(w => w.logged_date === date)
      const dayCardio = cardioResult.data?.filter(c => c.logged_date === date) || []
      const daySteps = stepsResult.data?.find(s => s.logged_date === date)
      return {
        date,
        weight: dayWeight ? `${dayWeight.weight} ${dayWeight.unit}` : null,
        totalCalories: dayEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
        totalProtein: dayEntries.reduce((sum, e) => sum + (e.protein || 0), 0),
        cardioSessions: dayCardio.map(c => `${c.exercise_type} ${c.duration}min`),
        steps: daySteps?.steps || null
      }
    })

    // Recent intelligence (same reads the panels show) → a candid signals block,
    // so the brief is a real readiness read, not just a re-summary of the logs.
    const eb = energyBalanceRead({
      calorieSeries: energySeries.calories,
      weightSeries: energySeries.weights,
      calorieTarget: clientTargets.calories,
      weightGoal: clientTargets.weight_goal,
      weightGoalUnit: clientTargets.weight_goal_unit,
    })
    const cb = complianceBreakdown(heatmapData, clientTargets.calories)
    const sig = []
    if (eb.hasData) {
      const r = eb.rateLbPerWk
      const trend = Math.abs(r) < 0.05 ? 'weight flat' : `weight ${r < 0 ? 'down' : 'up'} ${Math.abs(r).toFixed(1)} lb/wk`
      sig.push(`Energy: est. maintenance ~${eb.maintenance.low}–${eb.maintenance.high} cal, ${trend}, logged avg ${eb.avgIntake} vs ${eb.target} target.`)
    }
    if (!cb.insufficient && cb.weaker) sig.push(`Adherence dips on ${cb.weaker}s.`)
    if (daysSinceLog !== null && daysSinceLog >= 3) sig.push(`Logging gap: last logged ${daysSinceLog} days ago.`)
    const signals = sig.join(' ') || null

    const response = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/call-prep',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clientId,
          clientName: clientProfile?.full_name || 'Client',
          weekData,
          checkIn: checkInPayload(checkInData),
          privateNotes: coachNotes,
          recentMessages: messagesData || [],
          signals
        }),
      }
    )

    const data = await response.json()
    setCallBriefing(data.briefing || data.error || 'Failed to generate briefing.')
    setBriefingLoading(false)
  }

  // Fetch only — do NOT mark read here, so the bubble's unread badge survives
// until the coach actually opens it (markMessagesRead runs on open).
async function fetchMessages() {
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('coach_id', currentSession.user.id)
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (error) console.error(error)
  else setMessages(data)
}

async function markMessagesRead() {
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const unreadIds = messages.filter(m => !m.read_at && m.sender_id !== currentSession.user.id).map(m => m.id)
  if (unreadIds.length === 0) return
  await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds)
  await fetchMessages()
}


async function sendMessage(text) {
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const { error } = await supabase.from('messages').insert([{
    coach_id: currentSession.user.id,
    client_id: clientId,
    sender_id: currentSession.user.id,
    content: text
  }])
  if (error) { console.error(error); throw error }
  await fetchMessages()
}

  async function fetchSentReports() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const { data, error } = await supabase
      .from('reports')
      .select('id, content, week_of, created_at, read_at, archived')
      .eq('coach_id', currentSession.user.id)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    else setSentReports(data)
  }

  function goToPrevDay() {
    const d = addDays(parseLocalDateString(selectedDate), -1)
    setSelectedDate(toLocalDateString(d))
  }

  function goToNextDay() {
    const d = addDays(parseLocalDateString(selectedDate), 1)
    setSelectedDate(toLocalDateString(d))
  }

  const isToday = selectedDate === toLocalDateString(new Date())

  function getCorrelatedChartData() {
    const allDates = [...new Set([
      ...weightHistory.map(d => d.date),
      ...calorieHistory.map(d => d.date),
      ...cardioHistory.map(d => d.date),
    ])].sort((a, b) => a.localeCompare(b))

    const calTarget = parseInt(clientTargets.calories) || null
    const cardioTarget = parseInt(clientTargets.cardio_minutes) || null
    const datasets = []

    if (weightHistory.length > 0) {
      datasets.push({
        type: 'line', label: 'Weight',
        data: allDates.map(date => weightHistory.find(d => d.date === date)?.weight ?? null),
        borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.15)',
        tension: 0.3, fill: false, yAxisID: 'yWeight', pointRadius: 3, spanGaps: true,
      })
    }

    if (calorieHistory.length > 0 && calTarget) {
      const pct = allDates.map(date => {
        const cal = calorieHistory.find(d => d.date === date)?.calories
        return cal ? Math.round((cal / calTarget) * 100) : null
      })
      // Color each bar by the same buckets as the heatmap/summary: green on
      // target (90-110%), orange over (>110%), amber/red under.
      const barColor = (v, a) => v == null ? 'transparent'
        : v > 110 ? `rgba(251, 146, 60, ${a})`
          : v >= 90 ? `rgba(52, 211, 153, ${a})`
            : v >= 60 ? `rgba(251, 191, 36, ${a})`
              : `rgba(248, 113, 113, ${a})`
      datasets.push({
        type: 'bar', label: 'Calories %',
        data: pct,
        backgroundColor: pct.map(v => barColor(v, 0.7)),
        borderColor: pct.map(v => barColor(v, 1)),
        borderWidth: 1, borderRadius: 3, yAxisID: 'yPct',
      })
    }

    if (cardioHistory.length > 0 && cardioTarget) {
      datasets.push({
        type: 'bar', label: 'Cardio %',
        data: allDates.map(date => {
          const mins = cardioHistory.find(d => d.date === date)?.minutes
          return mins ? Math.round((mins / cardioTarget) * 100) : null
        }),
        backgroundColor: 'rgba(59, 130, 246, 0.7)', borderColor: '#3b82f6',
        borderWidth: 1, borderRadius: 3, yAxisID: 'yPct',
      })
    }

    // 100%-of-target reference line, so over/under reads at a glance against the
    // % bars (drawn on the same right axis).
    if ((calorieHistory.length > 0 && calTarget) || (cardioHistory.length > 0 && cardioTarget)) {
      datasets.push({
        type: 'line', label: 'Target', data: allDates.map(() => 100),
        yAxisID: 'yPct', borderColor: CHART.targetLine, borderDash: [4, 4],
        borderWidth: 1, pointRadius: 0, fill: false, tension: 0,
      })
    }

    return { labels: allDates, datasets }
  }

  // Raw "Calories — last 30 days" bar chart: same bucket colors as the heatmap/
  // summary (green on-target, orange over, amber/red under) plus a target line.
  function calorieChartData(plain = false) {
    const calTarget = parseInt(clientTargets.calories) || null
    const barColor = (cal, a) => {
      if (!calTarget || plain) return `rgba(251, 191, 36, ${a})`
      const v = (cal / calTarget) * 100
      return v > 110 ? `rgba(251, 146, 60, ${a})`
        : v >= 90 ? `rgba(52, 211, 153, ${a})`
          : v >= 60 ? `rgba(251, 191, 36, ${a})`
            : `rgba(248, 113, 113, ${a})`
    }
    const datasets = [{
      label: 'Calories',
      data: calorieHistory.map(d => d.calories),
      backgroundColor: calorieHistory.map(d => barColor(d.calories, 0.7)),
      borderColor: calorieHistory.map(d => barColor(d.calories, 1)),
      borderWidth: 1, borderRadius: 4, maxBarThickness: 12,
    }]
    if (calTarget && !plain) {
      datasets.push({
        type: 'line', label: 'Target',
        data: calorieHistory.map(() => calTarget),
        borderColor: CHART.targetLine, borderDash: [4, 4],
        borderWidth: 1, pointRadius: 0, fill: false, tension: 0,
      })
    }
    return { labels: calorieHistory.map(d => d.date), datasets }
  }

  const correlatedChartOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { display: true, labels: { color: CHART.tick, boxWidth: 12, padding: 16 } },
      tooltip: {
        backgroundColor: CHART.tooltipBg, borderColor: CHART.tooltipBorder, borderWidth: 1,
        titleColor: CHART.tooltipTitle, bodyColor: CHART.tooltipBody, padding: 10, cornerRadius: 6,
      }
    },
    scales: {
      x: { ticks: { color: CHART.tick }, grid: { color: CHART.grid } },
      yWeight: {
        type: 'linear', position: 'left',
        ticks: { color: 'var(--color-success)' }, grid: { color: CHART.grid },
      },
      yPct: {
        type: 'linear', position: 'right', min: 0, max: 150,
        ticks: { color: CHART.tick, callback: (v) => `${v}%` },
        grid: { display: false },
      }
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '6px 12px',
    color: 'var(--color-text)',
    fontSize: '1rem'
  }

  const sectionCardStyle = {
    ...cardStyle,
    display: 'flex', flexDirection: 'column', gap: '12px'
  }

  // The section rail's items, in the same live order the page renders (stats
  // pinned, then the coach's saved order via mergeOrder), present-only.
  const presentReorderable = REORDERABLE_KEYS.filter(k => {
    if (k === 'sentReports') return sentReports.length > 0
    if (k === 'correlatedChart') return weightHistory.length > 0 || calorieHistory.length > 0
    if (k === 'weightChart') return weightHistory.length > 1
    if (k === 'calorieChart') return calorieHistory.length > 0
    if (k === 'cardioChart') return cardioHistory.length > 0
    if (k === 'stepsChart') return stepsHistory.length > 0
    return true
  })
  const railSections = [
    { key: 'messages', label: 'Messages' },
    ...['stats', ...mergeOrder(cardOrder, presentReorderable)].map(key => ({ key, label: SECTION_LABELS[key] })),
  ]

  // Rail clicks: the "Messages" item opens the chat bubble (which listens for
  // ?focus=chat); everything else scrolls to its section.
  function handleRailJump(key) {
    if (key === 'messages') {
      const sp = new URLSearchParams(searchParams)
      sp.set('focus', 'chat')
      setSearchParams(sp, { replace: true })
      return
    }
    goToSection(key)
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

  return (
    <>
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="cv-titlerow">
        <div><Button onClick={() => navigate('/')} variant="ghost" size="sm">← Back</Button></div>
        <div style={{ flex: 1, minWidth: '180px', display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <h1>{clientProfile?.full_name || 'Client'}</h1>
          <p style={{ fontSize: 'var(--text-base)', marginTop: '2px' }}>{clientProfile?.email}</p>
          {lockInfo.locked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              <span style={{
                fontSize: 'var(--text-sm)', fontWeight: 700, padding: '3px 10px',
                borderRadius: '999px', backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-error)', color: 'var(--color-error)'
              }}>
                Locked
              </span>
              <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-base)' }}>
                No nutrition logged for {lockInfo.days} days
              </span>
              <Button onClick={unlockClient} variant="danger" size="sm">Unlock</Button>
            </div>
          )}
        </div>
        {(() => {
          const nudge = nudgeReason({ daysSinceLog, hasCheckIn: !!clientCheckIn, checkinDue: checkinPeriod(checkinInterval).dueWindow })
          if (!nudge) return null
          const label = nudge.key === 'checkin' ? 'Nudge to check in' : 'Nudge to log'
          return (
            <button
              onClick={() => nudgeClient(nudge)}
              disabled={nudging}
              className="nudge-btn"
              title={nudge.key === 'checkin' ? 'Emails them a reminder to do this week’s check-in' : 'Emails them a prompt to get back to logging'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: '999px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: '0.82rem', fontWeight: 600, cursor: nudging ? 'default' : 'pointer', opacity: nudging ? 0.6 : 1, whiteSpace: 'nowrap' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {nudging ? 'Nudging…' : label}
            </button>
          )
        })()}
        </div>
      </div>

      <div className="cv-shell">
        <SectionRail sections={railSections} activeKey={activeSection} onJump={handleRailJump} />
        <div className="cv-main">

      {/* AI Tools */}
      <div style={{ ...sectionCardStyle, gap: '16px' }}>
        <div
          onClick={() => setAiToolsCollapsed(!aiToolsCollapsed)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <h2 style={{ margin: 0 }}>Groundwork</h2>
          <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>{aiToolsCollapsed ? '▶' : '▼'}</span>
        </div>

        {!aiToolsCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <button className="gw-tile" onClick={generateCallPrep} disabled={briefingLoading}
                style={{ '--gw-accent': '#a78bfa', display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--radius)', background: 'linear-gradient(135deg, rgba(167,139,250,0.08), rgba(167,139,250,0))', border: '1px solid var(--color-border)', cursor: briefingLoading ? 'default' : 'pointer', color: 'var(--color-text)', opacity: briefingLoading ? 0.65 : 1 }}>
                <span className="gw-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 11, background: 'rgba(167, 139, 250, 0.16)', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h4" /></svg>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{briefingLoading ? 'Preparing meeting prep…' : 'Meeting prep'}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', lineHeight: 1.35 }}>AI brief to walk in prepared — just for you</span>
                </span>
              </button>

              <button className="gw-tile" onClick={generateWeeklyReport} disabled={reportLoading}
                style={{ '--gw-accent': '#34d399', display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--radius)', background: 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(52,211,153,0))', border: '1px solid var(--color-border)', cursor: reportLoading ? 'default' : 'pointer', color: 'var(--color-text)', opacity: reportLoading ? 0.65 : 1 }}>
                <span className="gw-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 11, background: 'rgba(52, 211, 153, 0.16)', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{reportLoading ? 'Drafting report…' : 'Weekly report'}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', lineHeight: 1.35 }}>AI draft to review and send the client</span>
                </span>
              </button>
            </div>

            {callBriefing && (
              <div style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-ai)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontWeight: 600 }}>Meeting brief — {clientProfile?.full_name}</p>
                  <Button onClick={() => setCallBriefing('')} variant="ghost" size="sm">Dismiss</Button>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ai)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Not visible to client</p>
                <pre style={{ color: 'var(--color-text)', fontSize: 'var(--text-base)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{callBriefing}</pre>
              </div>
            )}

            {report && (
              <div style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontWeight: 600 }}>Weekly Report</p>
                <textarea
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  rows={20}
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '14px', color: 'var(--color-text)', fontSize: 'var(--text-base)', lineHeight: '1.7', resize: 'vertical', fontFamily: 'inherit', width: '100%' }}
                />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <Button onClick={sendReport} variant="primary">Send to client</Button>
                  <Button onClick={() => setReport('')} variant="ghost">Discard</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Button onClick={goToPrevDay} variant="muted" size="sm">←</Button>

        <input
          type="date"
          value={selectedDate}
          max={toLocalDateString(new Date())}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={inputStyle}
        />

        <Button onClick={goToNextDay} disabled={isToday} variant="muted" size="sm">→</Button>

        {!isToday && <Button onClick={() => setSelectedDate(toLocalDateString(new Date()))} variant="outline" size="sm">Today</Button>}
      </div>

      <div id="section-stats" style={sectionCardStyle}>
        <SectionHeader title="Today's stats" collapsed={sectionsCollapsed.stats} onToggle={() => toggleSection('stats')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <StatCard label="Calories" value={totals.calories} color="#fbbf24" />
            <StatCard label="Protein" value={`${totals.protein}g`} color="var(--color-protein)" />
            <StatCard label="Carbs" value={`${totals.carbs}g`} color="var(--color-carbs)" />
            <StatCard label="Fat" value={`${totals.fat}g`} color="var(--color-fat)" />
            <StatCard label="Weight" value={weightEntry ? `${weightEntry.weight} ${weightEntry.unit}` : '—'} sub={weightEntry?.weighed_at ? formatTime(weightEntry.weighed_at) : null} color="var(--color-weight)" />
          </div>
        </SectionHeader>
      </div>

      <Reorderable order={cardOrder} onReorder={saveCardOrder} enabled={canReorder}>

      <div key="consistency" id="section-consistency" style={sectionCardStyle}>
        <SectionHeader title="Logging consistency" collapsed={sectionsCollapsed.consistency} onToggle={() => toggleSection('consistency')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px' }}>Current streak <InfoTip text={CONSISTENCY_TIPS.streak} /></p>
              <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.streak > 0 ? 'var(--color-success)' : 'var(--color-muted)' }}>
                {consistency.streak}
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 400 }}> days</span>
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px' }}>Last 7 days <InfoTip text={CONSISTENCY_TIPS.last7} /></p>
              <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.days7 >= 5 ? 'var(--color-success)' : consistency.days7 >= 3 ? 'var(--color-primary)' : 'var(--color-error)' }}>
                {consistency.days7}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 400 }}>/7</span>
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px' }}>Last 30 days <InfoTip text={CONSISTENCY_TIPS.last30} /></p>
              <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.days30 >= 20 ? 'var(--color-success)' : consistency.days30 >= 10 ? 'var(--color-primary)' : 'var(--color-error)' }}>
                {consistency.days30}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 400 }}>/30</span>
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px' }}>Weekdays (Mon-Fri) <InfoTip text={CONSISTENCY_TIPS.weekdays} /></p>
              <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.8 ? 'var(--color-success)' : consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                {consistency.weekdayLogged}
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 400 }}>/{consistency.weekdayTotal}</span>
              </p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>
                {consistency.weekdayTotal > 0 ? Math.round((consistency.weekdayLogged / consistency.weekdayTotal) * 100) : 0}%
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px' }}>Weekends (Sat-Sun) <InfoTip text={CONSISTENCY_TIPS.weekends} /></p>
              <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.weekendLogged / (consistency.weekendTotal || 1) >= 0.8 ? 'var(--color-success)' : consistency.weekendLogged / (consistency.weekendTotal || 1) >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                {consistency.weekendLogged}
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 400 }}>/{consistency.weekendTotal}</span>
              </p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>
                {consistency.weekendTotal > 0 ? Math.round((consistency.weekendLogged / consistency.weekendTotal) * 100) : 0}%
              </p>
            </div>
          </div>
          {consistency.bestWeekStart && (
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
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px' }}>
                  Best week (last 90 days) <InfoTip text={CONSISTENCY_TIPS.bestWeek} />
                </p>
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: 0 }}>
                  {consistency.bestWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' – '}
                  {consistency.bestWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{
                  fontWeight: 700,
                  fontSize: '1.5rem',
                  color: consistency.bestWeekCount === 7 ? 'var(--color-success)' : consistency.bestWeekCount >= 5 ? 'var(--color-warning)' : 'var(--color-muted)',
                  margin: 0,
                  lineHeight: 1,
                }}>
                  {consistency.bestWeekCount}
                  <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 400 }}>/7</span>
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: '2px' }}>
                  days logged
                </p>
              </div>
            </div>
          )}
          <div style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 18,
            marginTop: 18,
          }}>
            <p style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
              marginBottom: 16,
              marginTop: 0,
            }}>
              Calorie Compliance - Last 90 Days
            </p>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 300px', minWidth: 0, maxWidth: 440 }}>
                <ComplianceHeatmap
                  logsByDate={heatmapData}
                  calorieTarget={clientTargets.calories}
                />
              </div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <ComplianceSummary
                  logsByDate={heatmapData}
                  calorieTarget={clientTargets.calories}
                  variant="coach"
                />
              </div>
            </div>
            {/* Full-width strip under the heatmap+summary row */}
            <ComplianceBreakdown
              logsByDate={heatmapData}
              calorieTarget={clientTargets.calories}
            />
          </div>
        </SectionHeader>
      </div>

      {sentReports.length > 0 && (
        <div key="sentReports" id="section-sentReports" style={sectionCardStyle}>
          <SectionHeader title="Sent reports" collapsed={sectionsCollapsed.sentReports} onToggle={() => toggleSection('sentReports')}>
            {groupByWeek(sentReports).map(([week, weekReports]) => {
              const isCollapsed = collapsedSentWeeks[week] !== false
              const unreadCount = weekReports.filter(r => !r.read_at).length
              return (
                <div key={week} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <div
                    onClick={() => setCollapsedSentWeeks(prev => ({ ...prev, [week]: !isCollapsed }))}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', backgroundColor: 'var(--color-bg)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>Week of {week}</span>
                      <span style={{ backgroundColor: 'var(--color-border)', color: 'var(--color-muted)', fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                        {weekReports.length} {weekReports.length === 1 ? 'report' : 'reports'}
                      </span>
                      {unreadCount > 0 && (
                        /* eslint-disable-next-line no-restricted-syntax -- decorative "unread" badge palette */
                        <span style={{ backgroundColor: '#1e3a5f', color: '#93c5fd', fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                    <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>{isCollapsed ? '▶' : '▼'}</span>
                  </div>
                  {!isCollapsed && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
                      {weekReports.map(r => (
                        <div key={r.id} style={{ borderLeft: `3px solid ${r.read_at ? 'var(--color-success)' : 'var(--color-primary)'}`, backgroundColor: 'var(--color-bg)', borderRadius: '0 var(--radius) var(--radius) 0', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                              Sent {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {r.archived && (
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', backgroundColor: 'var(--color-border)', padding: '2px 7px', borderRadius: '999px' }}>Archived</span>
                              )}
                              {/* eslint-disable-next-line no-restricted-syntax -- decorative read/unread report-status palette */}
                              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', backgroundColor: r.read_at ? '#064e3b' : '#1e3a5f', color: r.read_at ? 'var(--color-success)' : '#93c5fd' }}>
                                {r.read_at ? '✓ Read' : 'Unread'}
                              </span>
                            </div>
                          </div>
                          <p style={{ color: 'var(--color-text)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontSize: 'var(--text-base)' }}>{r.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </SectionHeader>
        </div>
      )}

      <div key="targets" id="section-targets" style={{ ...sectionCardStyle, gap: '16px' }}>
        <SectionHeader title="Client targets" collapsed={sectionsCollapsed.targets} onToggle={() => toggleSection('targets')}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', marginTop: '8px' }}>
            Set daily goals for {clientProfile?.full_name || 'this client'}. These appear on their dashboard.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '14px 0', borderBottom: '1px solid var(--color-border)', marginBottom: '12px' }}>
            <div>
              <p style={{ fontWeight: 600, margin: 0 }}>Hide calories from client</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0 }}>
                For clients with a sensitive relationship with calorie tracking.
              </p>
            </div>
            <button
              type="button"
              onClick={toggleHideCalories}
              aria-pressed={hideCaloriesToggle}
              aria-label="Hide calories from client"
              style={{
                width: '44px', height: '24px', borderRadius: '999px', border: 'none',
                backgroundColor: hideCaloriesToggle ? 'var(--color-primary)' : 'var(--color-border)',
                cursor: 'pointer', position: 'relative', transition: 'background-color 0.2s',
                flexShrink: 0
              }}
            >
              <span style={{
                position: 'absolute', top: '2px',
                left: hideCaloriesToggle ? '22px' : '2px',
                width: '20px', height: '20px', borderRadius: '50%',
                backgroundColor: 'var(--color-on-accent)', transition: 'left 0.2s',
              }} />
            </button>
          </div>
          {/* Onboarding assessment → starting macros, so a new client isn't a
              blank slate. Fills the calorie/macro inputs; coach reviews + saves. */}
          <div style={{ marginBottom: '4px' }}>
            <button
              type="button"
              onClick={() => setShowTargetCalc(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-primary)', padding: 0 }}
            >
              {showTargetCalc ? 'Hide calculator' : '🧮 Calculate from stats'}
            </button>
            {showTargetCalc && (
              <div style={{ marginTop: '12px' }}>
                <TargetCalculator
                  defaultWeightUnit={clientTargets.weight_goal_unit}
                  onApply={(t) => {
                    setClientTargets(prev => ({ ...prev, calories: String(t.calories), protein: String(t.protein), carbs: String(t.carbs), fat: String(t.fat) }))
                    setShowTargetCalc(false)
                  }}
                />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {[
              { label: 'Calories', key: 'calories', placeholder: 'e.g. 2000' },
              { label: 'Protein (g)', key: 'protein', placeholder: 'e.g. 150' },
              { label: 'Carbs (g)', key: 'carbs', placeholder: 'e.g. 200' },
              { label: 'Fat (g)', key: 'fat', placeholder: 'e.g. 65' },
              { label: 'Cardio (min/day)', key: 'cardio_minutes', placeholder: 'e.g. 30' },
              { label: 'Steps/day', key: 'steps', placeholder: 'e.g. 10000' },
            ].map(f => (
              <div key={f.key}>
                <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px', color: 'var(--color-muted)' }}>{f.label}</p>
                <input
                  type="number"
                  placeholder={f.placeholder}
                  value={clientTargets[f.key]}
                  onChange={(e) => setClientTargets({ ...clientTargets, [f.key]: e.target.value })}
                  style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '1rem', width: '100%' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: '4px' }}>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: '6px', color: 'var(--color-muted)' }}>Weight goal</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder="e.g. 175"
                value={clientTargets.weight_goal}
                onChange={(e) => setClientTargets({ ...clientTargets, weight_goal: e.target.value })}
                style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '1rem', flex: 1 }}
              />
              <select
                value={clientTargets.weight_goal_unit}
                onChange={(e) => setClientTargets({ ...clientTargets, weight_goal_unit: e.target.value })}
                style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '1rem', width: '80px', cursor: 'pointer' }}
              >
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <Button onClick={saveClientTargets} variant="primary">
              {targetsSaved ? 'Saved ✓' : 'Save targets'}
            </Button>
          </div>
        </SectionHeader>
      </div>

      <div key="nutritionLog" id="section-nutritionLog" style={sectionCardStyle}>
        <SectionHeader title="Nutrition log" collapsed={sectionsCollapsed.nutritionLog} onToggle={() => toggleSection('nutritionLog')}>
          <div style={{ marginBottom: '10px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              fontSize: 'var(--text-sm)', fontWeight: 600,
              padding: '4px 10px', borderRadius: 'var(--radius)',
              color: dayComplete ? 'var(--color-success)' : 'var(--color-muted)',
              backgroundColor: dayComplete ? 'rgba(52,211,153,0.12)' : 'var(--color-bg)',
              border: `1px solid ${dayComplete ? 'rgba(52,211,153,0.4)' : 'var(--color-border)'}`,
            }}>
              {dayComplete ? '✓ Client marked this day complete' : 'Day not marked complete — totals may be partial'}
            </span>
          </div>
          {entries.length === 0 ? (
            <EmptyState
              icon={null}
              title="No entries for this day"
              description="Client hasn't logged any nutrition yet."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {groupEntriesByMeal(entries).map((group) => (
                <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)' }}>{group.label}</span>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{group.calories} cal</span>
                  </div>
                  {groupLoggedMeals(group.entries).map((item) => item.type === 'meal' ? (
                    <div key={item.id} style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700 }}>🍽 {item.name}</span>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: 'var(--text-base)' }}>{item.calories} cal</span>
                      </div>
                      {item.entries.map((entry) => (
                        <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                          <span>{entry.food}</span>
                          <span>{entry.calories} cal · P {entry.protein}g · {entry.serving_size}{entry.serving_unit}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div key={item.entry.id} style={{
                      backgroundColor: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius)',
                      padding: '14px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>{item.entry.food}</span>
                      <div style={{ display: 'flex', gap: '16px', fontSize: 'var(--text-base)' }}>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{item.entry.calories} cal</span>
                        <span style={{ color: 'var(--color-muted)' }}>P: {item.entry.protein}g</span>
                        <span style={{ color: 'var(--color-muted)' }}>C: {item.entry.carbs}g</span>
                        <span style={{ color: 'var(--color-muted)' }}>F: {item.entry.fat}g</span>
                        <span style={{ color: 'var(--color-muted)' }}>{item.entry.serving_size}{item.entry.serving_unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </SectionHeader>
      </div>

      <div key="checkIn" id="section-checkIn" style={sectionCardStyle}>
        <SectionHeader title={checkinInterval > 1 ? "This period's check-in" : "This week's check-in"} collapsed={sectionsCollapsed.checkIn} onToggle={() => toggleSection('checkIn')}>
          {/* Check-in config: this client's cadence + a pointer to the shared
              questionnaire (which is per-coach, so it lives on Profile). */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', paddingBottom: '12px', marginBottom: '4px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>Cadence:</span>
              {CADENCE_OPTIONS.map(opt => {
                const active = checkinInterval === opt.weeks
                return (
                  <button
                    key={opt.weeks}
                    type="button"
                    onClick={() => updateCadence(opt.weeks)}
                    disabled={savingCadence}
                    aria-pressed={active}
                    style={{
                      background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: active ? 'var(--color-on-accent)' : 'var(--color-muted)',
                      border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      borderRadius: '999px', padding: '4px 10px', fontSize: 'var(--text-xs)',
                      fontWeight: 600, cursor: savingCadence ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => navigate('/profile?focus=questionnaire')}
              title="Check-in questions apply to all your clients — edit them on your Profile"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-primary)', padding: 0 }}
            >
              Customize questions →
            </button>
          </div>
          {!clientCheckIn ? (
            <div style={{ paddingTop: '8px' }}>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>No check-in submitted {checkinInterval > 1 ? 'this period' : 'this week'} ({cadenceLabel(checkinInterval).toLowerCase()}).</p>
            </div>
          ) : (
            <>
              {Array.isArray(clientCheckIn.answers) && clientCheckIn.answers.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {clientCheckIn.answers.map((a, i) => (
                    <div key={a.question_id || i}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.prompt}</p>
                      {a.type === 'text'
                        ? <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{(a.value && String(a.value).trim()) ? a.value : '—'}</p>
                        : <p style={{ fontWeight: 700, fontSize: '1.125rem' }}>{formatAnswer(a)}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px' }}>Adherence</p>
                      <p style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{clientCheckIn.adherence_rating}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>/10</span></p>
                    </div>
                    <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: '4px' }}>Energy level</p>
                      <p style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{clientCheckIn.energy_level}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>/10</span></p>
                    </div>
                  </div>
                  {clientCheckIn.obstacles && (
                    <div style={{ paddingTop: '4px' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Obstacles</p>
                      <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{clientCheckIn.obstacles}</p>
                    </div>
                  )}
                  {clientCheckIn.notes && (
                    <div style={{ paddingTop: '4px' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes for coach</p>
                      <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{clientCheckIn.notes}</p>
                    </div>
                  )}
                </>
              )}
              <div style={{ paddingTop: '12px', marginTop: '4px', borderTop: '1px solid var(--color-border)' }}>
                {clientCheckIn.reviewed_at ? (
                  <>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 600 }}>✓ Reviewed</p>
                    {clientCheckIn.coach_comment && (
                      <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6', marginTop: '6px' }}>{clientCheckIn.coach_comment}</p>
                    )}
                  </>
                ) : (
                  <>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Optional comment for the client…"
                      rows={2}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'inherit', fontSize: 'var(--text-base)', resize: 'vertical' }}
                    />
                    <Button onClick={reviewCheckIn} variant="primary" size="sm" loading={reviewing} style={{ marginTop: '8px' }}>Mark reviewed</Button>
                  </>
                )}
              </div>
            </>
          )}
        </SectionHeader>
      </div>

      <div key="privateNotes" id="section-privateNotes" style={sectionCardStyle}>
        <SectionHeader title="Private notes" collapsed={sectionsCollapsed.privateNotes} onToggle={() => toggleSection('privateNotes')}>
            <textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              readOnly={!editingNotes}
              placeholder="Notes history will appear here..."
              rows={6}
              style={{
                backgroundColor: 'var(--color-bg)',
                border: `1px solid ${editingNotes ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                color: editingNotes ? 'var(--color-text)' : 'var(--color-muted)',
                fontSize: 'var(--text-sm)',
                lineHeight: '1.8',
                resize: editingNotes ? 'vertical' : 'none',
                fontFamily: 'monospace',
                width: '100%',
                cursor: editingNotes ? 'text' : 'default'
              }}
            />
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea
                value={newNoteEntry}
                onChange={(e) => setNewNoteEntry(e.target.value)}
                placeholder="Add a note..."
                rows={3}
                style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  padding: '10px 14px',
                  color: 'var(--color-text)',
                  fontSize: 'var(--text-base)',
                  lineHeight: '1.6',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  width: '100%'
                }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button onClick={addNoteEntry} variant="primary" size="sm">
                  {notesSaved ? 'Saved ✓' : 'Add note'}
                </Button>
                {!editingNotes ? (
                  <Button onClick={() => setEditingNotes(true)} variant="ghost" size="sm">
                    Edit history
                  </Button>
                ) : (
                  <>
                    <Button onClick={() => { saveCoachNotes(); setEditingNotes(false) }} variant="outline" size="sm">
                      Save edits
                    </Button>
                    <Button onClick={() => { fetchCoachNotes(); setEditingNotes(false) }} variant="ghost" size="sm">
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
        </SectionHeader>
      </div>

      {(weightHistory.length > 0 || calorieHistory.length > 0) && (
        <div key="correlatedChart" id="section-correlatedChart" style={sectionCardStyle}>
          <SectionHeader title="Progress overview" collapsed={sectionsCollapsed.correlatedChart} onToggle={() => toggleSection('correlatedChart')} animated={false}>
            {!sectionsCollapsed.correlatedChart && (
              <div style={{ paddingTop: '8px' }}>
                <Chart type="bar" data={getCorrelatedChartData()} options={correlatedChartOptions} />
                <EnergyBalanceRead
                  calorieSeries={energySeries.calories}
                  weightSeries={energySeries.weights}
                  calorieTarget={clientTargets.calories}
                  weightGoal={clientTargets.weight_goal}
                  weightGoalUnit={clientTargets.weight_goal_unit}
                />
              </div>
            )}
          </SectionHeader>
        </div>
      )}

      {weightHistory.length > 1 && (
        <div key="weightChart" id="section-weightChart" style={sectionCardStyle}>
          <SectionHeader title="Weight trend" collapsed={sectionsCollapsed.weightChart} onToggle={() => toggleSection('weightChart')} animated={false}>
            {!sectionsCollapsed.weightChart && (
              <Line
                data={{
                  labels: weightHistory.map(d => d.date),
                  datasets: [
                    {
                      label: 'Weight',
                      data: weightHistory.map(d => d.weight),
                      borderColor: '#34d399',
                      backgroundColor: 'rgba(52, 211, 153, 0.15)',
                      pointRadius: 3,
                      tension: 0.3,
                      fill: true,
                    },
                    {
                      label: '7-day avg',
                      data: computeRollingAverage(weightHistory),
                      borderColor: 'rgba(52, 211, 153, 0.45)',
                      backgroundColor: 'transparent',
                      borderDash: [4, 4],
                      pointRadius: 0,
                      tension: 0.3,
                      fill: false,
                    },
                  ]
                }}
                options={chartOptions}
              />
            )}
          </SectionHeader>
        </div>
      )}

      {calorieHistory.length > 0 && (
        <div key="calorieChart" id="section-calorieChart" style={sectionCardStyle}>
          <SectionHeader title="Calories — last 30 days" action={<ChartColorToggle plain={plainCharts.has('calorieChart')} onToggle={() => togglePlain('calorieChart')} />} collapsed={sectionsCollapsed.calorieChart} onToggle={() => toggleSection('calorieChart')} animated={false}>
            {!sectionsCollapsed.calorieChart && (
              <Bar data={calorieChartData(plainCharts.has('calorieChart'))} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      {cardioHistory.length > 0 && (
        <div key="cardioChart" id="section-cardioChart" style={sectionCardStyle}>
          <SectionHeader title="Cardio — last 30 days" action={<ChartColorToggle plain={plainCharts.has('cardioChart')} onToggle={() => togglePlain('cardioChart')} />} collapsed={sectionsCollapsed.cardioChart} onToggle={() => toggleSection('cardioChart')} animated={false}>
            {!sectionsCollapsed.cardioChart && (
              <Bar data={metricBarData({ history: cardioHistory, valueKey: 'minutes', label: 'Minutes', target: parseInt(clientTargets.cardio_minutes) || null, fallback: (a) => `rgba(59, 130, 246, ${a})`, plain: plainCharts.has('cardioChart') })} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      {stepsHistory.length > 0 && (
        <div key="stepsChart" id="section-stepsChart" style={sectionCardStyle}>
          <SectionHeader title="Steps — last 30 days" action={<ChartColorToggle plain={plainCharts.has('stepsChart')} onToggle={() => togglePlain('stepsChart')} />} collapsed={sectionsCollapsed.stepsChart} onToggle={() => toggleSection('stepsChart')} animated={false}>
            {!sectionsCollapsed.stepsChart && (
              <Bar data={metricBarData({ history: stepsHistory, valueKey: 'steps', label: 'Steps', target: parseInt(clientTargets.steps) || null, fallback: (a) => `rgba(167, 139, 250, ${a})`, plain: plainCharts.has('stepsChart') })} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      </Reorderable>

      <div style={{ ...sectionCardStyle }}>
        <h2>Coaching</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
          End the coaching relationship and return {clientProfile?.full_name || 'this client'} to a solo account. Their data is preserved.
        </p>
        {!showOffboardConfirm ? (
          <div>
            <Button
              onClick={() => setShowOffboardConfirm(true)}
              variant="danger"
              size="sm"
            >
              Offboard client
            </Button>
          </div>
        ) : (
          <div style={{
            padding: '14px 16px',
            border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius)',
            backgroundColor: 'rgba(248,113,113,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <p style={{ fontSize: 'var(--text-base)', margin: 0 }}>
              This will end the coaching relationship and return <strong>{clientProfile?.full_name}</strong> to a solo account. Their data is preserved and they can continue tracking independently.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                onClick={offboardClient}
                variant="danger-solid"
                size="sm"
                loading={offboarding}
              >
                Confirm offboard
              </Button>
              <Button
                onClick={() => setShowOffboardConfirm(false)}
                variant="ghost"
                size="sm"
                disabled={offboarding}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
    <ChatBubble
      key={clientId}
      messages={messages}
      currentUserId={profile?.id}
      recipientName={clientProfile?.full_name || 'client'}
      onSend={sendMessage}
      onMarkRead={markMessagesRead}
    />
    <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </>
  )
}

export default ClientView
