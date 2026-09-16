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
import { computeWeightTarget, convertWeight, convertGoalValue, normUnit } from '../utils/weightTarget'
import { measurementCadenceDays, measurementStatus } from '../utils/measurementCadence'
import { useMediaQuery } from '../hooks/useMediaQuery'
import Reorderable from '../components/Reorderable'
import SectionRail from '../components/SectionRail'
import TargetCalculator from '../components/TargetCalculator'
import { mergeOrder } from '../utils/cardOrder'
import { resolveLockState } from '../utils/lockState'
import { ageFromBirthDate } from '../utils/biometrics'
import Avatar from '../components/Avatar'
import { energyBalanceRead, WINDOW_OPTIONS, WINDOW_DATA_DAYS } from '../utils/energyBalanceRead'
import { computeClientStats } from '../utils/clientStats'
import { attentionLevel } from '../utils/attentionLevel'
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
import { Icon, Pill, Field, Select, Textarea } from '../components/ui'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler
)

// These three are literals on purpose. The first two are values OF a custom
// property (--gw-accent), which the .gw-tile gradient consumes directly; the
// third is a chart.js dataset colour on a canvas that cannot read a CSS var.
// Keep them matched to --color-ai and --color-weight by hand.
/* eslint-disable no-restricted-syntax -- see above */
const GW_ACCENT_AI = '#a78bfa'
const GW_ACCENT_REPORT = '#34d399'
const CHART_SERIES = '#34d399'
/* eslint-enable no-restricted-syntax */

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
  measurements: 'Measurements',
}
const REORDERABLE_KEYS = ['consistency', 'sentReports', 'targets', 'nutritionLog', 'checkIn', 'privateNotes', 'correlatedChart', 'weightChart', 'calorieChart', 'cardioChart', 'stepsChart', 'measurements']

// Tape-measurement sites (must match Log.jsx MEASUREMENT_SITES / the columns).
const MEASUREMENT_SITES = [
  { key: 'neck', label: 'Neck' }, { key: 'chest', label: 'Chest' }, { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' }, { key: 'arm', label: 'Arm' }, { key: 'thigh', label: 'Thigh' },
]

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
  const [measHistory, setMeasHistory] = useState([])
  const [plainCharts, togglePlain] = usePlainCharts()
  // Column budget for the body-measurement small-multiples (3 desktop / 2 tablet
  // / 1 phone). The actual count is balanced against the number of sites below,
  // so the trend charts always tile into even rows with no trailing gap.
  const measViewWide = useMediaQuery('(min-width: 1000px)')
  const measViewMid = useMediaQuery('(min-width: 640px)')
  const measColsMax = measViewWide ? 3 : measViewMid ? 2 : 1
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
  const [statusStats, setStatusStats] = useState(null) // this client's triage facts (computeClientStats)
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
  // Coach's chosen energy-balance window (persisted). The read is window-agnostic;
  // this just picks the span. Default 21 (see WINDOW_OPTIONS rationale).
  const [ebWindowDays, setEbWindowDays] = useState(() => {
    try { const v = parseInt(localStorage.getItem('gardnr-eb-window'), 10); if (WINDOW_OPTIONS.includes(v)) return v } catch { /* ignore */ }
    return 21
  })
  const changeEbWindow = (d) => {
    setEbWindowDays(d)
    try { localStorage.setItem('gardnr-eb-window', String(d)) } catch { /* ignore */ }
  }
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
    measurements: false,
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
  }, [cardOrder, weightHistory, calorieHistory, cardioHistory, stepsHistory, sentReports, measHistory])

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
  fetchClientStatus()
  fetchClientMeasurements()
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
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/offboard-client`,
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
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nudge-client`,
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
  // Each history row carries BOTH forms of its date:
  //   iso  — '2026-07-12', the full date. Sort and key on this, always.
  //   date — '07-12', for the axis label only.
  //
  // They used to be the same value: the date was truncated to MM-DD at fetch,
  // and then SORTED as a string. Which works for eleven months of the year and
  // then, every January, puts '01-05' before '12-20' — scrambling the x-axis of
  // every chart on this page and drawing the weight line backwards through time.
  // Truncate for display; never for arithmetic.
  const shortDate = (iso) => iso.slice(5)

  async function fetchWeightHistory() {
  // The most recent 30 weigh-ins, put back in chronological order.
  //
  // This was `.order('logged_date', { ascending: true }).limit(30)` — which takes
  // the OLDEST thirty. Any client with more than 30 weigh-ins had a weight chart
  // frozen on their first month FOREVER: it never showed recent weight, and a
  // coach reading it would conclude the client had stopped moving. It is the
  // single most load-bearing chart on the page, and it was lying.
  const { data, error } = await supabase
    .from('weight_log').select('logged_date, weight, unit')
    .eq('user_id', clientId)
    .order('logged_date', { ascending: false }).limit(30)
  if (error) console.error(error)
  else setWeightHistory(
    [...data].reverse().map(d => ({ iso: d.logged_date, date: shortDate(d.logged_date), weight: parseFloat(d.weight), unit: d.unit }))
  )
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
    setCalorieHistory(Object.entries(grouped).map(([iso, calories]) => ({
      iso, date: shortDate(iso), calories
    })).sort((a, b) => a.iso.localeCompare(b.iso)))
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
    setCardioHistory(Object.entries(grouped).map(([iso, minutes]) => ({
      iso, date: shortDate(iso), minutes
    })).sort((a, b) => a.iso.localeCompare(b.iso)))
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
    iso: d.logged_date, date: shortDate(d.logged_date), steps: d.steps
  })).sort((a, b) => a.iso.localeCompare(b.iso)))
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

// This client's triage facts via the SAME engine the roster uses (one brain),
// so the at-a-glance status banner can't drift from the roster's verdict. Lock
// state is layered in from ClientView's own lockInfo at render time.
async function fetchClientStatus() {
  const map = await computeClientStats([clientId])
  setStatusStats(map[clientId] || null)
}

async function fetchClientMeasurements() {
  const { data, error } = await supabase
    .from('body_measurements').select('*')
    .eq('user_id', clientId).order('logged_date', { ascending: true })
  if (error) { console.error(error); return }
  setMeasHistory(data || [])
}

