import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import TodayPanel from '../components/TodayPanel'
import TrendsPanel from '../components/TrendsPanel'
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
import { windowTrend, hasTrend } from '../utils/progressTrends'
import { bucketHistory, rangeByKey, DEFAULT_RANGE, historyWindow, LONGEST_RANGE_DAYS } from '../utils/chartRange'
import RangePicker from '../components/RangePicker'
import { usePlainCharts } from '../utils/usePlainCharts'
import { CHART } from '../utils/chartTheme'
import { refreshNotifications } from '../utils/notifyRefresh'
import Reorderable from '../components/Reorderable'
import { resolveLockState } from '../utils/lockState'
import { checkinPeriod, toLocalDateString, parseLocalDateString } from '../utils/dateHelpers'
import { measurementStatus } from '../utils/measurementCadence'
import { convertWeight, normUnit } from '../utils/weightTarget'
import { cadenceLabel } from '../utils/cadence'
import { blankValue, validateAnswers, buildAnswers, formatAnswer } from '../utils/checkinQuestions'
import ConfirmDialog from '../components/ConfirmDialog'

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
import { controlStyle, Icon, Notice, Pill, Textarea, Field, IconButton } from '../components/ui'
import { scrollBehavior } from '../utils/motion'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler
)

// TWICE the longest chart range.
//
// Every Trends row states its window against the window before it, so the Y
// range (12 months) needs a second 12 months behind it or the comparison is
// not "not enough history yet", it is "we never asked". A card that reports a
// gap it created itself is worse than one that reports nothing.
//
// Measured on a client logging ~3.7 nutrition rows a day, 730 days of the
// select this page makes is ~125KB uncompressed and well under that on the
// wire; the other three tables hold at most one row per day.
const HISTORY_DAYS = LONGEST_RANGE_DAYS * 2


// The streak and milestone cards are ALWAYS-DARK surfaces — the one sanctioned
// place on this page for a gradient, and the gradient is a deep green either
// theme. That makes them the same case as Toast, and they had the same bug it
// documents: their foregrounds were tokens, so in LIGHT theme they flipped to
// the darkened light-mode values while the background stayed dark.
//
// Measured in light, before this: the streak numeral was --color-primary
// (#166534) on a #064e3b card — a dark green on a dark green, effectively
// invisible; the "log today" line was --color-warning (#b45309) on the same
// ground. The milestone card was worse than low-contrast, it was inverted: its
// gradient started at --color-surface-2, which is #1a1a1a in dark but #eef0ee in
// light, so the card ran near-WHITE into near-black with --color-muted (#5f6469)
// text across it.
//
// So these are the dark-mode values, pinned. A token here is the bug.
/* eslint-disable no-restricted-syntax -- always-dark surfaces, see above */
//
// Six of these went with the standing streak card when 6.1 replaced it with a
// stat strip: the two streak gradients and the decorative #86efac/#6ee7b7
// pair, plus the primary and warning it painted its numeral and nudge in. They
// were literals exempted by name for a surface that no longer exists, which is
// the failure the design system names — a literal sanctioned by name outlives
// the thing it named. What is left is the milestone card, which is still an
// always-dark surface and still the one place a gradient is sanctioned.
const ALWAYS_DARK = {
  milestone:   'linear-gradient(135deg, #1a1a1a 0%, #1f2a1f 100%)',
  success:     '#34d399', // --color-success,  dark
  muted:       '#888',    // --color-muted,    dark
}
/* eslint-enable no-restricted-syntax */

// The A5 panel-heading role, for the cards on this page that carry a heading
// without a SectionHeader (they don't collapse). Same three values SectionHeader
// and ui/Panel set, so a heading is the same size whichever card it sits in.
const sectionHeadingStyle = {
  margin: 0,
  fontSize: 'var(--text-body)',
  fontWeight: 'var(--weight-medium)',
  letterSpacing: '-0.005em',
}

// B1: one ramp for "how much of this window did you log?", used by every cell
// in the consistency strip. Stating it once is the point — the best-week cell
// carried its own thresholds and graded 5-of-7 amber while the cell beside it
// graded the same fraction green.
function ratioTone(ratio) {
  if (ratio >= 0.8) return 'var(--color-success)'
  if (ratio >= 0.5) return 'var(--color-warning)'
  return 'var(--color-error)'
}

// One cell of the consistency strip. Type carries the hierarchy (A5) and the
// hairline between cells comes from .ds-statcell, so no cell draws a box.
function ConsistencyStat({ label, hint, n, of, tone, sub }) {
  return (
    <span className="ds-statcell" style={{ flex: '1 1 160px', minWidth: 0, gap: 'var(--space-6)' }}>
      {/* F12: the LABEL is the trigger. The bare mark cost a glyph plus its
          margin in a 110px cell, which is what pushed these labels onto two
          lines and knocked the strip's numerals off a shared baseline. */}
      <span style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-faint)', fontWeight: 'var(--weight-medium)' }}>
        <InfoTip text={hint}>{label}</InfoTip>
      </span>
      <span className="tnum" style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', color: tone, lineHeight: 1.1 }}>
        {n}
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>/{of}</span>
      </span>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{sub}</span>
    </span>
  )
}