// Dedicated pull for the Energy Balance Read — full dates + weight unit. Fetches
// WINDOW_DATA_DAYS (≥ 2× the longest selectable window) so switching windows and
// the prior-window trajectory never need a re-fetch. (Chart fetches are separate:
// year-stripped, 30-day, and earliest-30.)
async function fetchEnergyBalance() {
  const start = new Date(); start.setDate(start.getDate() - (WINDOW_DATA_DAYS - 1))
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
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weekly-report`,
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
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-report`, {
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

    // No `reaction`: it was fetched only to feed the call-prep prompt, and it has
    // been write-dead since reactions were removed in 60cc27f. See call-prep.
    const { data: messagesData } = await supabase
      .from('messages').select('content, created_at')
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
    // Uses the coach's chosen window so the brief matches the panel on screen.
    const eb = energyBalanceRead({
      calorieSeries: energySeries.calories,
      weightSeries: energySeries.weights,
      calorieTarget: clientTargets.calories,
      weightGoal: clientTargets.weight_goal,
      weightGoalUnit: clientTargets.weight_goal_unit,
      windowDays: ebWindowDays,
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
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/call-prep`,
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

  // Weight axes across this view render in the goal's unit (falling back to the
  // latest logged unit) so every weight chart agrees; mirrors the weight-trend
  // chart's display-unit rule.
  const weightDisplayUnit = clientTargets.weight_goal
    ? normUnit(clientTargets.weight_goal_unit)
    : normUnit(weightHistory[weightHistory.length - 1]?.unit)

  function getCorrelatedChartData() {
    // Union and sort on the FULL date. Sorting the MM-DD label instead is what
    // put January to the left of the previous December.
    const allDates = [...new Set([
      ...weightHistory.map(d => d.iso),
      ...calorieHistory.map(d => d.iso),
      ...cardioHistory.map(d => d.iso),
    ])].sort((a, b) => a.localeCompare(b))

    const calTarget = parseInt(clientTargets.calories) || null
    const cardioTarget = parseInt(clientTargets.cardio_minutes) || null
    const datasets = []

    if (weightHistory.length > 0) {
      datasets.push({
        type: 'line', label: 'Weight',
        data: allDates.map(iso => {
          const row = weightHistory.find(d => d.iso === iso)
          return row ? Math.round(convertWeight(row.weight, normUnit(row.unit || weightDisplayUnit), weightDisplayUnit) * 10) / 10 : null
        }),
        // eslint-disable-next-line no-restricted-syntax -- chart.js renders to a canvas and cannot resolve a CSS var; kept matched to the metric token by hand.
        borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.15)',
        tension: 0.3, fill: false, yAxisID: 'yWeight', pointRadius: 3, spanGaps: true,
      })
    }

    if (calorieHistory.length > 0 && calTarget) {
      const pct = allDates.map(iso => {
        const cal = calorieHistory.find(d => d.iso === iso)?.calories
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
        data: allDates.map(iso => {
          const mins = cardioHistory.find(d => d.iso === iso)?.minutes
          return mins ? Math.round((mins / cardioTarget) * 100) : null
        }),
        // eslint-disable-next-line no-restricted-syntax -- chart.js renders to a canvas and cannot resolve a CSS var; kept matched to the metric token by hand.
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

    // Full dates for the maths above; the short label only at the axis.
    return { labels: allDates.map(shortDate), datasets }
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
        // chart.js cannot read CSS variables from a canvas. These two were
        // var(--color-success), which resolves to nothing on a canvas, so the
        // axis this code meant to paint green has always rendered in chart.js's
        // default grey. CHART_SERIES is the matched literal, as elsewhere here.
        title: { display: true, text: `Weight (${weightDisplayUnit})`, color: CHART_SERIES },
        ticks: { color: CHART_SERIES }, grid: { color: CHART.grid },
      },
      yPct: {
        type: 'linear', position: 'right', min: 0, max: 150,
        title: { display: true, text: '% of target', color: CHART.tick },
        ticks: { color: CHART.tick, callback: (v) => `${v}%` },
        grid: { display: false },
      }
    }
  }

  // A2: two densities and no third. These sections are read and typed into, so
  // they take ui/Panel's `comfortable` body padding verbatim — cardStyle's
  // --space-md (16px) was a third density, and it made every panel on this page
  // sit tighter than every Panel on the roster.
  const sectionCardStyle = {
    ...cardStyle,
    padding: 'var(--space-20) var(--space-24)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-12)'
  }

  // The section rail's items, in the same live order the page renders (stats
  // pinned, then the coach's saved order via mergeOrder), present-only.
  // Coach's per-chart visibility prefs (Profile → Charts). Stored on the coach's
  // own profile.layout; hides the listed chart sections from every client view.
  const hiddenCharts = profile?.layout?.hiddenCharts || []
  // Chart sections always render (with an empty-state hint when there's no data
  // yet) so the coach can discover them; they're only removed when the coach
  // toggles them off (hiddenCharts) or, for sentReports (a list, not a chart),
  // when there's nothing to show.
  const presentReorderable = REORDERABLE_KEYS.filter(k => {
    if (hiddenCharts.includes(k)) return false
    if (k === 'sentReports') return sentReports.length > 0
    return true
  })
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

  // Value-axis title so every chart names its metric + unit (matches the
  // weight-trend chart). Same base options; only the y-axis title differs.
  const withYTitle = (base, text) => ({
    ...base,
    scales: { ...base.scales, y: { ...base.scales.y, title: { display: true, text, color: CHART.tick } } },
  })
  const calorieChartOptions = withYTitle(chartOptions, 'Calories (kcal)')
  const cardioChartOptions = withYTitle(chartOptions, 'Cardio (min)')
  const stepsChartOptions = withYTitle(chartOptions, 'Steps')

  // Compact options for the measurement small-multiples (no legend, short).
  const miniChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false }, tooltip: chartOptions.plugins.tooltip },
    scales: {
      x: { ticks: { color: CHART.tick, maxTicksLimit: 4, font: { size: 9 } }, grid: { display: false } },
      y: { ticks: { color: CHART.tick, maxTicksLimit: 4, font: { size: 9 } }, grid: { color: CHART.grid } },
    },
  }

  // Body-measurement freshness: recommended re-measure cadence is phase-derived
  // (cutting → 2 wk, else 4 wk — measurementCadence.js) from the client's weight
  // goal, and compared to their latest measurement so the coach sees at a glance
  // whether the tape data is current or stale (measurements move slowly, so a
  // frozen trend is easy to miss otherwise).
  const measDirection = computeWeightTarget({
    weightHistory, weightGoal: clientTargets.weight_goal, weightGoalUnit: clientTargets.weight_goal_unit,
  })?.direction ?? null
  const measStatus = measHistory.length
    ? measurementStatus({ lastMeasuredIso: measHistory[measHistory.length - 1].logged_date, cadenceDays: measurementCadenceDays(measDirection) })
    : null

  // Right-hand values for the rail. Only the handful of sections that can be
  // "behind" get one — a value on every row would be noise, and a rail where
  // everything is annotated annotates nothing. Tones match the roster's status
  // column so amber means the same thing in both places.
  const unreadFromClient = messages.filter(m => !m.read_at && m.sender_id === clientId).length
  const railMeta = {
    messages: unreadFromClient > 0 ? { meta: unreadFromClient, metaTone: 'warning' } : null,
    checkIn: !clientCheckIn ? { meta: 'Due', metaTone: 'warning' } : (!clientCheckIn.reviewed_at ? { meta: 'New', metaTone: 'success' } : null),
    nutritionLog: daysSinceLog != null && daysSinceLog >= 3
      ? { meta: `${daysSinceLog}d`, metaTone: daysSinceLog >= 4 ? 'error' : 'warning' }
      : null,
    measurements: measStatus?.due ? { meta: 'Due', metaTone: 'warning' } : null,
    sentReports: sentReports.filter(r => !r.read_at).length > 0
      ? { meta: `${sentReports.filter(r => !r.read_at).length} unread` }
      : null,
  }
  const railItem = (key, label) => ({ key, label, ...(railMeta[key] || {}) })

  // Two groups, and the split is structural rather than thematic: Messages is
  // the one row that does not scroll to a section (it opens the chat), so it
  // cannot sit in a list the scroll-spy drives. Everything below it stays in
  // the page's live order — the coach can drag the sections around, and a rail
  // sorted any other way would make the active highlight jump while scrolling.
  const railGroups = [
    { label: null, items: [railItem('messages', 'Messages')] },
    {
      label: 'This client',
      items: ['stats', ...mergeOrder(cardOrder, presentReorderable)].map(key => railItem(key, SECTION_LABELS[key])),
    },
    // Pinned to the foot of the rail, above a rule — the same place Cloudflare
    // parks "Manage account". Coaching is the one section that is about the
    // RELATIONSHIP rather than the client's data, and it was the only section
    // on the page the rail could not reach at all.
    { label: null, pin: 'bottom', items: [railItem('coaching', 'Coaching')] },
  ]

  // The rail's slack, spent on the numbers every other section is implicitly
  // measured against. A coach reading the nutrition log, the calorie chart or a
  // check-in is comparing to these the whole way down, and until now had to
  // scroll back to the Targets panel to see them. Reference only — no borders,
  // no fills (a bordered card inside the rail would be a panel inside a panel),
  // just a label and a tabular column.
  const targetRows = [
    { label: 'Calories', value: clientTargets.calories },
    { label: 'Protein', value: clientTargets.protein, unit: 'g' },
    { label: 'Carbs', value: clientTargets.carbs, unit: 'g' },
    { label: 'Fat', value: clientTargets.fat, unit: 'g' },
    { label: 'Steps', value: clientTargets.steps },
  ].filter(r => r.value !== '' && r.value != null)

  const railFooter = targetRows.length > 0 ? (
    <>
      <p className="cv-rail-grouplabel">Daily targets</p>
      <dl className="cv-railstats">
        {targetRows.map(r => (
          <div key={r.label} className="cv-railstat">
            <dt>{r.label}</dt>
            <dd className="tnum">{Number(r.value).toLocaleString()}{r.unit || ''}</dd>
          </div>
        ))}
      </dl>
    </>
  ) : (
    /* No targets is a gap the coach can close in seconds, so it is an action
       rather than a dead label — the same call the roster makes on its own
       "No targets set" cell. */
    <button type="button" className="cv-rail-settargets ds-control" onClick={() => goToSection('targets')}>
      Set daily targets <Icon name="right" />
    </button>
  )

  // Shown inside a chart section when the client hasn't logged that data yet —
  // uses the app's EmptyState (icon + title + hint), not bare text.
  const chartEmpty = (title, description) => (
    <EmptyState
      icon={(
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-faint)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
        </svg>
      )}
      title={title}
      description={description}
    />
  )

  return (
    <>
    {/* The rail owns column 1 for the WHOLE page, header included, so it starts
        at the top of the content and can run the full height of the viewport.
        It used to begin below the title row, which left its own full-height
        calc overflowing the fold and pushed anything pinned to its foot off
        the bottom of the screen. */}
    <div className="page-fade-in cv-shell">
      <SectionRail groups={railGroups} footer={railFooter} activeKey={activeSection} onJump={handleRailJump}
        onBack={() => navigate('/')} backLabel="All clients" />
      <div className="cv-main">
      <div className="cv-titlerow">
        <div style={{ flex: 1, minWidth: '180px', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-16)', flexWrap: 'wrap' }}>
        <Avatar url={clientProfile?.avatar_url} name={clientProfile?.full_name || ''} size={52} style={{ marginTop: 'var(--space-4)' }} />
        <div style={{ flex: 1, minWidth: '180px' }}>
          <h1>{clientProfile?.full_name || 'Client'}</h1>
          <p style={{ fontSize: 'var(--text-base)', marginTop: 'var(--space-2)' }}>{clientProfile?.email}</p>
          {/* At-a-glance triage status, from the same engine as the roster so
              the two screens never disagree about a client. Lock is filtered
              out here because it gets its own line, with its Unlock action,
              directly below. */}
          {statusStats && (() => {
            const status = attentionLevel({ ...statusStats, lockInfo })
            const reasons = status.reasons.filter(r => r !== 'Locked')
            if (status.level !== 'green' && reasons.length === 0) return null
            const tone = status.level === 'red' ? 'var(--color-error)' : status.level === 'yellow' ? 'var(--color-warning)' : 'var(--color-success)'
            return (
              <div style={{ marginTop: 'var(--space-10)' }}>
                {/* C1: status is plain coloured text — no container, no border,
                    no dot. This was the last tinted-pill-with-a-dot in the app;
                    the label already carries the meaning, so the dot only ever
                    repeated it. Green keeps --color-success rather than going
                    muted: green and grey must never collide (B1), or a healthy
                    client reads identically to an unconfigured one. */}
                <span style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: status.level === 'green' ? 'var(--weight-normal)' : 'var(--weight-semibold)',
                  color: tone,
                }}>
                  {status.level === 'green' ? 'On track' : reasons.join(' · ')}
                </span>
              </div>
            )
          })()}
          {lockInfo.locked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap', marginTop: 'var(--space-10)' }}>
              {/* C1: status is plain coloured text. This was a tinted 999px pill
                  with a red border sitting four lines under the status line that
                  had already been converted — the two read as different systems
                  on the same header. Unlock stays a control; the label does not. */}
              <span style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-error)',
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
            /* D2/D3: this is the roster's Nudge, so it is the roster's control
               — <Button variant="action">, not a second implementation of it.
               The hand-rolled pill it replaces had already drifted: its hover
               brightened the BORDER, which was removed from every other control
               in the app. Rank 2 (acts on a client), never rank 1. */
            <Button
              onClick={() => nudgeClient(nudge)}
              variant="action"
              size="sm"
              loading={nudging}
              disabled={nudging}
              ariaLabel={nudge.key === 'checkin' ? 'Email this client a reminder to do their check-in' : 'Email this client a prompt to get back to logging'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              {nudging ? 'Nudging…' : label}
            </Button>
          )
        })()}
        </div>
      </div>

      {/* AI Tools. Uses SectionHeader like the other thirteen sections — it was
          the one section with a hand-rolled header, so it alone had a bare <h2>
          at the wrong size and no collapse animation. */}
      <div style={sectionCardStyle}>
        <SectionHeader title="Groundwork" collapsed={aiToolsCollapsed} onToggle={() => setAiToolsCollapsed(!aiToolsCollapsed)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-12)' }}>
              <button className="gw-tile ds-control" onClick={generateCallPrep} disabled={briefingLoading}
                style={{ '--gw-accent': GW_ACCENT_AI, display: 'flex', alignItems: 'center', gap: 'var(--space-12)', width: '100%', textAlign: 'left', padding: 'var(--space-16)', borderRadius: 'var(--radius)', backgroundColor: 'var(--control-bg)', backgroundImage: 'var(--control-sheen)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)', cursor: briefingLoading ? 'default' : 'pointer', color: 'var(--color-text)', fontFamily: 'inherit', opacity: briefingLoading ? 0.65 : 1 }}>
                <span className="gw-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 11, background: 'rgba(167, 139, 250, 0.16)', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h4" /></svg>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
                  <span style={{ fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-md)' }}>{briefingLoading ? 'Preparing meeting prep…' : 'Meeting prep'}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', lineHeight: 1.35 }}>Private brief before a call</span>
                </span>
              </button>

              <button className="gw-tile ds-control" onClick={generateWeeklyReport} disabled={reportLoading}
                style={{ '--gw-accent': GW_ACCENT_REPORT, display: 'flex', alignItems: 'center', gap: 'var(--space-12)', width: '100%', textAlign: 'left', padding: 'var(--space-16)', borderRadius: 'var(--radius)', backgroundColor: 'var(--control-bg)', backgroundImage: 'var(--control-sheen)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)', cursor: reportLoading ? 'default' : 'pointer', color: 'var(--color-text)', fontFamily: 'inherit', opacity: reportLoading ? 0.65 : 1 }}>
                <span className="gw-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 11, background: 'rgba(52, 211, 153, 0.16)', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
                  <span style={{ fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-md)' }}>{reportLoading ? 'Drafting report…' : 'Weekly report'}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', lineHeight: 1.35 }}>Draft to review, then send</span>
                </span>
              </button>
            </div>

            {callBriefing && (
              /* B2: chrome stays neutral. This card outlined itself in
                 --color-ai to say "AI output", which is what its purple eyebrow
                 already says in words. */
              <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-20)', display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontWeight: 'var(--weight-medium)' }}>Meeting brief for {clientProfile?.full_name}</p>
                  <Button onClick={() => setCallBriefing('')} variant="ghost" size="sm">Dismiss</Button>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ai)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Not visible to client</p>
                <pre style={{ color: 'var(--color-text)', fontSize: 'var(--text-base)', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{callBriefing}</pre>
              </div>
            )}

            {report && (
              <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-20)', display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
                <p style={{ fontWeight: 'var(--weight-semibold)' }}>Weekly Report</p>
                <Textarea
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  rows={20}
                  aria-label="Weekly report draft"
                  style={{ lineHeight: '1.7', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
                  <Button onClick={sendReport} variant="primary" size="sm">Send to client</Button>
                  <Button onClick={() => setReport('')} variant="ghost" size="sm">Discard</Button>
                </div>
              </div>
            )}
          </div>
        </SectionHeader>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
        <Button onClick={goToPrevDay} variant="muted" size="sm" ariaLabel="Previous day"><Icon name="left" /></Button>

        <Field
          type="date"
          value={selectedDate}
          max={toLocalDateString(new Date())}
          aria-label="Day to view"
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ width: 'auto' }}
        />

        <Button onClick={goToNextDay} disabled={isToday} variant="muted" size="sm" ariaLabel="Next day"><Icon name="right" /></Button>

        {!isToday && <Button onClick={() => setSelectedDate(toLocalDateString(new Date()))} variant="muted" size="sm">Today</Button>}
      </div>

      <div id="section-stats" style={sectionCardStyle}>
        <SectionHeader title="Today's stats" collapsed={sectionsCollapsed.stats} onToggle={() => toggleSection('stats')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-16)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-12)' }}>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Current streak <InfoTip text={CONSISTENCY_TIPS.streak} /></p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title)', color: consistency.streak > 0 ? 'var(--color-success)' : 'var(--color-muted)' }}>
                {consistency.streak}
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}> days</span>
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Last 7 days <InfoTip text={CONSISTENCY_TIPS.last7} /></p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title)', color: consistency.days7 >= 5 ? 'var(--color-success)' : consistency.days7 >= 3 ? 'var(--color-primary)' : 'var(--color-error)' }}>
                {consistency.days7}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>/7</span>
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Last 30 days <InfoTip text={CONSISTENCY_TIPS.last30} /></p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title)', color: consistency.days30 >= 20 ? 'var(--color-success)' : consistency.days30 >= 10 ? 'var(--color-primary)' : 'var(--color-error)' }}>
                {consistency.days30}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>/30</span>
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)', marginTop: 'var(--space-12)' }}>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Weekdays (Mon-Fri) <InfoTip text={CONSISTENCY_TIPS.weekdays} /></p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title)', color: consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.8 ? 'var(--color-success)' : consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                {consistency.weekdayLogged}
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>/{consistency.weekdayTotal}</span>
              </p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: 'var(--space-2)' }}>
                {consistency.weekdayTotal > 0 ? Math.round((consistency.weekdayLogged / consistency.weekdayTotal) * 100) : 0}%
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)', textAlign: 'center' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Weekends (Sat-Sun) <InfoTip text={CONSISTENCY_TIPS.weekends} /></p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title)', color: consistency.weekendLogged / (consistency.weekendTotal || 1) >= 0.8 ? 'var(--color-success)' : consistency.weekendLogged / (consistency.weekendTotal || 1) >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                {consistency.weekendLogged}
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>/{consistency.weekendTotal}</span>
              </p>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: 'var(--space-2)' }}>
                {consistency.weekendTotal > 0 ? Math.round((consistency.weekendLogged / consistency.weekendTotal) * 100) : 0}%
              </p>
            </div>
          </div>
          {consistency.bestWeekStart && (
            <div style={{
              backgroundColor: 'var(--color-bg)',
              borderRadius: 'var(--radius)',
              padding: 'var(--space-12) var(--space-16)',
              marginTop: 'var(--space-12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>
                  Best week (last 90 days) <InfoTip text={CONSISTENCY_TIPS.bestWeek} />
                </p>
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text)', margin: 0 }}>
                  {consistency.bestWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' – '}
                  {consistency.bestWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="tnum" style={{
                  fontWeight: 'var(--weight-bold)',
                  fontSize: 'var(--text-title)',
                  color: consistency.bestWeekCount === 7 ? 'var(--color-success)' : consistency.bestWeekCount >= 5 ? 'var(--color-warning)' : 'var(--color-muted)',
                  margin: 0,
                  lineHeight: 1,
                }}>
                  {consistency.bestWeekCount}
                  <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>/7</span>
                </p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: 'var(--space-2)' }}>
                  days logged
                </p>
              </div>
            </div>
          )}
          <div style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 'var(--space-16)',
            marginTop: 'var(--space-16)',
          }}>
            <p style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 'var(--weight-semibold)',
              marginBottom: 'var(--space-16)',
              marginTop: 0,
            }}>
              Calorie compliance, last 90 days
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-24)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
            {/* A1: this was the deepest nesting in the app — a bordered week box
                inside the section card, holding a bordered card per report, three
                surfaces deep. Weeks are now separated by space and a disclosure
                label; reports are Rows with a hairline between them. Every count
                and state that was a 999px pill is plain text (C1): four pills in
                one header was a table wearing costumes. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
              {groupByWeek(sentReports).map(([week, weekReports]) => {
                const isCollapsed = collapsedSentWeeks[week] !== false
                const unreadCount = weekReports.filter(r => !r.read_at).length
                return (
                  <div key={week}>
                    <button
                      type="button"
                      className="ds-disclosure ds-control"
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsedSentWeeks(prev => ({ ...prev, [week]: !isCollapsed }))}
                    >
                      <span className="ds-chev"><Icon name="right" /></span>
                      <span>Week of {week}</span>
                      <span style={{ color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>
                        {weekReports.length} {weekReports.length === 1 ? 'report' : 'reports'}
                        {unreadCount > 0 && `, ${unreadCount} unread`}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {weekReports.map(r => (
                          <div key={r.id} className="ds-row" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', padding: 'var(--space-12) 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-12)' }}>
                              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                                Sent {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {/* C1 status text. The pills these replace painted
                                  --color-success on a hardcoded #064e3b: a dark-mode
                                  green on a dark-mode ground, which in light theme
                                  put a mid-green on near-black. Read is graded green,
                                  Unread is ungraded (B1: grey means nothing to grade
                                  — an unread report is not a client slipping). */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)', flexShrink: 0 }}>
                                {r.archived && (
                                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-faint)' }}>Archived</span>
                                )}
                                <span style={{
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 'var(--weight-normal)',
                                  color: r.read_at ? 'var(--color-success)' : 'var(--color-muted)',
                                }}>
                                  {r.read_at ? 'Read' : 'Unread'}
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
            </div>
          </SectionHeader>
        </div>
      )}

      <div key="targets" id="section-targets" style={{ ...sectionCardStyle, gap: 'var(--space-16)' }}>
        <SectionHeader title="Client targets" collapsed={sectionsCollapsed.targets} onToggle={() => toggleSection('targets')}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', marginTop: 'var(--space-8)' }}>
            Set daily goals for {clientProfile?.full_name || 'this client'}. These appear on their dashboard.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-16)', padding: 'var(--space-12) 0', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-12)' }}>
            <div>
              <p style={{ fontWeight: 'var(--weight-semibold)', margin: 0 }}>Hide calories from client</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0 }}>
                For clients who shouldn't see numbers.
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
          <div style={{ marginBottom: 'var(--space-4)' }}>
            {/* D2: a control is a Button. This was a bare green text link with
                no hover and no pressed state, beside real Buttons. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTargetCalc(v => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="8" y2="10" /><line x1="12" y1="10" x2="12" y2="10" /><line x1="16" y1="10" x2="16" y2="10" /><line x1="8" y1="14" x2="8" y2="14" /><line x1="12" y1="14" x2="12" y2="14" /><line x1="16" y1="14" x2="16" y2="14" /><line x1="8" y1="18" x2="16" y2="18" />
              </svg>
              {showTargetCalc ? 'Hide calculator' : 'Calculate from stats'}
            </Button>
            {showTargetCalc && (
              <div style={{ marginTop: 'var(--space-12)' }}>
                <TargetCalculator
                  defaultWeightUnit={clientTargets.weight_goal_unit}
                  initial={{
                    sex: clientProfile?.sex || undefined,
                    age: ageFromBirthDate(clientProfile?.birth_date) ?? undefined,
                    heightCm: clientProfile?.height_cm || undefined,
                    units: clientProfile?.unit_preference || undefined,
                    goalWeight: clientTargets.weight_goal || undefined,
                    activity: clientProfile?.activity_level || undefined,
                  }}
                  onApply={(t) => {
                    setClientTargets(prev => ({ ...prev, calories: String(t.calories), protein: String(t.protein), carbs: String(t.carbs), fat: String(t.fat) }))
                    setShowTargetCalc(false)
                  }}
                />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-12)' }}>
            {[
              { label: 'Calories', key: 'calories', placeholder: 'e.g. 2000' },
              { label: 'Protein (g)', key: 'protein', placeholder: 'e.g. 150' },
              { label: 'Carbs (g)', key: 'carbs', placeholder: 'e.g. 200' },
              { label: 'Fat (g)', key: 'fat', placeholder: 'e.g. 65' },
              { label: 'Cardio (min/day)', key: 'cardio_minutes', placeholder: 'e.g. 30' },
              { label: 'Steps/day', key: 'steps', placeholder: 'e.g. 10000' },
            ].map(f => (
              /* ui/Field, not a local input. These had drifted from controlStyle
                 on both axes the primitive exists to hold still: 10px 14px
                 against its 10px 12px, and --text-body against its --text-base. */
              <Field
                key={f.key}
                label={f.label}
                type="number"
                placeholder={f.placeholder}
                value={clientTargets[f.key]}
                onChange={(e) => setClientTargets({ ...clientTargets, [f.key]: e.target.value })}
              />
            ))}
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', color: 'var(--color-muted)' }}>Weight goal</p>
            <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
              <Field
                type="number"
                placeholder="e.g. 175"
                aria-label="Weight goal"
                value={clientTargets.weight_goal}
                onChange={(e) => setClientTargets({ ...clientTargets, weight_goal: e.target.value })}
                style={{ flex: 1, width: 'auto' }}
              />
              <Select
                value={clientTargets.weight_goal_unit}
                aria-label="Weight goal unit"
                onChange={(e) => {
                  const unit = e.target.value
                  setClientTargets(prev => ({ ...prev, weight_goal_unit: unit, weight_goal: convertGoalValue(prev.weight_goal, prev.weight_goal_unit, unit) }))
                }}
                style={{ width: '80px', cursor: 'pointer' }}
              >
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
              </Select>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-8)' }}>
            <Button onClick={saveClientTargets} variant="primary" size="sm">
              {targetsSaved ? <>Saved <Icon name="check" /></> : 'Save targets'}
            </Button>
          </div>
        </SectionHeader>
      </div>

      <div key="nutritionLog" id="section-nutritionLog" style={sectionCardStyle}>
        <SectionHeader title="Nutrition log" collapsed={sectionsCollapsed.nutritionLog} onToggle={() => toggleSection('nutritionLog')}>
          {/* C1: status is plain coloured text. This was a bordered, tinted
              container whose fill and border were raw rgba of the dark-theme
              green, so on the light theme it drew a dark-mode tint on a white
              card. Green is graded (the day is closed); "not marked complete"
              is not a failing, so it stays ungraded grey (B1). */}
          <div style={{ marginBottom: 'var(--space-10)' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--space-6)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-normal)',
              color: dayComplete ? 'var(--color-success)' : 'var(--color-muted)',
            }}>
              {dayComplete ? <><Icon name="check" /> Day complete</> : 'Day not complete. Totals may be partial'}
            </span>
          </div>
          {entries.length === 0 ? (
            <EmptyState
              icon={null}
              title="No entries for this day"
              description="Try another day."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-20)' }}>
              {groupEntriesByMeal(entries).map((group) => (
                <div key={group.key} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-4)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{group.label}</span>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{group.calories} cal</span>
                  </div>
                  {/* A1: these were bordered cards inside the section card. A
                      logged item is a record in a list, so it is a Row — hairline
                      divider, no box. Spacing carries the grouping (A3). */}
                  {groupLoggedMeals(group.entries).map((item) => item.type === 'meal' ? (
                    <div key={item.id} className="ds-row" style={{ padding: 'var(--space-12) 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-6)' }}>
                        {/* Rejected pattern 4: emoji are not icons. Monochrome
                            feather SVG, stroke=currentColor, like every other
                            glyph in the app. */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-6)', fontWeight: 'var(--weight-medium)' }}>
                          <Icon name="utensils" style={{ color: 'var(--color-muted)' }} /> {item.name}
                        </span>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)' }}>{item.calories} cal</span>
                      </div>
                      {item.entries.map((entry) => (
                        <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                          <span>{entry.food}</span>
                          <span>{entry.calories} cal · P {entry.protein}g · {entry.serving_size}{entry.serving_unit}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div key={item.entry.id} className="ds-row" style={{
                      padding: 'var(--space-12) 0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 'var(--space-12)',
                      flexWrap: 'wrap',
                    }}>
                      <span>{item.entry.food}</span>
                      <div style={{ display: 'flex', gap: 'var(--space-16)', fontSize: 'var(--text-base)' }}>
                        <span style={{ color: 'var(--color-primary)', fontWeight: 'var(--weight-semibold)' }}>{item.entry.calories} cal</span>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-12)', flexWrap: 'wrap', paddingBottom: 'var(--space-12)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
              {/* D2: these are Pills. The hand-rolled copy they replace set its
                  own padding and so stood 4px short of every other chip in the
                  app, the exact bug the Pill minHeight floor exists to prevent. */}
              {CADENCE_OPTIONS.map(opt => (
                <Pill
                  key={opt.weeks}
                  active={checkinInterval === opt.weeks}
                  onClick={() => updateCadence(opt.weeks)}
                  disabled={savingCadence}
                  aria-pressed={checkinInterval === opt.weeks}
                >
                  {opt.label}
                </Pill>
              ))}
            </div>
            {/* D5: no native title. The "applies to every client" caveat is
                real information nothing else on the page shows, so it moves to
                the app's own portaled bubble rather than an OS grey box. */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <Button
                onClick={() => navigate('/profile?focus=questionnaire')}
                variant="ghost"
                size="sm"
              >
                Customize questions <Icon name="right" />
              </Button>
              <InfoTip text="These questions are shared by every client. Editing them changes all check-ins." />
            </div>
          </div>
          {!clientCheckIn ? (
            <div style={{ paddingTop: 'var(--space-8)' }}>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>No check-in submitted {checkinInterval > 1 ? 'this period' : 'this week'} ({cadenceLabel(checkinInterval).toLowerCase()}).</p>
            </div>
          ) : (
            <>
              {Array.isArray(clientCheckIn.answers) && clientCheckIn.answers.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
                  {clientCheckIn.answers.map((a, i) => (
                    <div key={a.question_id || i}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.prompt}</p>
                      {a.type === 'text'
                        ? <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{(a.value && String(a.value).trim()) ? a.value : '—'}</p>
                        : <p style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>{formatAnswer(a)}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-12)' }}>
                    <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Adherence</p>
                      <p className="tnum" style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{clientCheckIn.adherence_rating}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>/10</span></p>
                    </div>
                    <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Energy level</p>
                      <p className="tnum" style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{clientCheckIn.energy_level}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>/10</span></p>
                    </div>
                  </div>
                  {clientCheckIn.obstacles && (
                    <div style={{ paddingTop: 'var(--space-4)' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: 'var(--space-8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Obstacles</p>
                      <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{clientCheckIn.obstacles}</p>
                    </div>
                  )}
                  {clientCheckIn.notes && (
                    <div style={{ paddingTop: 'var(--space-4)' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: 'var(--space-8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes for coach</p>
                      <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{clientCheckIn.notes}</p>
                    </div>
                  )}
                </>
              )}
              <div style={{ paddingTop: 'var(--space-12)', marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
                {clientCheckIn.reviewed_at ? (
                  <>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 'var(--weight-semibold)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-4)' }}><Icon name="check" /> Reviewed</p>
                    {clientCheckIn.coach_comment && (
                      <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6', marginTop: 'var(--space-6)' }}>{clientCheckIn.coach_comment}</p>
                    )}
                  </>
                ) : (
                  <>
                    <Textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Comment for the client (optional)…"
                      rows={2}
                      aria-label="Comment for the client"
                      style={{ resize: 'vertical' }}
                    />
                    <Button onClick={reviewCheckIn} variant="primary" size="sm" loading={reviewing} style={{ marginTop: 'var(--space-8)' }}>Mark reviewed</Button>
                  </>
                )}
              </div>
            </>
          )}
        </SectionHeader>
      </div>

      <div key="privateNotes" id="section-privateNotes" style={sectionCardStyle}>
        <SectionHeader title="Private notes" collapsed={sectionsCollapsed.privateNotes} onToggle={() => toggleSection('privateNotes')}>
            <Textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              readOnly={!editingNotes}
              placeholder="No notes yet…"
              rows={6}
              aria-label="Notes history"
              style={{
                borderColor: editingNotes ? 'var(--color-primary)' : 'var(--color-border)',
                color: editingNotes ? 'var(--color-text)' : 'var(--color-muted)',
                fontSize: 'var(--text-sm)',
                lineHeight: '1.8',
                resize: editingNotes ? 'vertical' : 'none',
                fontFamily: 'monospace',
                cursor: editingNotes ? 'text' : 'default',
              }}
            />
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-12)', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
              <Textarea
                value={newNoteEntry}
                onChange={(e) => setNewNoteEntry(e.target.value)}
                placeholder="Add a note…"
                rows={3}
                aria-label="Add a note"
                style={{ lineHeight: '1.6', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'center' }}>
                <Button onClick={addNoteEntry} variant="primary" size="sm">
                  {notesSaved ? <>Saved <Icon name="check" /></> : 'Add note'}
                </Button>
                {!editingNotes ? (
                  <Button onClick={() => setEditingNotes(true)} variant="ghost" size="sm">
                    Edit history
                  </Button>
                ) : (
                  <>
                    <Button onClick={() => { saveCoachNotes(); setEditingNotes(false) }} variant="muted" size="sm">
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

      {!hiddenCharts.includes('correlatedChart') && (
        <div key="correlatedChart" id="section-correlatedChart" style={sectionCardStyle}>
          <SectionHeader title="Progress overview" collapsed={sectionsCollapsed.correlatedChart} onToggle={() => toggleSection('correlatedChart')} animated={false}>
            {!sectionsCollapsed.correlatedChart && (
              (weightHistory.length > 0 || calorieHistory.length > 0) ? (
                <div style={{ paddingTop: 'var(--space-8)' }}>
                  <Chart type="bar" data={getCorrelatedChartData()} options={correlatedChartOptions} />
                  <EnergyBalanceRead
                    calorieSeries={energySeries.calories}
                    weightSeries={energySeries.weights}
                    calorieTarget={clientTargets.calories}
                    weightGoal={clientTargets.weight_goal}
                    weightGoalUnit={clientTargets.weight_goal_unit}
                    windowDays={ebWindowDays}
                    onWindowChange={changeEbWindow}
                  />
                </div>
              ) : chartEmpty('No progress data yet', 'Needs weight or nutrition logged.')
            )}
          </SectionHeader>
        </div>
      )}

      {!hiddenCharts.includes('weightChart') && (
        <div key="weightChart" id="section-weightChart" style={sectionCardStyle}>
          <SectionHeader title="Weight trend" collapsed={sectionsCollapsed.weightChart} onToggle={() => toggleSection('weightChart')} animated={false}>
            {!sectionsCollapsed.weightChart && (weightHistory.length > 1 ? (() => {
              // The chart follows the weight-GOAL unit when a goal is set (so the
              // coach's unit choice drives the axis live), else the unit the
              // weigh-ins were logged in. Every weigh-in is converted into that
              // display unit — the axis, line, 7-day avg, goal line and marker all
              // share it — so the chart is never "stuck" in whatever unit the raw
              // rows happen to use.
              const displayUnit = clientTargets.weight_goal
                ? normUnit(clientTargets.weight_goal_unit)
                : normUnit(weightHistory[weightHistory.length - 1]?.unit)
              const round1 = (n) => Math.round(n * 10) / 10
              const dispHistory = weightHistory.map(d => ({
                ...d,
                unit: displayUnit,
                weight: round1(convertWeight(d.weight, normUnit(d.unit || displayUnit), displayUnit)),
              }))
              // Goal reference line + the first weigh-in that reached it, computed
              // in the same display unit (weightTarget.js converts the goal in).
              const wt = computeWeightTarget({
                weightHistory: dispHistory,
                weightGoal: clientTargets.weight_goal,
                weightGoalUnit: clientTargets.weight_goal_unit,
              })
              const rIdx = wt?.reached ? wt.reachedIndex : -1
              const isMark = (i) => i === rIdx
              const datasets = [
                {
                  label: 'Weight',
                  data: dispHistory.map(d => d.weight),
                  // eslint-disable-next-line no-restricted-syntax -- chart.js renders to a canvas and cannot resolve a CSS var; kept matched to the metric token by hand.
                  borderColor: '#34d399',
                  backgroundColor: 'rgba(52, 211, 153, 0.15)',
                  // Reached-goal marker: on-brand green (NOT gold — gold is the
                  // product's warning color), a clean dot not a generic star; the
                  // growth-motif leaf lives in the caption below. Theme-agnostic
                  // pop on both cards: a deep-green fill (#15803d) carries contrast
                  // on the light card, a white ring carries it on the dark card —
                  // each does its job on the theme where the other washes out.
                  pointRadius: dispHistory.map((_, i) => (isMark(i) ? 7 : 3)),
                  pointStyle: 'circle',
                  pointBackgroundColor: dispHistory.map((_, i) => (isMark(i) ? '#15803d' : '#34d399')),
                  pointBorderColor: dispHistory.map((_, i) => (isMark(i) ? '#ffffff' : '#34d399')),
                  pointBorderWidth: dispHistory.map((_, i) => (isMark(i) ? 2.5 : 1)),
                  tension: 0.3,
                  fill: true,
                },
                {
                  label: '7-day avg',
                  data: computeRollingAverage(dispHistory),
                  borderColor: 'rgba(52, 211, 153, 0.45)',
                  backgroundColor: 'transparent',
                  borderDash: [4, 4],
                  pointRadius: 0,
                  tension: 0.3,
                  fill: false,
                },
              ]
              if (wt) datasets.push({
                label: `Goal (${wt.goal} ${wt.displayUnit})`,
                data: dispHistory.map(() => wt.goal),
                borderColor: CHART.targetLine,
                backgroundColor: 'transparent',
                borderDash: [6, 4],
                borderWidth: 1.5,
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0,
                fill: false,
              })
              // Weight-specific tooltip so hovered points carry the unit.
              const weightChartOptions = {
                ...chartOptions,
                plugins: {
                  ...chartOptions.plugins,
                  tooltip: {
                    ...chartOptions.plugins.tooltip,
                    callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} ${displayUnit}` },
                  },
                },
                scales: {
                  ...chartOptions.scales,
                  y: { ...chartOptions.scales.y, title: { display: true, text: `Weight (${displayUnit})`, color: CHART.tick } },
                },
              }
              return (
                <>
                  <Line data={{ labels: dispHistory.map(d => d.date), datasets }} options={weightChartOptions} />
                  {wt && (
                    <p style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-10) var(--space-2) 0', color: 'var(--color-muted)' }}>
                      {wt.reached ? (
                        <>
                          <span style={{ color: 'var(--color-primary)', fontWeight: 'var(--weight-semibold)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 'var(--space-4)' }}>
                              <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                              <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                            </svg>
                            Reached goal
                          </span>
                          {wt.direction === 'maintain'
                            ? <>. Holding at {wt.goal} {wt.displayUnit}</>
                            : <>. First hit {wt.goal} {wt.displayUnit} on {new Date(wt.reachedIso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>}
                        </>
                      ) : (
                        <><strong style={{ color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>{wt.remainingAbs} {wt.displayUnit}</strong> {wt.direction === 'up' ? 'to gain' : 'to lose'} to reach the {wt.goal} {wt.displayUnit} goal</>
                      )}
                    </p>
                  )}
                </>
              )
            })() : chartEmpty('No weight logged yet', 'Your client logs this.'))}
          </SectionHeader>
        </div>
      )}

      {!hiddenCharts.includes('calorieChart') && (
        <div key="calorieChart" id="section-calorieChart" style={sectionCardStyle}>
          <SectionHeader title="Calories: last 30 days" action={<ChartColorToggle plain={plainCharts.has('calorieChart')} onToggle={() => togglePlain('calorieChart')} />} collapsed={sectionsCollapsed.calorieChart} onToggle={() => toggleSection('calorieChart')} animated={false}>
            {!sectionsCollapsed.calorieChart && (calorieHistory.length > 0 ? (
              <Bar data={calorieChartData(plainCharts.has('calorieChart'))} options={calorieChartOptions} />
            ) : chartEmpty('No nutrition logged yet', 'Your client logs this.'))}
          </SectionHeader>
        </div>
      )}

      {!hiddenCharts.includes('cardioChart') && (
        <div key="cardioChart" id="section-cardioChart" style={sectionCardStyle}>
          <SectionHeader title="Cardio: last 30 days" action={<ChartColorToggle plain={plainCharts.has('cardioChart')} onToggle={() => togglePlain('cardioChart')} />} collapsed={sectionsCollapsed.cardioChart} onToggle={() => toggleSection('cardioChart')} animated={false}>
            {!sectionsCollapsed.cardioChart && (cardioHistory.length > 0 ? (
              <Bar data={metricBarData({ history: cardioHistory, valueKey: 'minutes', label: 'Minutes', target: parseInt(clientTargets.cardio_minutes) || null, fallback: (a) => `rgba(59, 130, 246, ${a})`, plain: plainCharts.has('cardioChart') })} options={cardioChartOptions} />
            ) : chartEmpty('No cardio logged yet', 'Your client logs this.'))}
          </SectionHeader>
        </div>
      )}

      {!hiddenCharts.includes('stepsChart') && (
        <div key="stepsChart" id="section-stepsChart" style={sectionCardStyle}>
          <SectionHeader title="Steps: last 30 days" action={<ChartColorToggle plain={plainCharts.has('stepsChart')} onToggle={() => togglePlain('stepsChart')} />} collapsed={sectionsCollapsed.stepsChart} onToggle={() => toggleSection('stepsChart')} animated={false}>
            {!sectionsCollapsed.stepsChart && (stepsHistory.length > 0 ? (
              <Bar data={metricBarData({ history: stepsHistory, valueKey: 'steps', label: 'Steps', target: parseInt(clientTargets.steps) || null, fallback: (a) => `rgba(167, 139, 250, ${a})`, plain: plainCharts.has('stepsChart') })} options={stepsChartOptions} />
            ) : chartEmpty('No steps logged yet', 'Your client logs this.'))}
          </SectionHeader>
        </div>
      )}

      {!hiddenCharts.includes('measurements') && (
        <div key="measurements" id="section-measurements" style={sectionCardStyle}>
          <SectionHeader
            title="Body measurements"
            collapsed={sectionsCollapsed.measurements}
            onToggle={() => toggleSection('measurements')}
            info="Recommended re-measure cadence: about every 2 weeks while cutting, every 4 weeks otherwise (industry standard; circumference moves slowly and tape error is ~1–1.5 cm). Flags when the client's tape data is overdue."
            action={measStatus?.due ? (
              /* C1: status is plain coloured text. This was the last tinted
                 pill with a dot in the app — the decision that introduced it
                 (Jul 19, measurement cadence) predates the ban. */
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-warning)' }}>
                Re-measure due · {measStatus.daysSince}d
              </span>
            ) : null}
          >
            {!sectionsCollapsed.measurements && (measHistory.length === 0
              ? chartEmpty("No measurements yet", "Your client adds these.")
              : (() => {
              const latest = measHistory[measHistory.length - 1]
              const unit = latest.unit || 'in'
              const sites = MEASUREMENT_SITES.filter(s => latest[s.key] != null)
              if (sites.length === 0) return <p style={{ color: 'var(--color-muted)', fontSize: 'var(--text-base)' }}>No measurements recorded yet.</p>
              return (
                <>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-12)' }}>
                    Latest {new Date(latest.logged_date + 'T00:00:00').toLocaleDateString()}{measStatus ? ` · ${measStatus.daysSince === 0 ? 'today' : `${measStatus.daysSince}d ago`}` : ''}{measHistory.length > 1 ? ' · change since first recorded' : ''}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-12)' }}>
                    {sites.map(s => {
                      const firstRow = measHistory.find(r => r[s.key] != null)
                      const delta = firstRow && firstRow.logged_date !== latest.logged_date ? +(latest[s.key] - firstRow[s.key]).toFixed(1) : null
                      return (
                        <div key={s.key} style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)', textAlign: 'center' }}>
                          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>{s.label}</p>
                          <p className="tnum" style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title)', color: 'var(--color-text)' }}>
                            {latest[s.key]}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}> {unit}</span>
                          </p>
                          {delta != null && delta !== 0 && (
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', fontWeight: 'var(--weight-semibold)', margin: 0 }}>
                              {delta > 0 ? '+' : ''}{delta} {unit}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Trend small-multiples: one line chart per logged site (≥2
                      points). The column count is balanced against the number of
                      sites so the charts always tile into even rows — never a
                      half-empty last row of leftover negative space. */}
                  {(() => {
                    const trendSites = MEASUREMENT_SITES.filter(s => measHistory.filter(r => r[s.key] != null).length >= 2)
                    if (!trendSites.length) return null
                    // Fit within the viewport budget, but drop a column rather
                    // than strand a single chart alone on the final row.
                    let cols = Math.min(measColsMax, trendSites.length)
                    if (cols > 1 && trendSites.length % cols === 1) cols -= 1
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 'var(--space-16)', marginTop: 'var(--space-16)' }}>
                        {trendSites.map(s => {
                          const pts = measHistory.filter(r => r[s.key] != null)
                          return (
                            <div key={s.key} style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)' }}>
                              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: '0 0 var(--space-6)' }}>{s.label} <span style={{ color: 'var(--color-faint)' }}>({unit})</span></p>
                              <div style={{ height: '180px' }}>
                                <Line
                                  data={{ labels: pts.map(r => r.logged_date.slice(5)), datasets: [{ label: s.label, data: pts.map(r => r[s.key]), borderColor: CHART_SERIES, backgroundColor: 'rgba(52, 211, 153, 0.12)', pointRadius: 3, tension: 0.3, fill: true }] }}
                                  options={withYTitle(miniChartOptions, unit)}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </>
              )
            })())}
          </SectionHeader>
        </div>
      )}

      </Reorderable>

      <div id="section-coaching" style={{ ...sectionCardStyle }}>
        {/* A5: a panel heading is --text-body / medium. This was the last bare
            global h2 on the page, so it rendered a step larger than the thirteen
            SectionHeader titles above it. It is not collapsible (one short
            action), so it takes the type rather than the whole component. */}
        <h2 style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--weight-medium)', letterSpacing: '-0.005em' }}>Coaching</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
          Ends coaching. {clientProfile?.full_name || 'This client'} keeps their data and continues solo.
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
          /* "What IS wanted": a uniform tint on a notice, never a coloured
             border round it (B2 — never colour a whole card border to signal
             state). The tint was a raw rgba of the dark-theme red, so it did
             not follow the theme; color-mix off the token does. */
          <div style={{
            padding: 'var(--space-16)',
            borderRadius: 'var(--radius)',
            backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-10)'
          }}>
            <p style={{ fontSize: 'var(--text-base)', margin: 0 }}>
              Offboard <strong>{clientProfile?.full_name}</strong>? You can't undo this.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
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
    <ChatBubble
      key={clientId}
      messages={messages}
      currentUserId={profile?.id}
      recipientName={clientProfile?.full_name || 'client'}
      recipientAvatarUrl={clientProfile?.avatar_url}
      onSend={sendMessage}
      onMarkRead={markMessagesRead}
    />
    <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </>
  )
}

export default ClientView