// One cell of the identity strip. Same shape as ConsistencyStat above — the
// page should have one cell vocabulary, not two — but it states a whole number
// rather than a ratio, and its sub-line is where the nudge lives.
function IdentityStat({ label, value, unit, sub, subTone }) {
  return (
    <span className="ds-statcell" style={{ flex: '1 1 160px', minWidth: 0, gap: 'var(--space-6)' }}>
      <span style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-faint)', fontWeight: 'var(--weight-medium)' }}>
        {label}
      </span>
      <span className="tnum" style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)', lineHeight: 1.1 }}>
        {value}
        {unit && (
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}> {unit}</span>
        )}
      </span>
      {/* Reserved whether or not there is anything to say, so the numerals
          across the strip keep a shared baseline instead of lifting whenever a
          neighbour has no sub-line. */}
      <span style={{ fontSize: 'var(--text-xs)', color: subTone || 'var(--color-muted)', minHeight: '1em' }}>
        {sub || '\u00a0'}
      </span>
    </span>
  )
}

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
  const [weightHistory, setWeightHistory] = useState([])
  const [plainCharts, togglePlain] = usePlainCharts()
  // The Trends window. One per card, chosen by the reader in the panel header.
  const [trendRangeKey, setTrendRangeKey] = useState(DEFAULT_RANGE)
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
  const [checkinInterval, setCheckinInterval] = useState(1)
  const [questions, setQuestions] = useState([])      // coach's custom check-in questions (empty = legacy form)
  const [answers, setAnswers] = useState({})          // { [questionId]: value }
  const [notice, setNotice] = useState(null)          // branded one-button notice message, or null
  const [streak, setStreak] = useState(0)
  // The other two identity facts, from the same one round trip as the streak.
  const [daysLogged, setDaysLogged] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [bestWeek, setBestWeek] = useState(null)
  const [consistency, setConsistency] = useState(null)
  const [heatmapData, setHeatmapData] = useState({})
  const [milestone, setMilestone] = useState(null)
  const [loggedToday, setLoggedToday] = useState(false)
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
  // Re-measure reminder: surfaced here (their home) so it's actually seen, not
  // just on the Log page. Steady ~monthly cadence — a gentle prompt, never nags.
  const [lastMeasuredIso, setLastMeasuredIso] = useState(null)
  const [showMeasReminder, setShowMeasReminder] = useState(false)
  const [showSelfOffboardConfirm, setShowSelfOffboardConfirm] = useState(false)
  const [selfOffboarding, setSelfOffboarding] = useState(false)
  const [selfOffboardError, setSelfOffboardError] = useState('')

  // Section collapse state.
  //
  // Two sections, where there were nine. Today and Trends do not collapse:
  // Today is the page's answer and Trends is four panels already folded into
  // one, so a chevron on either offers to hide the thing the reader came for.
  // The seven keys that went (stats, targets, weightChart, calorieChart,
  // cardioChart, stepsChart) named panels that no longer exist.
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    reports: false,
    checkin: false,
    consistency: false,
  })

  function formatTime(timeStr) {
    if (!timeStr) return null
    const [hours, minutes] = timeStr.split(':')
    const h = parseInt(hours)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour = h % 12 || 12
    return `${hour}:${minutes} ${ampm}`
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  // Deep-link from a notification (?focus=reports): expand + scroll to it.
  // 'chat' is handled by ChatBubble.
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus || focus === 'chat') return
    let timer, tries = 0
    const scrollWhenReady = () => {
      const el = document.getElementById('section-' + focus)
      if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
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
      if (profile?.role === 'client' || profile?.role === 'solo') {
        await fetchLastMeasured()
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





  // The 30 MOST RECENT weigh-ins, not the 30 oldest.
  //
  // This was `ascending: true` with `limit(30)`, which asks the database for
  // the earliest 30 rows a user has ever logged — so the longer someone used
  // the app the further out of date their weight chart got. A client with 90
  // days of weigh-ins was shown July through September in October, and the
  // panel's own title said "Weight trend". It survived because the chart was
  // still full of plausible, correctly-drawn, steadily-falling data; nothing
  // about it looked broken unless you read the axis.
  async function fetchWeightHistory() {
    // Filtered by DATE, like its three siblings — not `limit(HISTORY_DAYS)`,
    // which counts ROWS. `fetchWeight` orders a single day's weigh-ins and
    // takes the newest, so more than one row per date is a state this table
    // supports; under a row limit a user who weighs in twice a day would reach
    // back only half as far and quietly lose the oldest months of the year
    // view. A day window asks for what the chart actually plots.
    const { from, to } = historyWindow(HISTORY_DAYS)
    const { data, error } = await supabase
      .from('weight_log').select('logged_date, weight, unit')
      .gte('logged_date', from).lte('logged_date', to)
      .order('logged_date', { ascending: true })
    if (error) console.error(error)
    // `date` is the MM-DD the charts plot; `iso` is the real date. Trends window
    // by calendar and cannot use the label — MM-DD has no year, so it can
    // neither be compared across one nor sorted through December into January.
    else setWeightHistory(data
      .map(d => ({ iso: d.logged_date, date: d.logged_date.slice(5), weight: parseFloat(d.weight), unit: d.unit })))
  }

  async function fetchCalorieHistory() {
    const { from, to } = historyWindow(HISTORY_DAYS)
    const { data, error } = await supabase
      .from('nutrition_log').select('logged_date, calories')
      .gte('logged_date', from).lte('logged_date', to)
    if (error) console.error(error)
    else {
      const grouped = {}
      data.forEach(e => { grouped[e.logged_date] = (grouped[e.logged_date] || 0) + e.calories })
      // Sorted on the ISO date, not the MM-DD label. A 30-day window that spans
      // a new year sorted "01-04" before "12-20" and drew the chart inside out;
      // it only ever misbehaved in the first weeks of January.
      setCalorieHistory(Object.entries(grouped).map(([date, calories]) => ({
        iso: date, date: date.slice(5), calories
      })).sort((a, b) => a.iso.localeCompare(b.iso)))
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
    const { from, to } = historyWindow(HISTORY_DAYS)
    const { data, error } = await supabase
      .from('cardio_log').select('logged_date, duration')
      .gte('logged_date', from).lte('logged_date', to)
    if (error) console.error(error)
    else {
      const grouped = {}
      data.forEach(e => { grouped[e.logged_date] = (grouped[e.logged_date] || 0) + e.duration })
      setCardioHistory(Object.entries(grouped).map(([date, minutes]) => ({
        iso: date, date: date.slice(5), minutes
      })).sort((a, b) => a.iso.localeCompare(b.iso)))
    }
  }

  async function fetchStepsHistory() {
    const { from, to } = historyWindow(HISTORY_DAYS)
    const { data, error } = await supabase
      .from('steps_log').select('logged_date, steps')
      .gte('logged_date', from).lte('logged_date', to)
    if (error) console.error(error)
    else setStepsHistory(data.map(d => ({
      iso: d.logged_date, date: d.logged_date.slice(5), steps: d.steps
    })).sort((a, b) => a.iso.localeCompare(b.iso)))
  }

  // Days logged, longest run and current run, in one round trip.
  //
  // This used to pull 60 days of `logged_date` and walk backwards through them
  // in the browser. That had a ceiling of 60 built into its own query window
  // while MILESTONES below lists 90, so a 90-day streak could not be reported
  // and that celebration was unreachable. It also could not answer "longest
  // ever" or "days logged" without shipping a user's entire history here to be
  // counted.
  //
  // The local date is passed in rather than read from the database, which
  // answers in UTC: west of Greenwich, an evening would otherwise be counted
  // as tomorrow and every streak would read as broken for the last hours of
  // each day.
  async function fetchStreak() {
    const { data, error } = await supabase.rpc('logging_identity', {
      p_today: toLocalDateString(new Date()),
    })
    if (error) { console.error(error); return }
    const row = data?.[0]
    if (!row) return
    setStreak(row.current_streak ?? 0)
    setLongestStreak(row.longest_streak ?? 0)
    setDaysLogged(row.days_logged ?? 0)
    setLoggedToday(Boolean(row.logged_today))
  }

  // Client messaging lives at /coach — a page, not a bubble. It passed through
  // a globally mounted <ClientChat> on the way, which is why this comment used
  // to name one; that component had no call site by the end and is now gone.

  async function fetchCheckIn() {
    const userId = (await supabase.auth.getSession()).data.session.user.id
    const { data: rel } = await supabase
      .from('coach_clients').select('coach_id, checkin_interval_weeks')
      .eq('client_id', userId).eq('status', 'active').maybeSingle()
    const interval = rel?.checkin_interval_weeks || 1
    setCheckinInterval(interval)

    // The coach's custom questionnaire (empty → legacy 4-field form).
    let qs = []
    if (rel?.coach_id) {
      const { data: qData } = await supabase
        .from('checkin_questions').select('*')
        .eq('coach_id', rel.coach_id).eq('archived', false).order('position')
      qs = qData || []
    }
    setQuestions(qs)

    const weekOf = checkinPeriod(interval).weekOf
    const { data, error } = await supabase
      .from('check_ins').select('*')
      .eq('client_id', userId)
      .eq('week_of', weekOf).maybeSingle()
    if (error) { console.error(error); return }
    setExistingCheckIn(data || null)

    if (qs.length) {
      const vals = {}
      qs.forEach(q => { vals[q.id] = blankValue(q.type, q.config) })
      if (Array.isArray(data?.answers)) data.answers.forEach(a => { if (a.question_id in vals) vals[a.question_id] = a.value })
      setAnswers(vals)
    } else if (data) {
      setCheckIn({
        adherence_rating: data.adherence_rating || 5,
        energy_level: data.energy_level || 5,
        obstacles: data.obstacles || '',
        notes: data.notes || ''
      })
    }
  }

  async function saveCheckIn() {
    const custom = questions.length > 0
    if (custom) {
      if (validateAnswers(questions, answers).length > 0) {
        setNotice('Please answer all required questions before submitting.')
        return
      }
    } else {
      if (!checkIn.obstacles.trim()) {
        setNotice('Please fill in the obstacles field before submitting.')
        return
      }
      if (!checkIn.notes.trim()) {
        setNotice('Please fill in the notes for your coach before submitting.')
        return
      }
    }

    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const weekOf = checkinPeriod(checkinInterval).weekOf

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

    const answersSnapshot = custom ? buildAnswers(questions, answers) : null
    const payload = custom
      ? { client_id: currentSession.user.id, week_of: weekOf, answers: answersSnapshot }
      : {
          client_id: currentSession.user.id, week_of: weekOf,
          adherence_rating: checkIn.adherence_rating, energy_level: checkIn.energy_level,
          obstacles: checkIn.obstacles, notes: checkIn.notes,
        }
    const { error } = await supabase.from('check_ins').upsert(payload, { onConflict: 'client_id,week_of' })
    if (error) { console.error(error); setNotice('Could not submit your check-in. Please try again.') }
    else {
      setCheckInSaved(true); setShowCheckIn(false); fetchCheckIn(); refreshNotifications(); setTimeout(() => setCheckInSaved(false), 3000)
      // Notify coach by email
      if (coachEmail) {
        const body = custom
          ? { answers: answersSnapshot.map(a => ({ prompt: a.prompt, text: formatAnswer(a) })) }
          : { adherence: checkIn.adherence_rating, energy: checkIn.energy_level, obstacles: checkIn.obstacles, notes: checkIn.notes }
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-checkin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
          body: JSON.stringify(body),
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

  async function fetchLastMeasured() {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const uid = currentSession?.user?.id
    if (!uid) return
    const { data } = await supabase.from('body_measurements').select('logged_date')
      .eq('user_id', uid).order('logged_date', { ascending: false }).limit(1).maybeSingle()
    const iso = data?.logged_date ?? null
    setLastMeasuredIso(iso)
    const dismissed = iso && localStorage.getItem(`meas_reminder_dismissed_${uid}_${iso}`) === 'true'
    setShowMeasReminder(measurementStatus({ lastMeasuredIso: iso, cadenceDays: 28 }).due && !dismissed)
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

  // One canonical control style for the whole app (src/components/ui/Field.jsx).
  const inputStyle = controlStyle
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
  // Byte-identical to ClientView's sectionCardStyle. A2's comfortable density
  // (20/24) — these are sections people read, not a repeating roster — and the
  // one place this page's section padding is decided. It used to be
  // baseCardStyle's 16px here and 20/24 there, so the two client-facing pages
  // disagreed on the width of the same margin.
  const cardStyle = {
    ...baseCardStyle,
    padding: 'var(--space-20) var(--space-24)',
    display: 'flex', flexDirection: 'column', gap: 'var(--space-12)'
  }
  // Plot the weight trend in the coach-set goal's unit (falling back to the most
  // recent logged unit) so the chart tracks the goal instead of whatever unit
  // each weigh-in happened to be logged in. Convert every point into that unit.
  const weightDisplayUnit = targets?.weight_goal
    ? normUnit(targets.weight_goal_unit)
    : normUnit(weightHistory[weightHistory.length - 1]?.unit)
  const weightHistoryDisplay = weightHistory.map(d => ({
    ...d,
    weight: Math.round(convertWeight(d.weight, normUnit(d.unit || weightDisplayUnit), weightDisplayUnit) * 10) / 10,
  }))
  // Weight-trend chart labels its y-axis with the active unit so the scale reads
  // unambiguously (72 on a kg chart vs a lbs chart mean very different things).
  const weightChartOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      tooltip: { ...chartOptions.plugins.tooltip, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} ${weightDisplayUnit}` } },
    },
    scales: {
      ...chartOptions.scales,
      y: { ...chartOptions.scales.y, title: { display: true, text: `Weight (${weightDisplayUnit})`, color: CHART.tick } },
    },
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


  // ── The Today panel ────────────────────────────────────────────────────
  //
  // One cell per metric, carrying its target. This replaces "Today's stats"
  // and "Today vs target", which were the same six facts rendered twice —
  // once bare and once with the denominator that makes them mean something.
  //
  // F2's grouping: calories/protein/carbs/fat are four parts of one number (a
  // block), cardio/steps/weight are three independent readings (a strip).
  const num = (n) => Number(n || 0).toLocaleString()
  const pctOf = (actual, target) => (target ? Math.round((actual / target) * 100) : null)

  // The sub-line always says something (F3): the target, or why there isn't one.
  const targetSub = (target, unit, pct) =>
    target ? `of ${num(target)}${unit} · ${pct}%` : 'No target set'

  const macroCells = [
    ...(hideCalories ? [] : [{ key: 'calories', label: 'Calories', color: 'var(--color-calories)', value: num(totals.calories), target: targets?.calories, unit: ' cal' }]),
    { key: 'protein', label: 'Protein', color: 'var(--color-protein)', value: `${num(totals.protein)}g`, target: targets?.protein, unit: 'g' },
    { key: 'carbs', label: 'Carbs', color: 'var(--color-carbs)', value: `${num(totals.carbs)}g`, target: targets?.carbs, unit: 'g' },
    { key: 'fat', label: 'Fat', color: 'var(--color-fat)', value: `${num(totals.fat)}g`, target: targets?.fat, unit: 'g' },
  ].map((m) => {
    const actual = m.key === 'calories' ? totals.calories : totals[m.key]
    const pct = pctOf(actual, m.target)
    return { ...m, sub: targetSub(m.target, m.unit, pct), pct }
  })

  const cardioMinutes = cardioToday?.minutes || 0
  const stepsCount = stepsToday?.steps || 0
  const cardioPct = pctOf(cardioMinutes, targets?.cardio_minutes)
  const stepsPct = pctOf(stepsCount, targets?.steps)

  // Weight carries a GOAL, not a daily target, so it takes no bar: a track
  // running from zero to a goal weight measures nothing a person can act on.
  // The delta is the fact, graded by the rule the old panel already stated —
  // within 1 unit IS the goal (tape and scale noise exceed that), anything
  // further is still travelling and takes no grade at all (B1).
  const weightGoalUnit = targets?.weight_goal ? normUnit(targets.weight_goal_unit) : null
  const weightCurrent = weightEntry && weightGoalUnit
    ? Math.round(convertWeight(weightEntry.weight, normUnit(weightEntry.unit), weightGoalUnit) * 10) / 10
    : null
  const weightDiff = weightCurrent != null ? Math.round((weightCurrent - Number(targets.weight_goal)) * 10) / 10 : null
  const weightSub = (() => {
    if (!weightEntry) return 'No weight logged'
    if (weightDiff == null) return weightEntry.weighed_at ? `Logged ${formatTime(weightEntry.weighed_at)}` : 'No goal set'
    const phrase = weightDiff > 0 ? `${weightDiff.toFixed(1)} to go` : weightDiff < 0 ? `${Math.abs(weightDiff).toFixed(1)} below goal` : 'Goal reached'
    return (
      <>
        Goal {targets.weight_goal} {weightGoalUnit} ·{' '}
        <span style={Math.abs(weightDiff) < 1
          ? { color: 'var(--color-success)', fontWeight: 'var(--weight-medium)' }
          : { color: 'var(--color-text-dim)' }}>{phrase}</span>
      </>
    )
  })()

  const activityCells = [
    {
      key: 'cardio', label: 'Cardio', color: 'var(--color-cardio)',
      value: cardioMinutes > 0 ? `${cardioMinutes}` : '—',
      denom: cardioMinutes > 0 ? ' min' : null,
      sub: targetSub(targets?.cardio_minutes, ' min', cardioPct), pct: cardioPct,
    },
    {
      key: 'steps', label: 'Steps', color: 'var(--color-steps)',
      value: stepsToday ? num(stepsCount) : '—',
      sub: targetSub(targets?.steps, '', stepsPct), pct: stepsPct,
    },
    {
      key: 'weight', label: 'Weight', color: 'var(--color-weight)',
      value: weightEntry ? `${weightEntry.weight}` : '—',
      denom: weightEntry ? ` ${weightEntry.unit}` : null,
      sub: weightSub, pct: null,
    },
  ]

  // The heading must not say "Today" when the stepper has moved off today —
  // it did, and the panel then printed a past day's numbers under a word that
  // contradicted the date control directly above it.
  const todayHeading = isToday
    ? 'Today'
    : parseLocalDateString(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  // ── The Trends panel ───────────────────────────────────────────────────
  //
  // Replaces three full-width 30-day bar charts and the weight line chart —
  // four panels and ~2,400px that all left the comparison to the reader.
  // Each row states the move; the chart is the row's disclosure.
  // The window the whole card reads over — chips in the panel header, not a
  // constant here. See chartRange.js for why the sentence and the chart must
  // share it.
  const trendRange = rangeByKey(trendRangeKey)
  const TREND_DAYS = trendRange.days
  const TREND_SPAN = trendRange.span
  const TREND_ADJ = trendRange.adj

  // The chart-colour toggle moved with its chart. It used to sit in each chart
  // panel's SectionHeader, and those panels are gone; dropping it would have
  // quietly removed a control rather than relocating one. Inside the disclosure
  // it has no section title to sit beside, so it takes a written label — the
  // bare switch alone said nothing about what it switched.
  const gradedChart = (key, chart) => (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-8)', marginBottom: 'var(--space-8)' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>Color bars by target</span>
        <ChartColorToggle plain={plainCharts.has(key)} onToggle={() => togglePlain(key)} />
      </div>
      {chart}
    </>
  )

  // A chart is now a function of the selected range, not a fixed node: W and M
  // plot the logged days, Y plots one averaged point per month. `bucketHistory`
  // owns that reshaping so the four call sites below stay declarations.
  //
  // An EMPTY bucket is its own state and must not fall through to a chart with
  // no bars in it. A year view on an account three weeks old, or a week view
  // after seven quiet days, draws an axis around nothing and reads as broken
  // rather than as "no data here yet".
  const rangedChart = (history, valueKey, render) => (rangeKey) => {
    const rows = bucketHistory(history, valueKey, rangeKey)
    if (rows.length === 0) {
      return (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 'var(--space-16) 0', textAlign: 'center' }}>
          Nothing logged in the {rangeByKey(rangeKey).name.toLowerCase()}.
        </p>
      )
    }
    return render(rows, rangeKey)
  }
  const fmtDelta = (t, unit, digits = 0) => {
    if (!hasTrend(t)) return null
    // A move inside the dead band prints its SIZE as nothing useful: cardio
    // drifting 0.4 of a minute rendered "−0 min vs previous 14 days", a signed
    // zero that reads as a rounding bug rather than as steadiness. The flat
    // band already decided this is not a trend, so the row says so in words.
    if (t.direction === 'flat') return `Holding steady · ${TREND_ADJ} average`
    const sign = t.delta > 0 ? '+' : '−'
    const size = Math.abs(t.delta)
    // Thousands separator, or a step delta reads "−1358".
    const shown = digits > 0
      ? size.toFixed(digits)
      : Math.round(size).toLocaleString()
    return `${sign}${shown}${unit} vs previous ${TREND_SPAN}`
  }
  // The smallest change in each metric a person could actually act on, in that
  // metric's own unit. A move must clear this AND the client's own day-to-day
  // wobble before the card claims a direction (see progressTrends.js).
  //
  // These are not statistics, they are judgements about the unit, which is why
  // they live at the call site rather than in the util:
  //   calories  25/day  — below what food logging can resolve; portion
  //                       estimates are routinely out by more than this
  //   cardio     2 min  — shorter than the rounding on a logged session
  //   steps    250/day  — a few minutes' walking, inside normal day-to-day drift
  //   weight     0.4    — lb or kg; scale and hydration noise sit under this,
  //                       and a fortnightly move above it is real progress
  const MIN_MATERIAL = { calories: 25, minutes: 2, steps: 250, weight: 0.4 }
  const trendOf = (history, key) =>
    windowTrend(history, key, { days: TREND_DAYS, minMaterial: MIN_MATERIAL[key] })

  // F3: the row always carries a value, including when there is no trend to
  // report. "Average per logged day · 0 days" was the first draft of this and
  // it said nothing — an average over no days is not an average.
  const trendSub = (t, unit, digits = 0) => {
    const delta = fmtDelta(t, unit, digits)
    if (delta) return delta
    if (t.nCurrent === 0) return `Nothing logged in the last ${TREND_SPAN}`
    return `Average of ${t.nCurrent} logged ${t.nCurrent === 1 ? 'day' : 'days'} · no comparison yet`
  }

  const trendMetrics = [
    ...(hideCalories ? [] : [(() => {
      const t = trendOf(calorieHistory, 'calories')
      return {
        key: 'calories', label: 'Calories', color: 'var(--color-calories)', trend: t,
        display: t.current != null ? `${Math.round(t.current).toLocaleString()}` : '—',
        sub: trendSub(t, ' cal'),
        chart: calorieHistory.length > 0 ? rangedChart(calorieHistory, 'calories', (rows) => gradedChart('calorieChart',
          <Bar data={metricBarData({ history: rows, valueKey: 'calories', label: 'Calories', target: parseInt(targets?.calories) || null, fallback: (a) => `rgba(251, 191, 36, ${a})`, bidirectional: true, plain: plainCharts.has('calorieChart') })} options={calorieChartOptions} />
        )) : null,
      }
    })()]),
    (() => {
      const t = trendOf(cardioHistory, 'minutes')
      return {
        key: 'cardio', label: 'Cardio', color: 'var(--color-cardio)', trend: t,
        display: t.current != null ? `${Math.round(t.current)} min` : '—',
        sub: trendSub(t, ' min'),
        chart: cardioHistory.length > 0 ? rangedChart(cardioHistory, 'minutes', (rows) => gradedChart('cardioChart',
          <Bar data={metricBarData({ history: rows, valueKey: 'minutes', label: 'Minutes', target: parseInt(targets?.cardio_minutes) || null, fallback: (a) => `rgba(59, 130, 246, ${a})`, plain: plainCharts.has('cardioChart') })} options={cardioChartOptions} />
        )) : null,
      }
    })(),
    (() => {
      const t = trendOf(stepsHistory, 'steps')
      return {
        key: 'steps', label: 'Steps', color: 'var(--color-steps)', trend: t,
        display: t.current != null ? Math.round(t.current).toLocaleString() : '—',
        sub: trendSub(t, ''),
        chart: stepsHistory.length > 0 ? rangedChart(stepsHistory, 'steps', (rows) => gradedChart('stepsChart',
          <Bar data={metricBarData({ history: rows, valueKey: 'steps', label: 'Steps', target: parseInt(targets?.steps) || null, fallback: (a) => `rgba(167, 139, 250, ${a})`, plain: plainCharts.has('stepsChart') })} options={stepsChartOptions} />
        )) : null,
      }
    })(),
    (() => {
      // Weight trends on the DISPLAY series, so the average is in the same
      // unit as the goal rather than whatever unit each weigh-in was logged in.
      const t = windowTrend(weightHistoryDisplay, 'weight', { days: TREND_DAYS, minMaterial: MIN_MATERIAL.weight })
      return {
        key: 'weight', label: 'Weight', color: 'var(--color-weight)', trend: t,
        display: t.current != null ? `${t.current.toFixed(1)} ${weightDisplayUnit}` : '—',
        sub: trendSub(t, ` ${weightDisplayUnit}`, 1),
        chart: weightHistory.length > 1 ? rangedChart(weightHistoryDisplay, 'weight', (rows, rangeKey) => (
          <>
            <Line
              data={{
                labels: rows.map(d => d.date),
                datasets: [
                  {
                    label: 'Weight',
                    data: rows.map(d => d.weight),
                    // eslint-disable-next-line no-restricted-syntax -- chart.js renders to a canvas and cannot resolve a CSS var; kept matched to the metric token by hand.
                    borderColor: '#34d399',
                    backgroundColor: 'rgba(52, 211, 153, 0.15)',
                    // eslint-disable-next-line no-restricted-syntax -- chart.js renders to a canvas and cannot resolve a CSS var; kept matched to the metric token by hand.
                    pointBackgroundColor: '#34d399',
                    pointRadius: 3,
                    tension: 0.3,
                    fill: true,
                  },
                  // The 7-day average is dropped on the YEAR view, deliberately.
                  // Those points are already monthly means, so a 7-point rolling
                  // mean over them is a smoothing of a smoothing covering seven
                  // MONTHS — it would render as a nearly flat line labelled
                  // "7-day avg", which is a chart saying something untrue about
                  // its own window.
                  ...(hasSoloPremium && rangeKey !== 'Y' ? [{
                    label: '7-day avg',
                    data: computeRollingAverage(rows),
                    borderColor: 'rgba(52, 211, 153, 0.45)',
                    backgroundColor: 'transparent',
                    borderDash: [4, 4],
                    pointRadius: 0,
                    tension: 0.3,
                    fill: false,
                  }] : []),
                ]
              }}
              options={weightChartOptions}
            />
            {!hasSoloPremium && profile?.role !== 'client' && (
              <div style={{ marginTop: 'var(--space-16)' }}>
                <SoloUpgrade feature="The 7-day weight average" />
              </div>
            )}
          </>
        )) : null,
      }
    })(),
  ].filter(m => m.chart || m.trend.current != null)

  // First-run: a brand-new account with nothing logged yet (no nutrition,
  // weight, cardio or steps history, and nothing today). Drives a getting-
  // started card instead of a screen full of zeroed cards. Clears the moment
  // they log anything.
  const isEmptyAccount =
    !pageLoading &&
    calorieHistory.length === 0 &&
    weightHistory.length === 0 &&
    cardioHistory.length === 0 &&
    stepsHistory.length === 0 &&
    !loggedToday

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
      {pageLoading ? (
        <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
          {/* Streak skeleton */}
          <Skeleton height="100px" />

          {/* Date nav skeleton */}
          <div style={{ display: 'flex', gap: 'var(--space-12)', alignItems: 'center' }}>
            <Skeleton width="40px" height="38px" />
            <Skeleton width="140px" height="38px" />
            <Skeleton width="40px" height="38px" />
          </div>

          {/* Stats skeleton */}
          <div style={cardStyle}>
            <Skeleton height="22px" width="120px" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-16)' }}>
              {[...Array(6)].map((_, i) => <Skeleton key={i} height="72px" />)}
            </div>
          </div>

          {/* Targets skeleton */}
          <div style={cardStyle}>
            <Skeleton height="22px" width="140px" />
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
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
	          background: ALWAYS_DARK.milestone,
	          border: `1px solid ${ALWAYS_DARK.success}`,
	          borderRadius: 'var(--radius)',
	          padding: 'var(--space-16) var(--space-20)',
	          display: 'flex',
	          alignItems: 'center',
	          justifyContent: 'space-between',
	          gap: 'var(--space-16)',
	        }}>
	          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
	            {/* Decorative emoji, the streak/milestone exception named in the
	                design doc — not an icon, and not a precedent for one. */}
	            <span style={{ fontSize: 'var(--text-title)' }}>🔥</span>
	            <div>
	              <p style={{ fontWeight: 'var(--weight-semibold)', color: ALWAYS_DARK.success, margin: 0, fontSize: 'var(--text-md)' }}>
	                {milestone}-day streak!
	              </p>
	              <p style={{ color: ALWAYS_DARK.muted, margin: 0, fontSize: 'var(--text-xs)' }}>
	                {milestone === 7 && 'One week straight. Keep it going.'}
	                {milestone === 14 && "Two weeks consistent. You're building a habit."}
	                {milestone === 30 && '30 days. This is who you are now.'}
	                {milestone === 60 && '60 days. Seriously impressive.'}
	                {milestone === 90 && "90 days. You've changed your life."}
	              </p>
	            </div>
	          </div>
	          <IconButton onClick={() => setMilestone(null)} aria-label="Dismiss">
	            <Icon name="x" size={18} />
	          </IconButton>
	        </div>
	      )}

	      {showOffboardNotice && (
	        <Notice
	          tone="warning"
	          icon={<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>}
	          onDismiss={async () => {
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
	        >
	          {offboardReason === 'coach_deleted'
	            ? "Your coach's account was closed. Your data is preserved. You're now on a solo plan and can keep tracking on your own."
	            : "Your coach ended the coaching relationship. Your data is preserved. You're now on a solo plan and can keep tracking on your own."
	          }
	        </Notice>
	      )}

	      {showNudgeNotice && (
	        <Notice
	          icon={<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>}
	          onDismiss={() => {
	            localStorage.setItem(`nudge_dismissed_${profile.id}_${nudgeTimestamp}`, 'true')
	            setShowNudgeNotice(false)
	          }}
	        >
	          Your coach checked in on you. Log your nutrition today to keep your progress on track.
	        </Notice>
	      )}

	      {showMeasReminder && (
	        <Notice
	          icon={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>}
	          action={<Button onClick={() => navigate('/log')} variant="muted" size="sm">Update</Button>}
	          onDismiss={() => {
	            if (lastMeasuredIso) localStorage.setItem(`meas_reminder_dismissed_${profile.id}_${lastMeasuredIso}`, 'true')
	            setShowMeasReminder(false)
	          }}
	        >
	          {/* E-rule 0: the em dash here was a full stop wearing a costume. */}
	          It's been {measurementStatus({ lastMeasuredIso, cadenceDays: 28 }).daysSince} days since your last measurements. A good time for a fresh set.
	        </Notice>
	      )}

	      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
	        {/* E1: the nav said "Dashboard" and the page said "My Progress", so a
	            client had to check they were in the right place. One name now, on
	            both sides and for both roles — "Dashboard" was a placeholder word
	            for the solo view, the way "Coach Dashboard" was for the roster
	            before it became "Clients". NavBar carries the matching label. */}
	        <h1>My Progress</h1>

        {/* THE IDENTITY STRIP (roadmap 6.1).
            Three facts about one subject is a StatCell strip (C1), and these
            three are the ones a person's logging history says about them.

            It replaces the standing gradient streak card, which stated the
            current streak in a surface of its own directly above a page that
            now states it here. C6: a number met twice on one screen is the
            duplication that survives review, because each surface reads as
            reasonable on its own. The CELEBRATION is not lost — the milestone
            card below is the earned, transient one, and it is the half the
            design system sanctions a gradient for. What went is the permanent
            card that re-announced a number every day whether or not anything
            had happened.

            The nudge went with it, into the sub-line under the number it is
            about, which is nearer to the thing it is asking for than a
            sentence in a separate card was. */}
        {/* The parent's 8px gap was sized for a BORDERED card: the streak card
            drew its own edge, so the space around it only had to stop it
            touching its neighbours. A borderless strip has nothing but space
            to separate it from the title above and the date control below, so
            it carries its own — A3 wants ≥24 between groups, and 8 + 16 is
            where that lands. */}
        <div className="ds-statstrip is-compact" style={{ margin: 'var(--space-16) 0' }}>
          <IdentityStat
            label="Current streak"
            value={streak}
            unit={streak === 1 ? 'day' : 'days'}
            sub={!loggedToday && streak > 0 ? 'Log today to keep it' : (streak >= 7 && loggedToday ? "You're on a roll" : '')}
            subTone={!loggedToday && streak > 0 ? 'var(--color-warning)' : undefined}
          />
          <IdentityStat
            label="Longest streak"
            value={longestStreak}
            unit={longestStreak === 1 ? 'day' : 'days'}
            // Only worth saying when it is not the same run twice. A personal
            // best that IS the current streak is the thing the first cell
            // already said.
            sub={longestStreak > 0 && longestStreak === streak ? 'Your best, right now' : ''}
          />
          <IdentityStat
            label="Days logged"
            value={daysLogged}
            unit={daysLogged === 1 ? 'day' : 'days'}
            sub="All time"
          />
        </div>

        {/* A3, and the reason it is two nested flexes rather than one row:
            `‹ date ›` is ONE control — stepping and picking set the same value —
            so it clusters at 8px. The Today slot is a different thing and sits a
            group-gap out.

            As one evenly-spaced row it fell apart, because controlStyle is
            `width: 100%` and a date input given a whole page takes it: the
            field stretched ~1450px for a value that needs ~150, and the arrows
            and the Today slot ended up pinned to opposite margins. Evenly
            spaced reads flat (A3) — here it also stopped the four parts reading
            as one date control at all. `width: auto` lets the field size to its
            own content, which is what a date field wants. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-24)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
            <Button onClick={goToPrevDay} variant="muted" size="sm" ariaLabel="Previous day"><Icon name="left" /></Button>
            <input
              type="date"
              aria-label="Selected date"
              value={selectedDate}
              max={toLocalDateString(new Date())}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ ...inputStyle, width: 'auto' }}
            />
            <Button onClick={goToNextDay} disabled={isToday} variant="muted" size="sm" ariaLabel="Next day"><Icon name="right" /></Button>
          </div>
          {/* Appears ONLY once the date has moved, which is the only time it has
              anything to do. It began as a 999px "TODAY" pill you cannot press —
              decoration, a pixel away from two real controls (C1) — and the
              muted text that replaced it was no better: a word that just sat
              there restating the date beside it, in the slot a real button
              takes the moment you step off today. Nothing at today; a Button
              when there is somewhere to go. Same rule as the Log header. */}
          {!isToday && (
            <Button onClick={() => setSelectedDate(toLocalDateString(new Date()))} variant="muted" size="sm">
              Today
            </Button>
          )}
	        </div>
	      </div>

      {isEmptyAccount && (
        <div style={{ ...cardStyle, backgroundColor: 'var(--color-primary-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-10)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21V9" />
              <path d="M12 13C12 8.5 8.5 5.5 3.5 5.5 3.5 10 7 13 12 13z" />
              <path d="M12 11c0-3.5 3.2-6.5 8-6.5 0 4-3.2 6.5-8 6.5z" />
            </svg>
            {/* A5: a section heading on this page is --text-body / medium, which
                is what SectionHeader renders for every sibling card. The bare
                global h2 made these two the only --text-lg headings on screen. */}
            <h2 style={sectionHeadingStyle}>
              {profile?.role === 'client' ? "Let's get your first day in" : 'Welcome to Gardnr'}
            </h2>
          </div>
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-base)', lineHeight: 1.6, maxWidth: '54ch' }}>
            {profile?.role === 'client'
              ? 'Your coach is all set up. Log your first meal to start your streak and share your progress. Your targets are already set for you.'
              : 'Nothing logged yet. Log your first meal to start your charts and streak, then set your daily targets so we can track how you’re trending.'}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-10)', flexWrap: 'wrap' }}>
            <Button variant="primary" onClick={() => navigate('/log')}>Log your first meal <Icon name="right" /></Button>
            {profile?.role !== 'client' && (
              <Button variant="muted" onClick={() => navigate('/profile?focus=targets')}>Set your targets</Button>
            )}
          </div>
        </div>
      )}

      {profile?.role === 'client' && (lockInfo.locked || lockInfo.reason === 'coach-unlocked') && (
        <div style={{ ...cardStyle, backgroundColor: 'var(--color-warning-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-10)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <h2 style={sectionHeadingStyle}>Progress view paused</h2>
          </div>
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-base)', lineHeight: 1.6, maxWidth: '54ch' }}>
            {lockInfo.reason === 'coach-unlocked'
              ? 'Your coach unlocked your account. You have 48 hours to log your nutrition before it locks again.'
              : `No nutrition logged for ${lockInfo.days} ${lockInfo.days === 1 ? 'day' : 'days'}. Log today to bring your progress view back, or ask your coach to unlock it.`}
          </p>
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
            Your logging form is still fully available. Keep adding entries any time.
          </p>
        </div>
      )}


      {/* Coach reports used to live here. They are correspondence, not
          progress data, and they now sit on /coach with the conversation —
          one surface for one relationship. This page is progress again. */}

      {/* Weekly check-in */}
      {profile?.role === 'client' && (
        <div id="section-checkin" style={cardStyle}>
          <SectionHeader
            title={`${cadenceLabel(checkinInterval)} check-in`}
            collapsed={sectionsCollapsed.checkin}
            onToggle={() => toggleSection('checkin')}
            badge={!existingCheckIn ? 'To do' : null}
            badgeColor="var(--color-error)"
          >
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 'var(--space-8) 0' }}>
                {existingCheckIn
                  ? (checkinInterval > 1 ? <><Icon name="check" /> Submitted this period</> : <><Icon name="check" /> Submitted this week</>)
                  : 'Let your coach know how your week went.'}
              </p>
              <Button
                onClick={() => setShowCheckIn(!showCheckIn)}
                variant={existingCheckIn ? 'ghost' : 'primary'}
                size="sm"
              >
                {existingCheckIn ? 'Edit' : 'Fill out'}
              </Button>
              {existingCheckIn?.coach_comment && (
                // A1/A3: this was a bordered, filled box inside the section card
                // — a second surface drawn to say "these two lines belong
                // together", which space already says. The eyebrow names it and
                // 24px of air separates it from the button above.
                <div style={{ marginTop: 'var(--space-24)' }}>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-6)' }}>Coach's note</p>
                  <p style={{ fontSize: 'var(--text-base)', lineHeight: 1.6 }}>{existingCheckIn.coach_comment}</p>
                </div>
              )}
              {showCheckIn && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)', paddingTop: 'var(--space-16)', borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-16)' }}>
                  {questions.length > 0 ? (
                    questions.map(q => {
                      const val = answers[q.id]
                      const setAns = (v) => setAnswers(a => ({ ...a, [q.id]: v }))
                      const ratingMax = q.config?.max || 10
                      return (
                        <div key={q.id}>
                          <p style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-8)' }}>
                            {q.prompt}{q.required && <span style={{ color: 'var(--color-error)' }}> *</span>}
                            {q.type === 'rating' && <strong className="tnum"> {val ?? Math.ceil(ratingMax / 2)}/{ratingMax}</strong>}
                          </p>
                          {q.type === 'rating' && (
                            <input type="range" min="1" max={ratingMax} value={val ?? Math.ceil(ratingMax / 2)} onChange={(e) => setAns(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
                          )}
                          {/* D2: these were a local checkinPillStyle/-Active pair,
                              i.e. a second implementation of ui/Pill sitting two
                              files away from it — the exact copy that drifted on
                              the lenses and the banner CTA. Pill IS a Button, so
                              these now inherit its hover, press and height. */}
                          {q.type === 'boolean' && (
                            <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
                              {[['Yes', true], ['No', false]].map(([label, bv]) => (
                                <Pill key={label} type="button" active={val === bv} onClick={() => setAns(bv)}>{label}</Pill>
                              ))}
                            </div>
                          )}
                          {q.type === 'number' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
                              <Field type="number" value={val ?? ''} onChange={(e) => setAns(e.target.value)} style={{ maxWidth: '160px' }} />
                              {q.config?.unit && <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>{q.config.unit}</span>}
                            </div>
                          )}
                          {q.type === 'text' && (
                            <Textarea value={val ?? ''} onChange={(e) => setAns(e.target.value)} rows={3} placeholder="Your answer…" />
                          )}
                          {q.type === 'select' && (
                            <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
                              {(q.config?.options || []).map(opt => (
                                <Pill key={opt} type="button" active={val === opt} onClick={() => setAns(opt)}>{opt}</Pill>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <>
                      <div>
                        <p style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-8)' }}>Adherence: how well did you follow the plan? <strong className="tnum">{checkIn.adherence_rating}/10</strong></p>
                        <input type="range" min="1" max="10" value={checkIn.adherence_rating} onChange={(e) => setCheckIn({ ...checkIn, adherence_rating: parseInt(e.target.value) })} style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-8)' }}>Energy levels this week <strong className="tnum">{checkIn.energy_level}/10</strong></p>
                        <input type="range" min="1" max="10" value={checkIn.energy_level} onChange={(e) => setCheckIn({ ...checkIn, energy_level: parseInt(e.target.value) })} style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-8)' }}>Any obstacles or challenges?</p>
                        <Textarea value={checkIn.obstacles} onChange={(e) => setCheckIn({ ...checkIn, obstacles: e.target.value })} placeholder="Stress, travel, injury, time constraints..." rows={3} />
                      </div>
                      <div>
                        <p style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-8)' }}>Notes for your coach</p>
                        <Textarea value={checkIn.notes} onChange={(e) => setCheckIn({ ...checkIn, notes: e.target.value })} placeholder="Anything else you want your coach to know..." rows={3} />
                      </div>
                    </>
                  )}
                  <Button onClick={saveCheckIn} variant="primary">Submit check-in</Button>
                </div>
              )}
              {checkInSaved && <p style={{ color: 'var(--color-success)', fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}><Icon name="check" /> Check-in submitted successfully.</p>}
          </SectionHeader>
        </div>
      )}

      {/* Today — one cell per metric, each carrying its own target.
          Was two panels: "Today's stats" (seven bare numerals) immediately
          followed by "Today vs target" (the same six with denominators). */}
      <div style={cardStyle}>
        <SectionHeader title={todayHeading}>
          <TodayPanel macros={macroCells} activity={activityCells} />
        </SectionHeader>
      </div>

      <Reorderable order={cardOrder} onReorder={saveCardOrder} enabled={profile?.role === 'solo' && hasSoloPremium}>

      {/* Trends — the question this page never answered: which way am I going?
          Replaces FOUR panels and ~2,400px: "Today vs target" (whose six rows
          restated Today's six numbers), the weight line chart, and the three
          near-identical 30-day bar charts for calories, cardio and steps. All
          four left the comparison to the reader; thirty bars are a picture of a
          series, not a statement about it. Each row now states the move, and
          the chart is the row's disclosure rather than a standing panel. */}
      {!(profile?.role === 'client' && lockInfo.locked) && trendMetrics.length > 0 && (
        <div key="trends" style={cardStyle}>
          {/* The window and the method hang off the title itself rather than
              sitting above the rows as a standing paragraph. This was a hand-
              placed InfoTip wrapping the title; SectionHeader does exactly that
              for every caller now, so it goes through `info` like the rest. */}
          <SectionHeader
            title="Trends"
            info={`Your last ${TREND_SPAN} against the ${TREND_SPAN} before. Averaged over the days you logged, not over the calendar, so a gap in logging does not read as a drop. A direction only shows when the move is bigger than your own day-to-day swing.`}
            action={<RangePicker value={trendRangeKey} onChange={setTrendRangeKey} />}
          >
            <TrendsPanel metrics={trendMetrics} range={trendRangeKey} />
          </SectionHeader>
        </div>
      )}

      {/* Logging consistency — Solo Premium self-analytics. Descriptive only:
          best week, weekday/weekend split, and a 90-day heatmap. Reports the
          user's own consistency, never prescribes or adjusts a plan. */}
      {profile?.role !== 'client' && (
        <div key="consistency" id="section-consistency" style={cardStyle}>
          {/* This was the one section on the page with a bare <h3> and no
              SectionHeader, so it was the only card that could not be collapsed
              and the only heading a step off the ramp. */}
          <SectionHeader
            title="Logging consistency"
            collapsed={sectionsCollapsed.consistency}
            onToggle={() => toggleSection('consistency')}
            animated={false}
          >
          {/* Stays a visible subtitle rather than moving into SectionHeader's
              InfoTip: D5 reserves the bubble for what nothing else shows, and
              this names the window every number below it is measured over. */}
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: '0 0 var(--space-16)' }}>
            How steadily you've logged over the last 90 days.
          </p>
          {hasSoloPremium ? (
            <>
              {/* C1: three facts about one subject is a StatCell strip, not three
                  filled boxes. The boxes were --color-bg panels inside a
                  --color-surface card — A1 depth 2, and a surface drawn DARKER
                  than the card it sits in, which inverts D0's ramp. The grade
                  still lives on the numeral (B1), which is where it was; only
                  the container went. */}
              <div className="ds-statstrip">
                {consistency && (
                  <>
                    <ConsistencyStat
                      label="Weekdays"
                      hint={CONSISTENCY_TIPS.weekdays}
                      n={consistency.weekdayLogged}
                      of={consistency.weekdayTotal}
                      tone={ratioTone(consistency.weekdayLogged / (consistency.weekdayTotal || 1))}
                      sub={`${consistency.weekdayTotal > 0 ? Math.round((consistency.weekdayLogged / consistency.weekdayTotal) * 100) : 0}% of Mon–Fri`}
                    />
                    <ConsistencyStat
                      label="Weekends"
                      hint={CONSISTENCY_TIPS.weekends}
                      n={consistency.weekendLogged}
                      of={consistency.weekendTotal}
                      tone={ratioTone(consistency.weekendLogged / (consistency.weekendTotal || 1))}
                      sub={`${consistency.weekendTotal > 0 ? Math.round((consistency.weekendLogged / consistency.weekendTotal) * 100) : 0}% of Sat–Sun`}
                    />
                  </>
                )}
                {bestWeek && bestWeek.count > 0 && (
                  <ConsistencyStat
                    label="Best week"
                    hint={CONSISTENCY_TIPS.bestWeek}
                    n={bestWeek.count}
                    of={7}
                    // B1: a best week is graded against the seven days it had,
                    // so it takes the same ramp as the two cells beside it
                    // rather than a second set of thresholds. It used to grade
                    // 5-of-7 amber here and 5-of-7 green one cell to the left.
                    tone={ratioTone(bestWeek.count / 7)}
                    sub={`${bestWeek.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${bestWeek.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                  />
                )}
              </div>

              {/* 90-day heatmap (left) + summary totals (fills the space at right) */}
              <div style={{ marginTop: 'var(--space-16)', display: 'flex', gap: 'var(--space-20)', flexWrap: 'wrap', alignItems: 'stretch' }}>
                <div style={{ flex: '1 1 300px', minWidth: 0, maxWidth: '440px' }}>
                  <ComplianceHeatmap logsByDate={heatmapData} calorieTarget={targets?.calories} />
                </div>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <ComplianceSummary logsByDate={heatmapData} calorieTarget={targets?.calories} variant="solo" />
                </div>
              </div>

              {!bestWeek?.count && Object.keys(heatmapData).length === 0 && (
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 'var(--space-12) 0 0' }}>
                  Log a few more days and your consistency trends will show up here.
                </p>
              )}
            </>
          ) : (
            <SoloUpgrade feature="Logging consistency" />
          )}
          </SectionHeader>
        </div>
      )}

      </Reorderable>

      {profile?.role === 'client' && (
        <div style={cardStyle}>
          <h2 style={sectionHeadingStyle}>Coaching</h2>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
            Leave your current coaching plan and return to an individual account. Your data is preserved.
          </p>
          {!showSelfOffboardConfirm ? (
            <Button onClick={() => setShowSelfOffboardConfirm(true)} variant="danger" size="sm">
              Leave coaching plan
            </Button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-10)' }}>
              <p style={{ fontSize: 'var(--text-base)', margin: 0 }}>
                Are you sure? You'll return to a solo account.
              </p>
              {selfOffboardError && <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-base)', margin: 0 }}>{selfOffboardError}</p>}
              <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
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
      <ConfirmDialog
        open={notice !== null}
        message={notice}
        confirmLabel="OK"
        onConfirm={() => setNotice(null)}
      />
    </div>
  )
}

export default Dashboard
