import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import SectionHeader from '../components/SectionHeader'
import Toast from '../components/Toast'
import ComplianceHeatmap from '../components/ComplianceHeatmap'
import ComplianceSummary from '../components/ComplianceSummary'
import ReportProse from '../components/ReportProse'
import Modal from '../components/Modal'
import Skeleton from '../components/Skeleton'
import { relativeTime, numericDate } from '../utils/relativeTime'
import { byMonth, leadOf } from '../utils/reportFeed'
import ComplianceBreakdown from '../components/ComplianceBreakdown'
import EnergyBalanceRead from '../components/EnergyBalanceRead'
import ChatBubble from '../components/ChatBubble'
import { fetchMessageWindow, refreshSize, growSize, hasOlderMessages } from '../utils/messageThread'
import { GOALS } from '../utils/goals'
import InfoTip from '../components/InfoTip'
import ChartColorToggle from '../components/ChartColorToggle'
import { CONSISTENCY_TIPS } from '../utils/consistencyTips'
import { metricBarData } from '../utils/metricBarChart'
import { bucketHistory, historyWindow, DEFAULT_RANGE } from '../utils/chartRange'
import { ADHERENCE_DAYS, ADHERENCE_WEEKS, ADHERENCE_NAME, ADHERENCE_FETCH_DAYS, GRAINS, DEFAULT_GRAIN, isGrain, heatmapCap } from '../utils/complianceWindow'
import RangePicker from '../components/RangePicker'
import { usePlainCharts } from '../utils/usePlainCharts'
import { CHART, MARK, baseChartOptions } from '../utils/chartTheme'
import { computeWeightTarget, convertWeight, convertGoalValue, normUnit } from '../utils/weightTarget'
import { measurementCadenceDays, measurementStatus } from '../utils/measurementCadence'
import { useMediaQuery } from '../hooks/useMediaQuery'
import Reorderable from '../components/Reorderable'
import SectionRail from '../components/SectionRail'
import { SECTION_ICONS } from '../utils/sectionIcons'
import TargetCalculator from '../components/TargetCalculator'
import { mergeOrder } from '../utils/cardOrder'
import { resolveLockState } from '../utils/lockState'
import { ageFromBirthDate } from '../utils/biometrics'
import Avatar from '../components/Avatar'
import { energyBalanceRead, WINDOW_OPTIONS, WINDOW_DATA_DAYS } from '../utils/energyBalanceRead'
import { computeClientStats } from '../utils/clientStats'
import { latestCheckIn, coversPeriod } from '../utils/checkinLookup'
import { attentionLevel } from '../utils/attentionLevel'
import { complianceBreakdown } from '../utils/complianceBreakdown'
import { nudgeReason } from '../utils/nudgeReason'
import { CADENCE_OPTIONS } from '../utils/cadence'
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
import { Icon, Pill, Field, Select, Textarea, Notice } from '../components/ui'
import { scrollBehavior } from '../utils/motion'

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
  stats: 'Stats', consistency: 'Adherence', sentReports: 'Reports', targets: 'Targets',
  nutritionLog: 'Nutrition', checkIn: 'Check-in', privateNotes: 'Notes', correlatedChart: 'Progress',
  dailyMetrics: 'Daily metrics',
  measurements: 'Measurements',
  // Not a REORDERABLE key — it is pinned at the foot of the rail — but it
  // still needs a label, because the phone's destination list reads from here.
  coaching: 'Coaching',
}
// Open/closed state per section, remembered across reloads (see the effect in
// the component). `groundwork` is the AI panel, which is not a REORDERABLE key
// but collapses the same way, so it rides along in the same record.
const COLLAPSED_KEY = 'gardnr-cv-collapsed'
const COLLAPSED_DEFAULTS = {
  stats: false,
  consistency: false,
  sentReports: false,
  targets: false,
  nutritionLog: false,
  checkIn: false,
  privateNotes: false,
  correlatedChart: false,
  // One card, opened by default. Collapsed, three separate cards cost three
  // clicks to answer one question; expanded they cost 1,851px — more than two
  // screens — which is why they were collapsed in the first place.
  dailyMetrics: false,
  measurements: false,
  groundwork: false,
}

// Stored values are layered OVER the defaults, never used in place of them, so
// a section added after a coach last saved still gets its intended default
// instead of appearing as `undefined` (which renders expanded, silently
// undoing the decision to ship the charts closed).
function loadCollapsed() {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY)
    if (!raw) return { ...COLLAPSED_DEFAULTS }
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object') return { ...COLLAPSED_DEFAULTS }
    const next = { ...COLLAPSED_DEFAULTS }
    for (const k of Object.keys(COLLAPSED_DEFAULTS)) {
      if (typeof saved[k] === 'boolean') next[k] = saved[k]
    }
    return next
  } catch {
    return { ...COLLAPSED_DEFAULTS }
  }
}

// What the SUMMARY shows when there is no rail. A coach opens a client record
// to answer "how is this person, and what do I do" — that is triage, so the
// summary carries the standing facts and the work that is waiting, and
// everything else becomes a destination.
//
// Destinations are derived (registry minus this set), never listed a second
// time: a hand-kept second list is how a section becomes unreachable on a
// phone with nothing erroring.
// C1/B1: the grade is carried by the text's colour, never a pill. Same tones
// the roster's status column uses, so one client reads the same on both.
const TONE_COLORS = {
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
  success: 'var(--color-success)',
}

const SUMMARY_KEYS = ['groundwork', 'stats', 'consistency', 'checkIn']

// Six of the phone's eleven destinations were the same kind of thing: a chart
// over time, each with its own header, its own card and its own fixed window.
// That is what made the list read as a filing cabinet — nothing was weighted,
// because everything was the same. They are one destination with a switcher
// now; the only thing that differed between them was the series, and a series
// is a control, not a section.
const TREND_KEYS = ['correlatedChart', 'dailyMetrics', 'measurements']
const TREND_LABELS = {
  correlatedChart: 'Progress', dailyMetrics: 'Daily metrics',
  measurements: 'Measurements',
}
// Progress, now that Weight is a dialog opened from inside it rather than a
// destination of its own. It was the default because it answered the first
// question; the card that carries it answers the same one and the next.
const DEFAULT_TREND = 'correlatedChart'

// Sent reports load a page at a time, like the client's own archive
// (Reports.jsx PAGE). A coach writes roughly one a week per client and the row
// carries the full body, so "all of them" is a list that only ever grows.
//
// FIVE, not twenty. Twenty is the right page size for the client's archive,
// which is a PAGE whose whole job is that list. Here it is one section of
// fourteen on a record, and twenty rows at 75px came to 1,612px — a fifth of
// the entire page, for a list a coach mostly glances at.
//
// Five is the recent run: has a report gone out lately, and has the client
// read it. The recent few stay RIGHT HERE, ungated — that is why this is five
// rows and not a button, and a button hiding the whole list was tried and
// rejected for putting a fourth tap between a coach and a report.
//
// What changed is where "all of them" lives. An ever-growing list inside a
// record is a page that gets longer every week a coach does their job, so the
// rest moved into an archive over the record: scrollable, sortable, filterable.
// That is the call Coach.jsx already made for the client's side of the same
// relationship — "the archive is a destination, not a channel".
const SENT_PAGE = 5

// How many recent reports ride along in the thread. Matches Coach.jsx so the
// two sides of one relationship show the same stretch of it.
const THREAD_REPORTS = 8

// The DEFAULT order only — a coach who has dragged anything keeps their own
// layout forever (mergeOrder preserves every saved key and only appends ones
// they have never seen).
//
// It used to end with the four charts, which put the whole question a coach
// opens a record to ask — is the weight actually moving — at 4,422px, below a
// 638px targets FORM and a notes box. Adherence stays near the top because it
// earns it (the heatmap and the breakdown are analysis, not bookkeeping), but
// configuration belongs under the outcome it configures, not over it.
const REORDERABLE_KEYS = ['consistency', 'sentReports', 'nutritionLog', 'checkIn', 'correlatedChart', 'dailyMetrics', 'measurements', 'targets', 'privateNotes']

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
  // `section` is the mobile detail route: /client/:id/:section. Absent = the
  // summary. On a desktop it is only a scroll target — the rail is on screen,
  // so every section stays rendered and the param just says where to land.
  const { clientId, section } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))
  const [clientProfile, setClientProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [dayComplete, setDayComplete] = useState(false)
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [weightEntry, setWeightEntry] = useState(null)
  const [report, setReport] = useState('')
  const [reportSubject, setReportSubject] = useState('')
  const [reportWeekRange, setReportWeekRange] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [weightHistory, setWeightHistory] = useState([])
  const [measHistory, setMeasHistory] = useState([])
  const [plainCharts, togglePlain] = usePlainCharts()
  // Column budget for the body-measurement small-multiples (3 desktop / 2 tablet
  // / 1 phone). The actual count is balanced against the number of sites below,
  // so the trend charts always tile into even rows with no trailing gap.
  const measViewWide = useMediaQuery('(min-width: 1000px)')
  // Matches the rail's own breakpoint. Above it the record is one scrollable
  // page with a rail to jump around; below it the rail is display:none, which
  // left fourteen stacked sections and no map. That is the split this page
  // branches on — not "mobile" in the abstract, but "is there a rail".
  const hasRail = useMediaQuery('(min-width: 1024px)')

  // Which series the Trends destination is showing. In the URL rather than in
  // state so the back button steps through metrics and a link can name one.
  // W / M / Y, shared by every chart on this record rather than held per
  // chart. The point of a coach's Trends tab is reading several metrics about
  // ONE client together — weight against calories against steps — and that
  // only works if they cover the same span. Mixed windows would let a coach
  // compare a year of weight with a week of steps and see a relationship that
  // is not there.
  const [chartRange, setChartRange] = useState(DEFAULT_RANGE)
  // Which chart, if any, is open in a dialog. One value rather than a boolean
  // per chart: only one can be open, and the next chart to earn an expand
  // (Daily metrics and Measurements are the two tallest sections left) adds a
  // string here rather than another piece of state.
  const [expandedChart, setExpandedChart] = useState(null)
  // A cadence the coach has PICKED but not committed. null = nothing staged.
  //
  // Changing the select used to write immediately, and that one gesture did
  // three things with no confirmation and no feedback on success: it wrote to
  // coach_clients, it fired the trigger that tells the client their schedule
  // moved, and it swapped the check-in this card displays. A dropdown that
  // emails somebody should not be a dropdown.
  const [pendingInterval, setPendingInterval] = useState(null)
  // Remembered per viewer, like `gardnr-eb-window`: whether a coach reads
  // adherence a day or a week at a time is about how they work, not about this
  // client. The SPAN is not a choice (see complianceWindow.js) — only this is.
  const [grain, setGrain] = useState(() => {
    try {
      const v = localStorage.getItem('gardnr-cv-grain')
      if (isGrain(v)) return v
    } catch { /* private mode — the default still works */ }
    return DEFAULT_GRAIN
  })
  function changeGrain(key) {
    setGrain(key)
    try { localStorage.setItem('gardnr-cv-grain', key) } catch { /* ignore */ }
  }

  // The window picker and the colour toggle travel together on every bar
  // chart, so they are declared once rather than spelled out at three call
  // sites — the shape that let the roster's fourth banner segment drift a type
  // step away from its three siblings and go unnoticed for a release.
  // A3: 8px inside a group, a group-gap between groups. The two controls are
  // NOT one control — the chips pick a window, the switch picks a colouring —
  // and at the header's own 8px the switch sat as close to "Y" as "Y" sat to
  // "M", so it read as a fourth range option.
  const chartControls = (key) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-20)' }}>
      <RangePicker value={chartRange} onChange={setChartRange} />
      <ChartColorToggle plain={plainCharts.has(key)} onToggle={() => togglePlain(key)} />
    </span>
  )
  const trendParam = searchParams.get('m')
  const activeTrend = TREND_KEYS.includes(trendParam) ? trendParam : DEFAULT_TREND
  // Phone width. The consistency labels carry a parenthetical that is useful on
  // a desktop and fatal on a 110px cell: "Weekdays (Mon-Fri)" wrapped onto two
  // lines and dumped its InfoTip in the middle of the wrap, which is what made
  // those bubbles look scattered. The tip was never the problem; the label was.
  const compact = useMediaQuery('(max-width: 600px)')
  // The name to use when telling the coach what an action will do to someone.
  const clientFirstName = clientProfile?.full_name?.split(' ')[0] || 'Your client'
  const cadenceLabel = (weeks) => CADENCE_OPTIONS.find(o => o.weeks === weeks)?.label || `${weeks} weeks`
  const measViewMid = useMediaQuery('(min-width: 640px)')
  const measColsMax = measViewWide ? 3 : measViewMid ? 2 : 1
  const [calorieHistory, setCalorieHistory] = useState([])
  // The selected DAY's cardio + steps. Read per-day like weightEntry rather
  // than plucked out of the 30-day histories below: those exist to draw charts
  // and are windowed, so a coach stepping back past the window would see "—"
  // for a day the client did log.
  const [dayCardio, setDayCardio] = useState(null)
  const [daySteps, setDaySteps] = useState(null)
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
  // Coach-owned now: the client renders this read-only on their Profile.
  const [clientGoal, setClientGoal] = useState('')
  const [checkinInterval, setCheckinInterval] = useState(1)
  // Shown vs owed are different questions (checkinLookup.js). `clientCheckIn`
  // is whatever they filed last; this says whether it lands inside the period
  // we are in now, which is what "due" and the nudge actually mean.
  const checkinCurrent = coversPeriod(clientCheckIn, checkinPeriod(checkinInterval))

  const [savingCadence, setSavingCadence] = useState(false)
  const [coachNotes, setCoachNotes] = useState('')
  const [notesUpdatedAt, setNotesUpdatedAt] = useState(null)
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
  // The archive over the record: every report, scrollable, sortable. Loaded
  // only when asked for — the whole point of the five above is that a coach
  // opening a client record does not pay for a year of reports.
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveReports, setArchiveReports] = useState(null)   // null = not loaded
  const [archiveNewestFirst, setArchiveNewestFirst] = useState(true)
  const [archiveFilter, setArchiveFilter] = useState('all')   // all | unread | read
  const [openArchiveReport, setOpenArchiveReport] = useState(null)
  // Totals come from the server, NOT from sentReports.length. The list is a
  // window now, so its length is "how many are loaded" — using it for the
  // section's count or its unread badge would quietly report 20 of 60.
  const [sentTotal, setSentTotal] = useState(0)
  const [sentUnread, setSentUnread] = useState(0)
  const [openReport, setOpenReport] = useState(null)      // report shown in the reader
  // Per-report expansion replaces the per-week collapse map the folder tree
  // needed. Sent reports default closed: the coach wrote them, so the useful
  // scan is "which landed", not re-reading their own prose.
  //
  // ONE id, not a map of them. A map let every report be open at once, and a
  // report is several paragraphs — three expanded turned the panel into a page
  // the coach had to scroll past to reach anything below it, which is the
  // opposite of a list you scan. Opening one closes the other; clicking the
  // open one closes it and leaves none open.
  const [openSentReport, setOpenSentReport] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageTotal, setMessageTotal] = useState(0)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [callBriefing, setCallBriefing] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [showOffboardConfirm, setShowOffboardConfirm] = useState(false)
  const [offboarding, setOffboarding] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [sectionsCollapsed, setSectionsCollapsed] = useState(loadCollapsed)
  const [aiToolsCollapsed, setAiToolsCollapsed] = useState(() => loadCollapsed().groundwork)

  // Persist the open/closed state of every section. Written on change rather
  // than saved to profiles.layout (where cardOrder lives) because a collapse is
  // a per-viewer convenience toggled many times a session — a DB round-trip per
  // click would be chatty and can fail, and the preference is about how this
  // coach likes to read, not about the client record. Same call the
  // energy-balance window already makes with `gardnr-eb-window`.
  //
  // It is deliberately GLOBAL, not per client: the sections are identical on
  // every client record, so a coach who keeps the charts shut wants them shut
  // for all of them, not to re-close them on each one.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        COLLAPSED_KEY,
        JSON.stringify({ ...sectionsCollapsed, groundwork: aiToolsCollapsed }),
      )
    } catch { /* private mode / quota — the page still works, it just forgets */ }
  }, [sectionsCollapsed, aiToolsCollapsed])

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
      if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
      else if (tries++ < 20) setTimeout(scroll, 100)
    }
    // Expand + scroll deferred to a frame so calling this from the deep-link
    // effect doesn't setState synchronously within the effect.
    requestAnimationFrame(() => {
      setSectionsCollapsed(prev => ({ ...prev, [key]: false }))
      setTimeout(scroll, 80)
    })
  }

  // Deep-link from a notification (?focus=checkIn etc.). 'chat' is handled by
  // ChatBubble; other values name a section here — and what "go there" means
  // now depends on whether there is a rail. With one, scroll. Without one, the
  // section IS a route, so hand it to the router and let the back button mean
  // something.
  useEffect(() => {
    const focus = searchParams.get('focus')
    if (!focus || focus === 'chat') return
    const sp = new URLSearchParams(searchParams)
    sp.delete('focus')
    if (hasRail) {
      goToSection(focus)
      setSearchParams(sp, { replace: true })
    } else {
      navigate(`/client/${clientId}/${focus}${sp.toString() ? `?${sp}` : ''}`, { replace: true })
    }
  }, [searchParams, setSearchParams, hasRail, clientId, navigate])

  // A desktop landing on /client/:id/:section renders the whole page, so the
  // param is a scroll target rather than a filter. Same vocabulary as the
  // phone, different behaviour — which is the point of using one param for
  // both instead of inventing a second concept.
  useEffect(() => {
    if (!section || !hasRail) return
    // `trends` is a phone-only grouping, not an anchor. On a desktop every
    // chart is already on the page, so the link resolves to the first of them
    // rather than retrying a scroll at an id that will never exist.
    goToSection(section === 'trends' ? activeTrend : section)
  }, [section, hasRail, activeTrend])

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
  fetchEnergyBalance()
  fetchSentReports()
  fetchMessages()
  fetchClientStatus()
  fetchClientMeasurements()
}, [clientId])

  useEffect(() => {
    fetchEntries()
    fetchWeight()
    fetchDayActivity()
  }, [clientId, selectedDate])

  // Its own effect, beside the page's other two, so the heatmap is not tied to
  // the fifteen queries that load with the page.
  useEffect(() => {
    fetchHeatmapData()
  }, [clientId])

  async function fetchClientProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', clientId)
      .single()
    if (data) setClientGoal(data.primary_goal || '')
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
    fetchClientCheckIn()

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
  // Cardio is summed because a client can log several sessions in one day;
  // steps is a single row per day.
  async function fetchDayActivity() {
    const [{ data: c, error: ce }, { data: st, error: se }] = await Promise.all([
      supabase.from('cardio_log').select('duration').eq('user_id', clientId).eq('logged_date', selectedDate),
      supabase.from('steps_log').select('steps').eq('user_id', clientId).eq('logged_date', selectedDate).limit(1),
    ])
    if (ce) console.error('Error fetching cardio:', ce)
    else setDayCardio(c?.length ? c.reduce((n, r) => n + (r.duration || 0), 0) : null)
    if (se) console.error('Error fetching steps:', se)
    else setDaySteps(st?.[0]?.steps ?? null)
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
  // A DATE window, not `limit(30)`. A row limit asks for 30 ROWS, and this
  // table supports more than one weigh-in a day, so a client who steps on the
  // scale twice reaches back half as far. It also capped the chart at the M
  // range exactly, leaving the Y range nothing to draw.
  const { from, to } = historyWindow()
  const { data, error } = await supabase
    .from('weight_log').select('logged_date, weight, unit')
    .eq('user_id', clientId)
    .gte('logged_date', from).lte('logged_date', to)
    .order('logged_date', { ascending: true })
  if (error) console.error(error)
  else setWeightHistory(
    data.map(d => ({ iso: d.logged_date, date: shortDate(d.logged_date), weight: parseFloat(d.weight), unit: d.unit }))
  )
}

async function fetchCalorieHistory() {
  const { from, to } = historyWindow()
  const { data, error } = await supabase
    .from('nutrition_log').select('logged_date, calories')
    .eq('user_id', clientId)
    .gte('logged_date', from).lte('logged_date', to)
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
  const { from, to } = historyWindow()
  const { data, error } = await supabase
    .from('cardio_log').select('logged_date, duration')
    .eq('user_id', clientId)
    .gte('logged_date', from).lte('logged_date', to)
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
  const { from, to } = historyWindow()
  const { data, error } = await supabase
    .from('steps_log').select('logged_date, steps')
    .eq('user_id', clientId)
    .gte('logged_date', from).lte('logged_date', to)
  if (error) console.error(error)
  else setStepsHistory(data.map(d => ({
    iso: d.logged_date, date: shortDate(d.logged_date), steps: d.steps
  })).sort((a, b) => a.iso.localeCompare(b.iso)))
}

  // The LATEST one, not one keyed to the current period. See checkinLookup.js:
  // keying by period made the cadence setting a retroactive index, so changing
  // it orphaned check-ins the client had already filed.
  async function fetchClientCheckIn() {
  const { data, error } = await supabase
    .from('check_ins')
    .select('*')
    .eq('client_id', clientId)
    .order('week_of', { ascending: false })
    .limit(1)
  if (error) console.error(error)
  else setClientCheckIn(latestCheckIn(data || []))
}

  async function updateCadence(weeks) {
    if (!profile?.id) return
    // Re-selecting the current value is not a change. The trigger that tells
    // the client their schedule moved guards on this too, but there is no
    // reason to make the round trip to find that out.
    if (weeks === checkinInterval) return
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
      setPendingInterval(null)
      // Success was silent before — only the failure path said anything, so a
      // coach had no way to tell a saved change from one that never left the
      // page, on an action that notifies their client.
      showToast(`Check-in schedule updated. ${clientFirstName} has been told.`)
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
    .select('content, updated_at')
    .eq('coach_id', currentSession.user.id)
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) console.error(error)
  else if (data) {
    setCoachNotes(data.content || '')
    setNotesUpdatedAt(data.updated_at || null)
  }
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
  // A week of slack past the span so the grid's first column, which starts on
  // a Sunday rather than exactly N days ago, is never drawn from data that was
  // never fetched.
  // The widest tier plus a week of slack, so one fetch serves both and
  // crossing the breakpoint never goes back to the network. The grid's first
  // column starts on a Sunday rather than exactly N days ago, hence the slack.
  start.setDate(start.getDate() - (ADHERENCE_FETCH_DAYS + 7))

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
  else {
    setNotesSaved(true)
    // Keep the row's "last updated" honest without a refetch.
    setNotesUpdatedAt(new Date().toISOString())
    setTimeout(() => setNotesSaved(false), 2000)
  }
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

  if (error) { console.error(error); return }

  // The goal lives on `profiles`, which a coach cannot write directly (only
  // profiles_update_self exists), so it goes through the narrow
  // set_client_primary_goal RPC. Only on an actual change: no point writing a
  // row every time the coach adjusts protein.
  if (clientGoal !== (clientProfile?.primary_goal || '')) {
    const { error: goalError } = await supabase.rpc('set_client_primary_goal', {
      p_client_id: clientId,
      p_goal: clientGoal || null,
    })
    if (goalError) { console.error(goalError); return }
    await fetchClientProfile()
  }

  setTargetsSaved(true); setTimeout(() => setTargetsSaved(false), 2000)
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
    setReportSubject(data.subject || '')
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
        subject: reportSubject.trim() || null,
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
// `size` is how many of the NEWEST messages to read — refreshSize() re-reads the
// current window, growSize() pages further back. The thread is never fetched
// whole; a long coaching relationship used to re-download every message here on
// every open, and twice over, since markMessagesRead refetches.
async function fetchMessages(size = refreshSize(0)) {
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const { messages: page, total, error } = await fetchMessageWindow(
    (q) => q.eq('coach_id', currentSession.user.id).eq('client_id', clientId),
    size,
  )
  if (error) { console.error(error); return }
  setMessages(page)
  setMessageTotal(total)
}

async function loadOlderMessages() {
  setLoadingOlderMessages(true)
  await fetchMessages(growSize(messages.length))
  setLoadingOlderMessages(false)
}

async function markMessagesRead() {
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  // Mark read by FILTER, not by the ids currently on screen. The thread is
  // windowed now, so an id list would only ever clear the newest page and
  // anything older would stay unread for good — the badge would never zero
  // out. One indexed update covers the whole thread and no-ops when there is
  // nothing unread.
  await supabase.from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('coach_id', currentSession.user.id)
    .eq('client_id', clientId)
    .neq('sender_id', currentSession.user.id)
    .is('read_at', null)
  await fetchMessages(refreshSize(messages.length))
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
  await fetchMessages(refreshSize(messages.length))
}

  // `size` is how many of the NEWEST reports to read. This used to fetch every
  // report ever written for the client, full body text included — one a week,
  // forever, all of it loaded each time the coach opened the record. The
  // client's own archive has been paged since it was built; the coach's copy
  // never was.
  // Every report for this client, fetched once and only when the archive is
  // opened. The five on the record are deliberately not enough to answer "what
  // did I send in March", and this is what answers it.
  //
  // No paging inside the archive: a coach writes about one a week, so even a
  // two-year client is ~100 rows, and a scroll container that also paginates
  // is two mechanisms for one job. If a roster ever produces a client with
  // thousands, this is the place that needs a range() — not the record.
  async function openArchive() {
    setArchiveOpen(true)
    if (archiveReports) return
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const { data, error } = await supabase
      .from('reports')
      .select('id, content, week_of, created_at, read_at')
      .eq('coach_id', currentSession.user.id)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) { console.error(error); setArchiveReports([]); return }
    setArchiveReports(data || [])
  }

  async function fetchSentReports(size = SENT_PAGE) {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    const { data, error, count } = await supabase
      .from('reports')
      .select('id, content, week_of, created_at, read_at', { count: 'exact' })
      .eq('coach_id', currentSession.user.id)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .range(0, size - 1)
    if (error) { console.error(error); return }
    setSentReports(data || [])
    setSentTotal(count ?? (data || []).length)

    // Unread is counted on the server rather than from the loaded page. An
    // unread report older than the window would otherwise vanish from the
    // badge — head:true means this costs a count, not rows.
    const { count: unread, error: unreadError } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', currentSession.user.id)
      .eq('client_id', clientId)
      .is('read_at', null)
    if (!unreadError) setSentUnread(unread ?? 0)
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

  // Both of these are Dashboard's, deliberately: the client's own day panel
  // already solved the same two problems on the same six facts, and a second
  // spelling of a solved problem is how two surfaces drift apart.
  //
  // The heading must not say "Today" when the stepper has moved off today —
  // Dashboard's words, and this panel was the one still doing it, printing a
  // past day's numbers under a caption contradicting the date control directly
  // above. Same locale and same format there as here, so one client's Monday
  // reads identically on both sides of the relationship.
  const statsTitle = isToday
    ? "Today's stats"
    : `Stats \u00b7 ${parseLocalDateString(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`

  // And the numbers are read AGAINST the targets, which lived only in the
  // rail's footer — a thousand pixels away, leaving the coach to hold six
  // numbers in their head and subtract. The client saw richer information
  // about their own day than their coach did, which is backwards.
  //
  // Copy is Dashboard's `targetSub` verbatim, percentage included, down to
  // F3's "No target set": every cell in a column of values carries a value,
  // and the absence of a target is a fact about the day too.
  // Dashboard's `num`. The value sat unformatted while the target under it was
  // grouped, so a card read "1609" over "of 1,850 cal" — two spellings of the
  // same kind of number, one above the other, inside one card.
  const num = (n) => Number(n || 0).toLocaleString()

  const dayTarget = (actual, target, unit = '') => {
    const t = Number(target)
    if (!Number.isFinite(t) || t <= 0) return 'No target set'
    return `of ${t.toLocaleString()}${unit} \u00b7 ${Math.round((Number(actual) || 0) / t * 100)}%`
  }

  // Weight axes across this view render in the goal's unit (falling back to the
  // latest logged unit) so every weight chart agrees; mirrors the weight-trend
  // chart's display-unit rule.
  const weightDisplayUnit = clientTargets.weight_goal
    ? normUnit(clientTargets.weight_goal_unit)
    : normUnit(weightHistory[weightHistory.length - 1]?.unit)

  // SMALL MULTIPLES, not a dual axis. This used to plot weight (lbs, left axis)
  // against calorie/cardio compliance (%, right axis) on one plot — the #1
  // charting mistake, because where the two scales line up is arbitrary, so the
  // chart invents a correlation that is not in the data. Weight at 180 sitting
  // level with 100% of target means nothing; move either axis and the "story"
  // changes. Two stacked plots share the x range instead: each has one axis,
  // the reader still reads them together, and nothing is implied that the data
  // does not say.
  //
  // `which` selects the plot. 'weight' is its own measure in real units;
  // 'compliance' is calories + cardio, both already normalised to % of target,
  // so they legitimately share one scale.
  function getCorrelatedChartData(which) {
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

    if (which === 'weight' && weightHistory.length > 0) {
      datasets.push({
        type: 'line', label: 'Weight',
        data: allDates.map(iso => {
          const row = weightHistory.find(d => d.iso === iso)
          return row ? Math.round(convertWeight(row.weight, normUnit(row.unit || weightDisplayUnit), weightDisplayUnit) * 10) / 10 : null
        }),
        // eslint-disable-next-line no-restricted-syntax -- chart.js renders to a canvas and cannot resolve a CSS var; kept matched to the metric token by hand.
        borderColor: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.15)',
        tension: 0.3, fill: true, pointRadius: 0, pointHoverRadius: 5,
        borderWidth: MARK.lineWidth, spanGaps: true,
      })
      // The goal, and only the goal. The 7-day average, the reached marker and
      // the caption live in the expanded chart: at 140px a second trace and a
      // 7px dot crowd the line they are meant to explain, while a flat dashed
      // rule reads at any height and answers "heading for it?" on its own.
      const goalRef = computeWeightTarget({
        weightHistory: weightHistory.map(d => ({
          ...d,
          unit: weightDisplayUnit,
          weight: Math.round(convertWeight(d.weight, normUnit(d.unit || weightDisplayUnit), weightDisplayUnit) * 10) / 10,
        })),
        weightGoal: clientTargets.weight_goal,
        weightGoalUnit: clientTargets.weight_goal_unit,
      })
      if (goalRef) datasets.push({
        type: 'line', label: `Goal (${goalRef.goal} ${goalRef.displayUnit})`,
        data: allDates.map(() => goalRef.goal),
        borderColor: CHART.targetLine, borderDash: [6, 4],
        borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, fill: false, tension: 0,
      })
    }

    if (which === 'compliance' && calorieHistory.length > 0 && calTarget) {
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
        backgroundColor: pct.map(v => barColor(v, 1)),
        borderWidth: 0, borderRadius: MARK.barRadius, maxBarThickness: MARK.barThickness,
      })
    }

    if (which === 'compliance' && cardioHistory.length > 0 && cardioTarget) {
      datasets.push({
        type: 'bar', label: 'Cardio %',
        data: allDates.map(iso => {
          const mins = cardioHistory.find(d => d.iso === iso)?.minutes
          return mins ? Math.round((mins / cardioTarget) * 100) : null
        }),
        // rgba, so the hex rule no longer matches and the disable that used to
        // sit here is gone with it. Still the cardio metric token by hand,
        // because a canvas cannot resolve a CSS var.
        backgroundColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 0, borderRadius: MARK.barRadius, maxBarThickness: MARK.barThickness,
      })
    }

    // 100%-of-target reference line, so over/under reads at a glance against the
    // % bars (drawn on the same right axis).
    if (which === 'compliance' && ((calorieHistory.length > 0 && calTarget) || (cardioHistory.length > 0 && cardioTarget))) {
      datasets.push({
        type: 'line', label: 'Target', data: allDates.map(() => 100),
        borderColor: CHART.targetLine, borderDash: [4, 4],
        borderWidth: 1, pointRadius: 0, fill: false, tension: 0,
      })
    }

    // Full dates for the maths above; the short label only at the axis.
    return { labels: allDates.map(shortDate), datasets }
  }

  // The raw calories bar chart: same bucket colors as the heatmap/summary
  // (green on-target, orange over, amber/red under) plus a target line.
  // `rows` is the range-bucketed series: the logged days for W and M, one
  // averaged point per month for Y. It defaults to the full history so the
  // function keeps working for any caller that has no range to apply.
  function calorieChartData(plain = false, rows = calorieHistory) {
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
      data: rows.map(d => d.calories),
      backgroundColor: rows.map(d => barColor(d.calories, 0.7)),
      borderColor: rows.map(d => barColor(d.calories, 1)),
      // Bar width follows the series length, the same rule metricBarChart.js
      // states: four monthly columns at 12px render as hairlines.
      borderWidth: 1, borderRadius: 4, maxBarThickness: rows.length <= 12 ? 28 : 12,
    }]
    if (calTarget && !plain) {
      datasets.push({
        type: 'line', label: 'Target',
        data: rows.map(() => calTarget),
        borderColor: CHART.targetLine, borderDash: [4, 4],
        borderWidth: 1, pointRadius: 0, fill: false, tension: 0,
      })
    }
    return { labels: rows.map(d => d.date), datasets }
  }

  // One axis each. The top plot hides its x labels — the bottom plot carries
  // them for both, which is what makes two stacked plots read as one figure
  // rather than two charts that happen to be near each other.
  const weightPlotOptions = {
    ...baseChartOptions({ singleSeries: true }),
    scales: {
      x: { ticks: { display: false }, grid: { display: false }, border: { display: false } },
      y: {
        // beginAtZero: false is LOAD-BEARING. A person's weight moves a few
        // percent; on a 0-200 axis a 10 lb cut is a flat line and the plot says
        // nothing at a glance — which is exactly what it was doing. `grace`
        // then keeps the trace off the top and bottom edges.
        beginAtZero: false,
        grace: '15%',
        ticks: { color: CHART_SERIES, maxTicksLimit: 4, callback: (v) => `${v}` },
        grid: { color: CHART.grid, drawTicks: false },
        border: { display: false },
      },
    },
  }
  const compliancePlotOptions = {
    ...baseChartOptions(),
    scales: {
      x: { ticks: { color: CHART.tick }, grid: { display: false }, border: { color: CHART.grid } },
      y: {
        min: 0, max: 150,
        ticks: { color: CHART.tick, maxTicksLimit: 4, callback: (v) => `${v}%` },
        grid: { color: CHART.grid, drawTicks: false },
        border: { display: false },
      },
    },
  }

  // A2: two densities and no third. These sections are read and typed into, so
  // they take ui/Panel's `comfortable` body padding verbatim — cardStyle's
  // --space-md (16px) was a third density, and it made every panel on this page
  // sit tighter than every Panel on the roster.
  // Which sections render, and the style that carries it.
  //
  // Gating by STYLE rather than by unmounting: this file is 2,600 lines of
  // inline sections, and hiding is one token per section instead of fourteen
  // brace-matched wrappers. Nothing moves, the scroll-spy keeps its anchors,
  // and a desktop renders exactly what it rendered before. (Unmounting the
  // hidden charts is worth doing later — but it is a perf change, not this
  // one, and today's page already mounts all of them anyway.)
  const isVisible = (key) => {
    if (hasRail) return true                      // desktop: the rail needs them all
    if (section === 'trends') return key === activeTrend
    if (section) return key === section            // phone, detail route: just this one
    return SUMMARY_KEYS.includes(key)              // phone, summary
  }
  // The one fact worth showing beside a destination's name. Grey and quiet —
  // it is context for the label, not a second heading. Returns null when there
  // is nothing true to say, so a row never shows a hopeful zero.
  // Returns { text, tone } — tone grades it the way the roster's status column
  // does, so "9d since a log" is red here for the same reason it is red there.
  // The attention facts come from railMeta, the SAME source the desktop rail
  // reads: a phone that computed its own would be a second opinion about one
  // client.
  const destMeta = (key) => {
    const w = weightHistory[weightHistory.length - 1]
    const rail = railMeta[key]
    if (rail?.meta) return { text: String(rail.meta), tone: rail.metaTone || null }
    switch (key) {
      case 'trends': return { text: w ? `${w.weight} ${w.unit || ''}`.trim() : 'No weight yet' }
      case 'nutritionLog': return { text: `${consistency.days7}/7 this week` }
      case 'targets': return { text: clientTargets.calories ? `${Number(clientTargets.calories).toLocaleString()} cal` : 'Not set' }
      // Not "Written" — a note that exists is always written, so the word
      // answered nothing. The DATE is the useful fact: it says which week's
      // thinking the note holds, which a recency ("2 months ago") makes the
      // reader work out.
      case 'privateNotes':
        if (!coachNotes?.trim()) return { text: 'None' }
        return notesUpdatedAt ? { text: numericDate(notesUpdatedAt) } : null
      case 'sentReports': return { text: sentTotal ? `${sentTotal}` : 'None' }
      case 'checkIn': return checkinCurrent ? null : { text: clientCheckIn ? 'None this period' : 'None yet' }
      default: return null
    }
  }

  // A saved collapse is a desktop convenience — it is how a coach tidies a long
  // page. On a phone the section IS the page, so honouring it would open a
  // screen with nothing on it but its own header.
  const isCollapsed = (key) => (hasRail ? sectionsCollapsed[key] : false)
  // ...and with it the toggle. Below the rail a section IS the page, so there
  // is nothing to collapse it into — the chevron was still drawn and still
  // took taps, writing a state `isCollapsed` had already stopped reading.
  const sectionToggle = (key) => (hasRail ? () => toggleSection(key) : undefined)

  const sectionStyle = (key, extra) =>
    (isVisible(key) ? { ...sectionCardStyle, ...extra } : { display: 'none' })

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
    if (k === 'sentReports') return sentTotal > 0
    return true
  })

  // The live saved order, and the subset of it this list shows. `trends` sits
  // where its first member sits, so moving the group moves the charts.
  const fullOrder = mergeOrder(cardOrder, presentReorderable)
  const destOrder = (() => {
    const out = []
    for (const k of fullOrder) {
      if (SUMMARY_KEYS.includes(k)) continue
      if (TREND_KEYS.includes(k)) { if (!out.includes('trends')) out.push('trends'); continue }
      out.push(k)
    }
    if (!out.includes('trends')) out.unshift('trends')
    return out
  })()

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

  const chartOptions = baseChartOptions()

  // The rotated y-axis title is GONE from these three. "Calories (kcal)" set
  // sideways down the left duplicated the card heading directly above it
  // ("Calories", with the span on its own picker) and spent a column of width restating it. The
  // ticks carry the unit; the heading carries the metric.
  //
  // Each is a single series plus its target line, so the legend box goes too —
  // one swatch restating the title. The target line still needs naming, so it
  // keeps a legend entry of its own where one is drawn.
  const metricChartOptions = baseChartOptions({ singleSeries: true })

  // Options for the three stacked daily metrics.
  //
  // `afterFit` pinning the y-axis width is the whole reason they can be
  // compared. Chart.js sizes that axis to its widest tick, so "11,084" steps
  // reserves more room than "38" cardio minutes — and the plots would start at
  // different x positions. Stacked charts whose time axes do not line up are
  // worse than separate ones: they LOOK aligned, so a reader trusts a
  // comparison the pixels do not support.
  //
  // Only the last plot draws its date labels. Three identical date axes is the
  // repeated chrome that made these cards tall in the first place, and the
  // shared window is stated once in the header.
  const stackedMetricOptions = (showDates) => ({
    ...metricChartOptions,
    maintainAspectRatio: false,
    plugins: { ...metricChartOptions.plugins, legend: { display: false } },
    scales: {
      ...metricChartOptions.scales,
      x: {
        ...metricChartOptions.scales?.x,
        ticks: { ...metricChartOptions.scales?.x?.ticks, display: showDates },
        grid: { display: false },
      },
      y: {
        ...metricChartOptions.scales?.y,
        afterFit: (axis) => { axis.width = 52 },
        ticks: { ...metricChartOptions.scales?.y?.ticks, maxTicksLimit: 4 },
      },
    },
  })

  // The three series this card holds. One list, so the render, the visibility
  // filter and the empty states cannot disagree about what "daily metrics"
  // means.
  const METRIC_SERIES = [
    {
      key: 'calorieChart', label: 'Calories', unit: 'cal',
      empty: 'No nutrition logged yet',
      history: () => bucketHistory(calorieHistory, 'calories', chartRange),
      data: (h) => calorieChartData(plainCharts.has('dailyMetrics'), h),
    },
    {
      key: 'cardioChart', label: 'Cardio', unit: 'min',
      empty: 'No cardio logged yet',
      history: () => bucketHistory(cardioHistory, 'minutes', chartRange),
      data: (h) => metricBarData({ history: h, valueKey: 'minutes', label: 'Minutes', target: parseInt(clientTargets.cardio_minutes) || null, fallback: (a) => `rgba(59, 130, 246, ${a})`, plain: plainCharts.has('dailyMetrics') }),
    },
    {
      key: 'stepsChart', label: 'Steps', unit: 'steps',
      empty: 'No steps logged yet',
      history: () => bucketHistory(stepsHistory, 'steps', chartRange),
      data: (h) => metricBarData({ history: h, valueKey: 'steps', label: 'Steps', target: parseInt(clientTargets.steps) || null, fallback: (a) => `rgba(167, 139, 250, ${a})`, plain: plainCharts.has('dailyMetrics') }),
    },
  ]

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
  // The newest few reports go in the thread — the same rule, and the same
  // count, the client's side already uses (Coach.jsx THREAD_REPORTS).
  //
  // Clipping these to the loaded message window was tried and was wrong: a
  // coach writes weekly but messages in bursts, so Maya's six months of
  // reports collapsed to the one that fell inside ten days of chat. The thread
  // is a recent-activity view, not a strict intersection of two paged lists;
  // the full set is one click away in the archive.
  const threadReports = sentReports.slice(0, THREAD_REPORTS)

  const unreadFromClient = messages.filter(m => !m.read_at && m.sender_id === clientId).length
  const railMeta = {
    messages: unreadFromClient > 0 ? { meta: unreadFromClient, metaTone: 'warning' } : null,
    // Unreviewed outranks overdue: an unread check-in is work sitting on the
    // coach's desk, and saying "Due" over it would bury it.
    checkIn: clientCheckIn && !clientCheckIn.reviewed_at
      ? { meta: 'New', metaTone: 'success' }
      : (!checkinCurrent ? { meta: 'Due', metaTone: 'warning' } : null),
    nutritionLog: daysSinceLog != null && daysSinceLog >= 3
      ? { meta: `${daysSinceLog}d`, metaTone: daysSinceLog >= 4 ? 'error' : 'warning' }
      : null,
    measurements: measStatus?.due ? { meta: 'Due', metaTone: 'warning' } : null,
    sentReports: sentUnread > 0 ? { meta: `${sentUnread} unread` } : null,
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

  // The weight chart in full, shown in a dialog rather than as a section.
  //
  // It is the same fact as Progress overview's top plot, so as a section it was
  // this page's own C6 violation: the richer drawing of the trend sat 650px
  // below the plainer one, collapsed by default, and opening it put the same
  // line on screen twice and the record at 7,520px. Behind a click it is not a
  // second surface — it is the first one at the depth a coach asks for, which
  // is the trade the sent-report archive on this page already makes.
  //
  // Nothing in here is new: the unit that follows the goal, the 7-day average
  // and its year-view caveat, the reached-goal marker and its caption all came
  // across verbatim. The inline plot keeps only the goal line, the one overlay
  // that still reads at 140px.
  const weightChartFull = () => (weightHistory.length > 1 ? (() => {
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
          // Convert FIRST, then bucket, so the year view averages weigh-ins
          // that are already in one unit — averaging kg and lb together
          // would produce a number that is neither.
          const converted = weightHistory.map(d => ({
            ...d,
            unit: displayUnit,
            weight: round1(convertWeight(d.weight, normUnit(d.unit || displayUnit), displayUnit)),
          }))
          const dispHistory = bucketHistory(converted, 'weight', chartRange)
          // Goal reference line + the first weigh-in that reached it, computed
          // in the same display unit (weightTarget.js converts the goal in).
          //
          // TWO reads of the same goal, and the split is the point. The LINE
          // and the marker belong to the window on screen, so they come off the
          // plotted points. How far there is left to go does NOT: that is a
          // fact about the client today, and reading it off the bucketed series
          // made it move when the range moved — the Y view averages each month,
          // so its last point is a month's mean rather than the latest weigh-in,
          // and one client read "2.5 kg to lose" on W and "3.2 kg to lose" on Y.
          // Both cannot be true, and the caption names no window, so neither was
          // defensible.
          const wt = computeWeightTarget({
            weightHistory: dispHistory,
            weightGoal: clientTargets.weight_goal,
            weightGoalUnit: clientTargets.weight_goal_unit,
          })
          const wtNow = computeWeightTarget({
            weightHistory: converted,
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
              // A ~10% wash, not a saturated block — and a 2px line, which
              // is the app's one line weight.
              backgroundColor: `rgba(52, 211, 153, ${MARK.areaAlpha})`,
              borderWidth: MARK.lineWidth,
              // Reached-goal marker: on-brand green (NOT gold — gold is the
              // product's warning color), a clean dot not a generic star; the
              // growth-motif leaf lives in the caption below. Theme-agnostic
              // pop on both cards: a deep-green fill (#15803d) carries contrast
              // on the light card, a white ring carries it on the dark card —
              // each does its job on the theme where the other washes out.
              pointRadius: dispHistory.map((_, i) => (isMark(i) ? 7 : 0)),
              pointHoverRadius: 5,
              pointStyle: 'circle',
              pointBackgroundColor: dispHistory.map((_, i) => (isMark(i) ? '#15803d' : '#34d399')),
              pointBorderColor: dispHistory.map((_, i) => (isMark(i) ? '#ffffff' : '#34d399')),
              pointBorderWidth: dispHistory.map((_, i) => (isMark(i) ? 2.5 : 1)),
              tension: 0.3,
              fill: true,
            },
          ]
          // The 7-day average is dropped on the YEAR view. Those points are
          // already monthly means, so a 7-point rolling mean over them
          // smooths seven MONTHS and draws a near-flat line labelled
          // "7-day avg" — a chart saying something untrue about its own
          // window.
          if (chartRange !== 'Y') datasets.push({
            label: '7-day avg',
            data: computeRollingAverage(dispHistory),
            borderColor: 'rgba(52, 211, 153, 0.45)',
            backgroundColor: 'transparent',
            borderWidth: MARK.lineWidth,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          })
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
              {wtNow && (
                <p style={{ fontSize: 'var(--text-sm)', margin: 'var(--space-10) var(--space-2) 0', color: 'var(--color-muted)' }}>
                  {wtNow.reached ? (
                    <>
                      <span style={{ color: 'var(--color-primary)', fontWeight: 'var(--weight-semibold)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 'var(--space-4)' }}>
                          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                        </svg>
                        Reached goal
                      </span>
                      {wtNow.direction === 'maintain'
                        ? <>. Holding at {wtNow.goal} {wtNow.displayUnit}</>
                        : <>. First hit {wtNow.goal} {wtNow.displayUnit} on {new Date(wtNow.reachedIso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>}
                    </>
                  ) : (
                    <><strong style={{ color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>{wtNow.remainingAbs} {wtNow.displayUnit}</strong> {wtNow.direction === 'up' ? 'to gain' : 'to lose'} to reach the {wtNow.goal} {wtNow.displayUnit} goal</>
                  )}
                </p>
              )}
            </>
          )
        })() : chartEmpty('No weight logged yet', 'Your client logs this.'))

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
      {/* The header, composed once and laid out twice.
          On a phone it was four stacked fragments with no grouping: a name over
          an email over a red status over a second red word over a muted
          sentence over a button, with Nudge floating off on its own. The parts
          are the same; what changes is that the two ACTIONS end up together in
          one row instead of marooned in separate containers, and the lock
          reads as one sentence rather than a label and an explanation that
          look like two different things. */}
      {(() => {
        const status = statusStats ? attentionLevel({ ...statusStats, lockInfo }) : null
        const reasons = status ? status.reasons.filter(r => r !== 'Locked') : []
        const showStatus = status && !(status.level !== 'green' && reasons.length === 0)
        const tone = status && (status.level === 'red' ? 'var(--color-error)' : status.level === 'yellow' ? 'var(--color-warning)' : 'var(--color-success)')
        const nudge = nudgeReason({ daysSinceLog, hasCheckIn: checkinCurrent, checkinDue: checkinPeriod(checkinInterval).dueWindow })
        const nudgeLabel = nudge && (nudge.key === 'checkin' ? 'Nudge to check in' : 'Nudge to log')

        /* C1: status is plain coloured text — no container, no border, no dot.
           Green keeps --color-success rather than going muted: green and grey
           must never collide (B1), or a healthy client reads identically to an
           unconfigured one. */
        const statusText = showStatus && (
          <span className="cv-head-status" style={{
            fontWeight: status.level === 'green' ? 'var(--weight-normal)' : 'var(--weight-semibold)',
            color: tone,
          }}>
            {status.level === 'green' ? 'On track' : reasons.join(' · ')}
          </span>
        )

        /* One sentence, not a label beside an explanation. The two were
           separate spans with a gap, so they wrapped apart on a narrow screen
           and read as unrelated facts. */
        const lockText = lockInfo.locked && (
          <p className="cv-head-lock">
            <b>Locked</b> No nutrition logged for {lockInfo.days} days
          </p>
        )

        const nudgeButton = nudge && (
          /* D2/D3: this is the roster's Nudge, so it is the roster's control —
             <Button variant="action">, not a second implementation of it.
             Rank 2 (acts on a client), never rank 1. */
          <Button
            onClick={() => nudgeClient(nudge)}
            variant="action"
            size="sm"
            loading={nudging}
            disabled={nudging}
            ariaLabel={nudge.key === 'checkin' ? 'Email this client a reminder to do their check-in' : 'Email this client a prompt to get back to logging'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {nudging ? 'Nudging…' : nudgeLabel}
          </Button>
        )
        const unlockButton = lockInfo.locked && (
          <Button onClick={unlockClient} variant="danger" size="sm">Unlock</Button>
        )

        if (!hasRail) {
          return (
            <div className="cv-head-m">
              <div className="cv-head-m-id">
                <Avatar url={clientProfile?.avatar_url} name={clientProfile?.full_name || ''} size={44} />
                <div className="cv-head-m-name">
                  <h1>{clientProfile?.full_name || 'Client'}</h1>
                  {statusText}
                </div>
              </div>
              {lockText}
              {(nudgeButton || unlockButton) && (
                <div className="cv-head-m-actions">{nudgeButton}{unlockButton}</div>
              )}
            </div>
          )
        }

        return (
          <div className="cv-titlerow">
            <div style={{ flex: 1, minWidth: '180px', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-16)', flexWrap: 'wrap' }}>
              <Avatar url={clientProfile?.avatar_url} name={clientProfile?.full_name || ''} size={52} style={{ marginTop: 'var(--space-4)' }} />
              <div style={{ flex: 1, minWidth: '180px' }}>
                <h1>{clientProfile?.full_name || 'Client'}</h1>
                <p style={{ fontSize: 'var(--text-base)', marginTop: 'var(--space-2)' }}>{clientProfile?.email}</p>
                {statusText && <div style={{ marginTop: 'var(--space-10)' }}>{statusText}</div>}
                {lockInfo.locked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap', marginTop: 'var(--space-10)' }}>
                    {lockText}
                    {unlockButton}
                  </div>
                )}
              </div>
              {nudgeButton}
            </div>
          </div>
        )
      })()}

      {/* AI Tools. Uses SectionHeader like the other thirteen sections — it was
          the one section with a hand-rolled header, so it alone had a bare <h2>
          at the wrong size and no collapse animation. */}
      {!hasRail && section && (
        /* C5: a back link names its destination. The destination here is this
           client's summary, so it says whose. */
        <Link
          to={`/client/${clientId}`}
          className="ds-disclosure ds-control"
          style={{ width: 'auto', textDecoration: 'none' }}
        >
          <Icon name="left" size={14} />
          <span>{clientProfile?.full_name?.split(' ')[0] || 'Back'}</span>
        </Link>
      )}

      {!hasRail && section === 'trends' && (
        /* The switcher. ui/Pill, the same filter chip as the roster's lenses
           and the energy-balance window — a chip that picks what you are
           looking at is the app's chip, not a new control. Scrolls rather than
           wraps, like the roster's, so six of them hold one line. */
        <div className="rost-chips cv-trend-chips" role="group" aria-label="Metric">
          {TREND_KEYS.map(k => (
            <Pill
              key={k}
              active={k === activeTrend}
              aria-pressed={k === activeTrend}
              onClick={() => {
                const sp = new URLSearchParams(searchParams)
                if (k === DEFAULT_TREND) sp.delete('m'); else sp.set('m', k)
                setSearchParams(sp, { replace: true })
              }}
            >
              {TREND_LABELS[k]}
            </Pill>
          ))}
        </div>
      )}

      <div id="section-groundwork" style={sectionStyle('groundwork')}>
        <SectionHeader
          title="Groundwork"
          collapsed={hasRail && aiToolsCollapsed}
          onToggle={hasRail ? () => setAiToolsCollapsed(!aiToolsCollapsed) : undefined}
        >
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
                {/* The subject the client will see in their archive. Editable,
                    because the model drafts it and the coach is the one who
                    signs it — and because a list of 25 reports is only as
                    scannable as its worst title. */}
                <Field
                  label="Subject"
                  value={reportSubject}
                  onChange={(e) => setReportSubject(e.target.value)}
                  maxLength={120}
                  placeholder="What happened this week, in a few words"
                />
                <Textarea
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  rows={20}
                  aria-label="Weekly report draft"
                  style={{ lineHeight: '1.7', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
                  <Button onClick={sendReport} variant="primary" size="sm">Send to client</Button>
                  <Button onClick={() => { setReport(''); setReportSubject('') }} variant="ghost" size="sm">Discard</Button>
                </div>
              </div>
            )}
          </div>
        </SectionHeader>
      </div>

      <div style={{ display: isVisible('stats') ? 'flex' : 'none', alignItems: 'center', gap: 'var(--space-12)' }}>
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

      <div id="section-stats" style={sectionStyle('stats')}>
        <SectionHeader title={statsTitle} collapsed={isCollapsed('stats')} onToggle={sectionToggle('stats')}>
          {/* Two groups, because these are two kinds of fact — and seven cells
              in a two-column grid could only ever leave one of them stranded
              beside an empty cell.

              Calories, protein, carbs and fat are THE DAY'S INTAKE: four parts
              of one number, and a 2x2 is the shape that says so. Cardio, steps
              and weight are three unrelated single readings; they are a strip,
              which is what this system uses for several facts about one
              subject. Neither group has a hole in it. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
            {/* auto-fit, not a fixed count. At 1,116px (the desktop content
                column) four 160px tracks fit, so the macros sit on ONE row of
                ~270px cells instead of a 2x2 of 525px cells each holding a
                three-line label and 400px of nothing. On a phone the same rule
                yields two tracks, which is the 2x2 F2 asked for — the shape
                was right there and wrong on a desktop, so it is a breakpoint
                rather than a layout. */}
            <div className="cv-stats-macros" style={{ display: 'grid', gap: 'var(--space-16)' }}>
              <StatCard label="Calories" value={num(totals.calories)} sub={dayTarget(totals.calories, clientTargets.calories, ' cal')} color="var(--color-calories)" />
              <StatCard label="Protein" value={`${num(totals.protein)}g`} sub={dayTarget(totals.protein, clientTargets.protein, 'g')} color="var(--color-protein)" />
              <StatCard label="Carbs" value={`${num(totals.carbs)}g`} sub={dayTarget(totals.carbs, clientTargets.carbs, 'g')} color="var(--color-carbs)" />
              <StatCard label="Fat" value={`${num(totals.fat)}g`} sub={dayTarget(totals.fat, clientTargets.fat, 'g')} color="var(--color-fat)" />
            </div>
            {/* Cardio and Steps were never on this panel, though the coach sets a
                target for both and the page carries a chart for each — so the
                client's own Dashboard showed seven metrics for a day while the
                coach's view of the same day showed five. */}
            <div className="cv-stats-activity" style={{ display: 'grid', gap: 'var(--space-16)' }}>
              <StatCard label="Cardio" value={dayCardio ? `${dayCardio} min` : '—'} sub={dayTarget(dayCardio, clientTargets.cardio_minutes, ' min')} color="var(--color-cardio)" />
              <StatCard label="Steps" value={daySteps ? num(daySteps) : '—'} sub={dayTarget(daySteps, clientTargets.steps)} color="var(--color-steps)" />
              <StatCard label="Weight" value={weightEntry ? `${weightEntry.weight} ${weightEntry.unit}` : '—'} sub={weightEntry?.weighed_at ? formatTime(weightEntry.weighed_at) : null} color="var(--color-weight)" />
            </div>
          </div>
        </SectionHeader>
      </div>

      {/* Drag is a desktop affordance, and switching it off below the rail does
          two things at once. A long-press drag fights the page scroll on a
          phone — and SortableCard renders its grip OUTSIDE the section div, so
          with the sections hidden by style the grips survived them: a column of
          stray ⠿ handles floating between the summary's panels, each one the
          ghost of a section that is not there. */}
      <Reorderable order={cardOrder} defaultOrder={REORDERABLE_KEYS} onReorder={saveCardOrder} enabled={canReorder && hasRail}>

      <div key="consistency" id="section-consistency" style={sectionStyle('consistency')}>
        {/* E1: the rail said "Consistency" and the heading said "Logging
            consistency", and neither named what is actually in here — streaks,
            a 13-week calories-against-target heatmap, and a weekday/weekend
            breakdown of where the plan is slipping. That is adherence. The
            heading and the rail now say the same word, which is the rule. */}
        <SectionHeader title="Adherence" collapsed={isCollapsed('consistency')} onToggle={sectionToggle('consistency')}>
          {/* SIX CELLS, ONE SHAPE, AND A GRID THAT DIVIDES.
              These were three rows — three streak figures, two weekday splits,
              then Best week alone across the full width as a label-left /
              value-right bar. Three different cell shapes and a 3/2/1 stack,
              so the block read as three unrelated things rather than six facts
              about one client's logging.
              Six divides by two and by three, so neither breakpoint leaves a
              ragged last row. Best week normalises into the same shape by
              reading its date range as the SUB and its count as the value —
              which is also the better reading: the fact is "6 of 7", and the
              week it happened in qualifies it.
              The sub line is reserved on every cell, so the three without one
              still share a height with the three that have one. */}
          <div className="cv-consist-3" style={{ display: 'grid', gridTemplateColumns: `repeat(${compact ? 2 : 3}, minmax(0, 1fr))`, gap: 'var(--space-12)' }}>
            {[
              {
                key: 'streak',
                label: compact ? 'Streak' : 'Current streak',
                tip: CONSISTENCY_TIPS.streak,
                value: consistency.streak,
                unit: ' days',
                color: consistency.streak > 0 ? 'var(--color-success)' : 'var(--color-muted)',
              },
              {
                key: 'last7',
                label: compact ? '7 days' : 'Last 7 days',
                tip: CONSISTENCY_TIPS.last7,
                value: consistency.days7,
                unit: '/7',
                color: consistency.days7 >= 5 ? 'var(--color-success)' : consistency.days7 >= 3 ? 'var(--color-primary)' : 'var(--color-error)',
              },
              {
                key: 'last30',
                label: compact ? '30 days' : 'Last 30 days',
                tip: CONSISTENCY_TIPS.last30,
                value: consistency.days30,
                unit: '/30',
                color: consistency.days30 >= 20 ? 'var(--color-success)' : consistency.days30 >= 10 ? 'var(--color-primary)' : 'var(--color-error)',
              },
              {
                key: 'weekdays',
                label: compact ? 'Weekdays' : 'Weekdays (Mon-Fri)',
                tip: CONSISTENCY_TIPS.weekdays,
                value: consistency.weekdayLogged,
                unit: `/${consistency.weekdayTotal}`,
                sub: `${consistency.weekdayTotal > 0 ? Math.round((consistency.weekdayLogged / consistency.weekdayTotal) * 100) : 0}%`,
                color: consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.8 ? 'var(--color-success)' : consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)',
              },
              {
                key: 'weekends',
                label: compact ? 'Weekends' : 'Weekends (Sat-Sun)',
                tip: CONSISTENCY_TIPS.weekends,
                value: consistency.weekendLogged,
                unit: `/${consistency.weekendTotal}`,
                sub: `${consistency.weekendTotal > 0 ? Math.round((consistency.weekendLogged / consistency.weekendTotal) * 100) : 0}%`,
                color: consistency.weekendLogged / (consistency.weekendTotal || 1) >= 0.8 ? 'var(--color-success)' : consistency.weekendLogged / (consistency.weekendTotal || 1) >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)',
              },
              ...(consistency.bestWeekStart ? [{
                key: 'bestWeek',
                label: compact ? 'Best week' : 'Best week (last 90 days)',
                tip: CONSISTENCY_TIPS.bestWeek,
                value: consistency.bestWeekCount,
                unit: '/7',
                sub: `${consistency.bestWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${consistency.bestWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                color: consistency.bestWeekCount === 7 ? 'var(--color-success)' : consistency.bestWeekCount >= 5 ? 'var(--color-warning)' : 'var(--color-muted)',
              }] : []),
            ].map(c => (
              <div key={c.key} style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)', textAlign: 'center', minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>
                  <InfoTip text={c.tip}>{c.label}</InfoTip>
                </p>
                <p className="tnum" style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title)', color: c.color, margin: 0, lineHeight: 1.1 }}>
                  {c.value}
                  <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>{c.unit}</span>
                </p>
                {/* Reserved whether or not this cell has one — a non-breaking
                    space, not an empty string and not a min-height: both of
                    those leave the empty cells a pixel short of the filled
                    ones, because an empty line box is not the same height as
                    one with a glyph in it. */}
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', marginTop: 'var(--space-2)' }}>
                  {c.sub || '\u00a0'}
                </p>
              </div>
            ))}
          </div>
          <div style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 'var(--space-16)',
            marginTop: 'var(--space-16)',
          }}>
            {/* The label names the span and the control sets it, so the
                heading can never disagree with the picture under it — which is
                what "last 90 days" printed over a fetch of 97 and a grid of 13
                weeks was quietly doing. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-12)', flexWrap: 'wrap', marginBottom: 'var(--space-16)' }}>
              <p style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 'var(--weight-semibold)',
                margin: 0,
              }}>
                Calorie compliance <span style={{ color: 'var(--color-faint)' }}>· {ADHERENCE_NAME}</span>
              </p>
              {/* ui/Pill, same as the energy-balance window and the roster's
                  lenses — a chip that picks what you are looking at. */}
              <span role="group" aria-label="Read adherence by" style={{ display: 'inline-flex', gap: 'var(--space-4)' }}>
                {GRAINS.map(g => (
                  <Pill
                    key={g.key}
                    active={g.key === grain}
                    aria-pressed={g.key === grain}
                    onClick={() => changeGrain(g.key)}
                  >
                    {g.label}
                  </Pill>
                ))}
              </span>
            </div>
            {/* ONE shape, every window. The grid always fills the card and
                the cell size follows the window, so toggling changes the
                density and nothing else — no second layout, no fallback, and
                no jump between widths as you move across the three.
                See complianceWindow.js for why none of them is short. */}
            {/* ONE custom property, and the stylesheet derives the grid's cap
                from it — an inline `--heat-cap` would beat the media query that
                has to switch it off when the layout stacks, since inline wins
                over a rule for custom properties too. */}
            <div className="cv-adherence-cq">
            <div className="cv-adherence-row" style={{ '--adherence-grid': `${heatmapCap(ADHERENCE_WEEKS)}px` }}>
              <ComplianceHeatmap
                logsByDate={heatmapData}
                calorieTarget={clientTargets.calories}
                weeks={ADHERENCE_WEEKS}
                grain={grain}
              />
            {/* The two reads sit under the grid in equal columns. The summary
                alone took 650px for five numbers while the breakdown ran the
                full width beneath it, which left the row a 600x400 hole at the
                bottom right; the diverging bars also read better at half width
                than stretched across 1,066px as two empty rules with a dot in
                the middle. */}
              <div className="cv-adherence-reads">
              <ComplianceSummary
                logsByDate={heatmapData}
                calorieTarget={clientTargets.calories}
                variant="coach"
                windowDays={ADHERENCE_DAYS}
              />
              <ComplianceBreakdown
                logsByDate={heatmapData}
                calorieTarget={clientTargets.calories}
                windowDays={ADHERENCE_DAYS}
                windowName={ADHERENCE_NAME}
                // On a phone targets is a route; on a desktop it is a scroll
                // target on the same page, so the link resolves to the same
                // param either way (see the /client/:id/:section route).
                targetHref={`/client/${clientId}/targets`}
              />
              </div>
            </div>
            </div>
          </div>
        </SectionHeader>
      </div>

      {sentTotal > 0 && (
        <div key="sentReports" id="section-sentReports" style={sectionStyle('sentReports')}>
          <SectionHeader title="Sent reports" collapsed={isCollapsed('sentReports')} onToggle={sectionToggle('sentReports')}>
            {/* The list is RIGHT HERE, not behind a button. It was briefly put
                behind one, on the theory that a second list of the same reports
                made the page long — but the length was the unbounded fetch, and
                that is fixed. All the button bought was a fourth tap between a
                coach and a report, on a surface the client's side does not
                gate at all: their archive rail is simply visible beside the
                thread. The thread carries the recent few in context; this is
                the collection, open.

                The same ROW the client chooses from (.rep-row in index.css), so
                the two sides of one relationship present these the same way. It
                expands in place rather than navigating: opening the client's
                reader marks the report read, and read_at is the client's state
                — the very thing this list reports back to the coach. */}
            <div style={{ marginTop: 'var(--space-4)' }}>
              {sentReports.map(r => {
                const open = openSentReport === r.id
                return (
                  <div key={r.id}>
                    <button
                      type="button"
                      className="rep-row rep-row-nosender ds-control"
                      aria-expanded={open}
                      onClick={() => setOpenSentReport(open ? null : r.id)}
                    >
                      <span className="rep-row-body">
                        <span className="rep-row-head">
                          <span className="rep-row-when">{relativeTime(r.created_at)}</span>
                          {/* C1 status text. Read is graded green — the report
                              landed, which is the outcome the coach is checking
                              for. Unread is ungraded (B1: nothing to grade yet). */}
                          <span style={{
                            fontSize: 'var(--text-xs)',
                            color: r.read_at ? 'var(--color-success)' : 'var(--color-muted)',
                          }}>
                            {r.read_at ? 'Read' : 'Unread'}
                          </span>
                        </span>
                        {!open && <span className="rep-row-lead">{leadOf(r.content)}</span>}
                      </span>
                      <span className="ds-chev" style={{ color: 'var(--color-faint)', display: 'inline-flex' }}>
                        <Icon name="right" size={16} />
                      </span>
                    </button>
                    {open && (
                      <div style={{ padding: '0 0 var(--space-16)', maxWidth: '68ch' }}>
                        <ReportProse content={r.content} />
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Names the whole collection, not the remainder. "Show older
                  (20 more)" invited a coach to keep extending this list until
                  the record was long again; this hands them a surface built
                  for the job instead. */}
              {sentTotal > sentReports.length && (
                <Button variant="muted" size="sm" onClick={openArchive} style={{ marginTop: 'var(--space-8)' }}>
                  View all {sentTotal} reports <Icon name="right" size={14} />
                </Button>
              )}
            </div>
          </SectionHeader>
        </div>
      )}

      <div key="targets" id="section-targets" style={sectionStyle('targets', { gap: 'var(--space-16)' })}>
        <SectionHeader title="Client targets" collapsed={isCollapsed('targets')} onToggle={sectionToggle('targets')}>
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
          <div style={{ marginTop: 'var(--space-12)' }}>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', color: 'var(--color-muted)' }}>Primary goal</p>
            <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
              {GOALS.map((g) => {
                const active = clientGoal === g.key
                return (
                  <Pill
                    key={g.key}
                    active={active}
                    aria-pressed={active}
                    onClick={() => setClientGoal(active ? '' : g.key)}
                  >
                    {g.label}
                  </Pill>
                )
              })}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-faint)', margin: 'var(--space-6) 0 0' }}>
              Your client sees this but cannot change it.
            </p>
          </div>
          <div style={{ marginTop: 'var(--space-8)' }}>
            <Button onClick={saveClientTargets} variant="primary" size="sm">
              {targetsSaved ? <>Saved <Icon name="check" /></> : 'Save targets'}
            </Button>
          </div>
        </SectionHeader>
      </div>

      <div key="nutritionLog" id="section-nutritionLog" style={sectionStyle('nutritionLog')}>
        <SectionHeader title="Nutrition log" collapsed={isCollapsed('nutritionLog')} onToggle={sectionToggle('nutritionLog')}>
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

      <div key="checkIn" id="section-checkIn" style={sectionStyle('checkIn')}>
        {/* The same badge the rail carries for this section — "Due" when none
            has been submitted this period, "New" when one is waiting to be
            reviewed. It was desktop-only, so a coach on a phone had to open
            the section to learn whether there was anything in it.

            "Due" is a STATUS the coach must act on, so it takes the solid fill
            Badge's own docs name for SectionHeader. "New" is an item waiting
            rather than a demand, so it stays tinted. */}
        <SectionHeader
          // "Latest" when the newest check-in predates the current period —
          // the card shows it either way, and saying "this week's" over a
          // three-week-old answer is the lie the key-matching used to tell.
          title={checkinCurrent
            ? (checkinInterval > 1 ? "This period's check-in" : "This week's check-in")
            : 'Latest check-in'}
          info="These questions are shared by every client. Editing them changes all check-ins."
          collapsed={isCollapsed('checkIn')}
          onToggle={sectionToggle('checkIn')}
          badge={railMeta.checkIn?.meta}
          badgeTone={railMeta.checkIn?.metaTone === 'success' ? 'soft' : 'solid'}
          badgeColor={railMeta.checkIn?.metaTone === 'success' ? 'var(--color-success)' : 'var(--color-warning)'}
        >
          {/* A flex column purely so the two halves can swap order on a phone:
              the cadence chips and the questionnaire link are CONFIGURATION, and
              they were sitting above the thing they configure. On a narrow screen
              four wrapped chips took more of the box than the check-in did. */}
          <div className="cv-checkin">
          {/* Check-in config: this client's cadence + a pointer to the shared
              questionnaire (which is per-coach, so it lives on Profile). */}
          {/* Grouped, not spread. `justify-content: space-between` threw the button
              to the far edge of a 1,000px card, so a control and the action that
              configures it sat 700px apart with nothing between them — related
              by nothing except being on the same line. A3: 12px inside a group. */}
          <div className="cv-checkin-config" style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-12)', flexWrap: 'wrap', paddingBottom: 'var(--space-12)', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border)' }}>
            {/* A SELECT, not four chips. The capsule means "a control you press
                repeatedly" — the chart range chips, which a coach flips while
                reading. A check-in cadence is set once per client and then left
                alone, so by that same shape rule it is a VALUE, and a value
                belongs in a field. Four chips also wrapped on a phone and took
                more of this card than the check-in they configure, which the
                layout comment above was already working around by reordering. */}
            {/* A VISIBLE label, via Field's own `label` prop so the text and
                the control are one <label> and the association is real. The
                select shipped with only an aria-label, which left a sighted
                coach a box reading "Weekly" and nothing saying weekly WHAT —
                the four chips at least implied their own subject. It also
                carries the accessible name now, so there is no second name in
                an aria-label for a voice user to have to guess at.

                Sized to Button `sm`, which is what sits beside it: controlStyle
                is 10px/--text-base and rendered 39px against the 30px of
                "Customize questions", and two controls on one row disagreeing
                by 9px is the kind of thing that reads as sloppy without being
                obviously wrong. */}
            {/* `compact` labels, the same trick the consistency cells use
                ("Streak" for "Current streak"). At 390px this row has 308px
                and the full strings need 342 — the select alone is 157,
                because a <select> sizes to its widest OPTION ("Every 4 weeks"),
                and the button is 177. Shortening both puts them side by side
                down to 360px; the section is already titled "This week's
                check-in", so neither word is doing work the heading has not
                already done. */}
            <Select
              label={compact ? 'Frequency' : 'Check-in frequency'}
              value={pendingInterval ?? checkinInterval}
              disabled={savingCadence}
              onChange={(e) => {
                const next = Number(e.target.value)
                setPendingInterval(next === checkinInterval ? null : next)
              }}
              style={{ width: 'auto', cursor: 'pointer', padding: '6px 12px', fontSize: 'var(--text-sm)', minHeight: '30px' }}
            >
              {CADENCE_OPTIONS.map(opt => (
                <option key={opt.weeks} value={opt.weeks}>{opt.label}</option>
              ))}
            </Select>
            {/* The "applies to every client" caveat lives on this section's
                TITLE (the SectionHeader `info` above). It used to be a bare
                mark parked beside this button, which is the one shape F12 is
                against — a glyph plus its margin, on a row a phone already
                wraps. It could not become this button's own trigger either:
                InfoTip's wrapper carries tabIndex and role="note", and nesting
                a real button inside that gives a keyboard user two stops for
                one control and announces the button as a note.

                Rebase note: the incoming patch closed a <div> here, because it
                was written when this row held four cadence chips. Main has
                since made that a <Select>, so the tag is the one the current
                structure needs, not the one the patch carried. */}
            <Button
              onClick={() => navigate('/profile?focus=questionnaire')}
              variant="ghost"
              size="sm"
            >
              {compact ? 'Questions' : 'Customize questions'} <Icon name="right" />
            </Button>
          </div>

          {/* Staged, not applied. The copy names all three consequences,
              because all three are invisible otherwise: the schedule moves,
              the client is told, and the check-in this card shows follows the
              new period — which is why the ratings appear to change when the
              cadence does. */}
          {pendingInterval != null && (
            <div style={{ marginBottom: 'var(--space-12)' }}>
              <Notice
                tone="warning"
                icon={<><circle cx="12" cy="12" r="10" /><path d="M12 8v4l2.5 2.5" /></>}
                action={(
                  <span style={{ display: 'inline-flex', gap: 'var(--space-8)', flexShrink: 0 }}>
                    <Button onClick={() => updateCadence(pendingInterval)} variant="primary" size="sm" disabled={savingCadence}>
                      {savingCadence ? 'Saving…' : 'Update'}
                    </Button>
                    <Button onClick={() => setPendingInterval(null)} variant="ghost" size="sm" disabled={savingCadence}>
                      Cancel
                    </Button>
                  </span>
                )}
              >
                Check-ins move from <strong>{cadenceLabel(checkinInterval)}</strong> to{' '}
                <strong>{cadenceLabel(pendingInterval)}</strong>. {clientFirstName} will be told,
                and the check-in shown here follows the new period.
              </Notice>
            </div>
          )}
          {!clientCheckIn ? (
            <div style={{ paddingTop: 'var(--space-8)' }}>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>No check-in submitted yet.</p>
            </div>
          ) : (
            <>
              {/* ALWAYS name the week it covers. The heading says how recent it
                  is; this says exactly which one, so a coach is never reading
                  ratings without knowing what they are ratings OF. */}
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '0 0 var(--space-10)' }}>
                Week of {parseLocalDateString(clientCheckIn.week_of).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {!checkinCurrent && <> · <span style={{ color: 'var(--color-warning)' }}>none since</span></>}
              </p>
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
          </div>
        </SectionHeader>
      </div>

      <div key="privateNotes" id="section-privateNotes" style={sectionStyle('privateNotes')}>
        <SectionHeader title="Private notes" collapsed={isCollapsed('privateNotes')} onToggle={sectionToggle('privateNotes')}>
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
        <div key="correlatedChart" id="section-correlatedChart" style={sectionStyle('correlatedChart')}>
          <SectionHeader title="Progress overview" collapsed={isCollapsed('correlatedChart')} onToggle={sectionToggle('correlatedChart')} animated={false}>
            {!isCollapsed('correlatedChart') && (
              (weightHistory.length > 0 || calorieHistory.length > 0) ? (
                <div style={{ paddingTop: 'var(--space-8)' }}>
                  {/* Two stacked plots sharing one x range — see
                      getCorrelatedChartData for why this is not one chart. */}
                  {weightHistory.length > 0 && !hiddenCharts.includes('weightChart') && (
                    <div>
                      {/* The expand sits ON the plot's own label rather than in
                          the section header, because the header belongs to the
                          whole card and this opens one of its two plots. It is
                          a persistent control, not a hover reveal: a reveal is
                          invisible on a touch screen, and this is the only way
                          to the full chart now. */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-8)', margin: '0 0 var(--space-4)' }}>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 0 }}>
                          Weight <span style={{ color: 'var(--color-faint)' }}>({weightDisplayUnit})</span>
                        </p>
                        {weightHistory.length > 1 && (
                          <Button variant="muted" size="sm" onClick={() => setExpandedChart('weight')} ariaLabel="Expand weight chart">
                            <Icon name="expand" size={13} />
                          </Button>
                        )}
                      </div>
                      <div style={{ height: '140px' }}>
                        <Line data={getCorrelatedChartData('weight')} options={{ ...weightPlotOptions, maintainAspectRatio: false }} />
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 'var(--space-16)' }}>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '0 0 var(--space-4)' }}>
                      Against target <span style={{ color: 'var(--color-faint)' }}>(%)</span>
                    </p>
                    <div style={{ height: '180px' }}>
                      <Chart type="bar" data={getCorrelatedChartData('compliance')} options={{ ...compliancePlotOptions, maintainAspectRatio: false }} />
                    </div>
                  </div>
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


      {/* ONE card for the three daily metrics, stacked and sharing an x range.
          They were three cards of 617px each — 1,851px, more than two screens,
          to answer one question — and the answer to that question is a
          COMPARISON: did calories drop the same week the steps did? Three
          separate cards make that comparison impossible, because you cannot
          hold two charts in your eye when one is two screens below the other.

          Stacked rather than side by side, which is the distinction this file
          already draws: the measurements small-multiples sit in a GRID because
          they are six sites in one unit being compared to each other, while
          Progress overview stacks its two plots because they are different
          units being correlated over TIME. Aligned x-axes let the reader drop
          a line through a date. Side by side, they would have to find that
          date three times.

          The per-chart visibility toggles (Profile -> Charts) still work, and
          now choose which SERIES appear in here rather than which cards exist.
          The four identical range pickers that all set one shared value are
          down to one. */}
      {METRIC_SERIES.some(m => !hiddenCharts.includes(m.key)) && (
        <div key="dailyMetrics" id="section-dailyMetrics" style={sectionStyle('dailyMetrics')}>
          <SectionHeader
            title="Daily metrics"
            action={chartControls('dailyMetrics')}
            collapsed={isCollapsed('dailyMetrics')}
            onToggle={sectionToggle('dailyMetrics')}
            animated={false}
          >
            {!isCollapsed('dailyMetrics') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
                {(() => {
                  const shown = METRIC_SERIES.filter(m => !hiddenCharts.includes(m.key))
                  return shown.map((m, i) => {
                  const history = m.history()
                  const isLast = i === shown.length - 1
                  return (
                    <div key={m.key}>
                      {/* Same label treatment as Progress overview's plots:
                          the metric, then its unit in the faint tone. */}
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: '0 0 var(--space-4)' }}>
                        {m.label} <span style={{ color: 'var(--color-faint)' }}>({m.unit})</span>
                      </p>
                      {history.length > 0 ? (
                        <div style={{ height: '150px' }}>
                          <Bar data={m.data(history)} options={stackedMetricOptions(isLast)} />
                        </div>
                      ) : chartEmpty(m.empty, 'Your client logs this.')}
                    </div>
                  )
                  })
                })()}
              </div>
            )}
          </SectionHeader>
        </div>
      )}

      {!hiddenCharts.includes('measurements') && (
        <div key="measurements" id="section-measurements" style={sectionStyle('measurements')}>
          <SectionHeader
            title="Body measurements"
            collapsed={isCollapsed('measurements')}
            onToggle={sectionToggle('measurements')}
            info="Flags when tape data is overdue: every 2 weeks while cutting, every 4 weeks otherwise. Request asks for it off-schedule."
            /* The cadence keeps the routine; this button is the exception to
               it. measurementCadence.js will not go tighter than 14 days on
               purpose (tape error is ~1-1.5cm, so asking more often is noise),
               which left a coach who needs numbers BEFORE a call, or right
               after a phase change, with no way to ask at all. Always
               available, cadence or no cadence — the 48-hour cooldown in
               nudge-client is what stops it becoming nagging. */
            action={(
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                {measStatus?.due && (
                  /* C1: status is plain coloured text. This was the last tinted
                     pill with a dot in the app — the decision that introduced it
                     (Jul 19, measurement cadence) predates the ban. */
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-warning)' }}>
                    Re-measure due · {measStatus.daysSince}d
                  </span>
                )}
                <Button
                  onClick={() => nudgeClient({ key: 'measurements' })}
                  variant="muted"
                  size="sm"
                  disabled={nudging}
                >
                  {nudging ? 'Sending…' : 'Request'}
                </Button>
              </span>
            )}
          >
            {!isCollapsed('measurements') && (measHistory.length === 0
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
                                  options={miniChartOptions}
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

      {!hasRail && !section && (
        /* Everything the summary does not carry, in the coach's own saved
           order so the phone and the desktop rail never disagree about what
           comes first. Derived from the registry minus SUMMARY_KEYS, so a new
           section cannot be stranded here by being forgotten. */
        <>
          {/* Each row carries a FACT, not just a name. A row that says only
              "Reports" teaches nothing until it is tapped — the summary is
              supposed to answer, with detail one tap away for when it does
              not. The values are already on the page; this only shows them. */}
          {/* Shown in the coach's saved desktop order, but NOT reorderable here.
              Dragging earns its keep on the desktop record — fourteen sections
              down a page thousands of pixels long, where moving one saves real
              scrolling. This list is five rows on one screen: nothing is far
              away, so there is nothing to fix by moving it, and the mode,
              handles and touch-sensor work it needed were all cost against no
              benefit. If order ever matters here the answer is the roster's —
              rank by what needs attention — not a thing to configure. */}
          <nav className="cv-dest" aria-label="Sections">

              {destOrder.map(k => (
                <Link key={k} to={`/client/${clientId}/${k}`} className="cv-dest-row ds-control">
                  {/* The rail's own glyph for the same key, so a section reads
                      the same whichever map you are using. `trends` has no
                      section of its own, so it borrows the `charts` mark the
                      rail already uses for that group. */}
                  <svg
                    className="cv-dest-icon" width="17" height="17" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  >
                    {SECTION_ICONS[k === 'trends' ? 'charts' : k] || null}
                  </svg>
                  <span className="cv-dest-label">{k === 'trends' ? 'Trends' : (SECTION_LABELS[k] || k)}</span>
                  {(() => {
                    const m = destMeta(k)
                    if (!m) return null
                    return (
                      <span
                        className="cv-dest-meta"
                        style={m.tone ? { color: TONE_COLORS[m.tone], fontWeight: 'var(--weight-semibold)' } : undefined}
                      >
                        {m.text}
                      </span>
                    )
                  })()}
                  <Icon name="right" size={16} />
                </Link>
              ))}
          </nav>
          {/* Coaching is pinned below a rule, which is the call the desktop
              rail already made: it is about the RELATIONSHIP rather than the
              client's data, and it ends in offboarding. Between Measurements
              and nothing it read as one more data screen. */}
          <nav className="cv-dest cv-dest-pinned" aria-label="Relationship">
            <Link to={`/client/${clientId}/coaching`} className="cv-dest-row ds-control">
              <svg
                className="cv-dest-icon" width="17" height="17" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="1.75"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              >
                {SECTION_ICONS.coaching}
              </svg>
              <span className="cv-dest-label">Coaching</span>
              <Icon name="right" size={16} />
            </Link>
          </nav>
        </>
      )}

      <div id="section-coaching" style={sectionStyle('coaching')}>
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


      {/* A report opened from the thread. It does NOT navigate to the client's
          reader: that route marks the report read, and read_at is the client's
          state — the very thing the card reports back to the coach. */}
      <Modal open={Boolean(openReport)} title="Report" onClose={() => setOpenReport(null)} maxWidth={560}>
        {openReport && <ReportProse content={openReport.content} />}
      </Modal>


      {/* THE ARCHIVE, over the record.
          The same call Coach.jsx makes on the client's side of this
          relationship: the collection is a destination, not a channel. Five
          rows on the record answer "has a report gone out lately, and did they
          read it"; this answers "what did I send in March". Those are
          different enough questions that one surface serving both made the
          record longer every week a coach did their job.

          Rows expand in place here too, for the reason they do below: opening
          the client's reader marks the report read, and read_at is the
          client's state — the very thing this list reports back to the coach. */}
      <Modal
        open={archiveOpen}
        title="All reports"
        onClose={() => { setArchiveOpen(false); setOpenArchiveReport(null) }}
        maxWidth={640}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-8)', marginBottom: 'var(--space-12)' }}>
          {[['all', 'All'], ['unread', 'Unread'], ['read', 'Read']].map(([v, label]) => (
            <Pill key={v} active={archiveFilter === v} aria-pressed={archiveFilter === v} onClick={() => setArchiveFilter(v)}>
              {label}
            </Pill>
          ))}
          {/* Semantic, not asc/desc — C3's rule for the roster's direction
              toggle. "Ascending" means nothing to a reader looking at dates. */}
          <Pill active={false} onClick={() => setArchiveNewestFirst((v) => !v)} style={{ marginLeft: 'auto' }}>
            {archiveNewestFirst ? 'Newest first' : 'Oldest first'}{' '}
            <Icon name={archiveNewestFirst ? 'down' : 'up'} size={12} />
          </Pill>
        </div>

        {/* The scroll lives HERE, which is the whole point: the record behind
            it stays the same length however many reports exist. 60vh rather
            than a pixel height, so the archive uses the screen it is given —
            a fixed height is wrong on a laptop and wrong again on a monitor. */}
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {archiveReports === null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} height="64px" />)}
            </div>
          ) : (() => {
            const filtered = archiveReports.filter((r) => (
              archiveFilter === 'all' ? true : archiveFilter === 'unread' ? !r.read_at : Boolean(r.read_at)
            ))
            const ordered = archiveNewestFirst ? filtered : [...filtered].reverse()
            if (!ordered.length) {
              return (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 'var(--space-16) 0' }}>
                  {archiveFilter === 'unread' ? 'Every report has been read.' : 'Nothing here.'}
                </p>
              )
            }
            // Month separators from the same helper the client's archive uses,
            // so a date band means the same thing on both sides of this
            // relationship. byMonth labels by created_at, which is why the
            // order has to be applied before it rather than after.
            return byMonth(ordered).map((item) => item.kind === 'label' ? (
              <p key={`m-${item.key}`} className="rep-month">{item.label}</p>
            ) : (() => {
              const r = item.report
              const open = openArchiveReport === r.id
              return (
                <div key={r.id}>
                  <button
                    type="button"
                    className="rep-row rep-row-nosender ds-control"
                    aria-expanded={open}
                    onClick={() => setOpenArchiveReport(open ? null : r.id)}
                  >
                    <span className="rep-row-body">
                      <span className="rep-row-head">
                        <span className="rep-row-when">{relativeTime(r.created_at)}</span>
                        <span style={{ fontSize: 'var(--text-xs)', color: r.read_at ? 'var(--color-success)' : 'var(--color-muted)' }}>
                          {r.read_at ? 'Read' : 'Unread'}
                        </span>
                      </span>
                      {!open && <span className="rep-row-lead">{leadOf(r.content)}</span>}
                    </span>
                    <span className="ds-chev" style={{ color: 'var(--color-faint)', display: 'inline-flex' }}>
                      {/* The page's one disclosure mark, rotated — the same
                          `right` chevron SectionHeader turns 90deg when its
                          section opens. This row drew `up`, so a report opened
                          on a page where every other expanded thing points
                          down. */}
                      <Icon
                        name="right"
                        size={16}
                        style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 180ms ease' }}
                      />
                    </span>
                  </button>
                  {open && (
                    <div style={{ padding: 'var(--space-8) 0 var(--space-16)' }}>
                      <ReportProse content={r.content} />
                    </div>
                  )}
                </div>
              )
            })())
          })()}
        </div>
      </Modal>

      {/* Weight, at the size it was drawn for. The range picker comes with
          it: `chartRange` is one shared value on purpose (mixed windows would
          let a coach compare a year of weight with a week of steps), so
          changing it here changes Daily metrics too — which is the behaviour
          the section had when it owned a picker of its own. */}
      <Modal
        open={expandedChart === 'weight'}
        title="Weight"
        onClose={() => setExpandedChart(null)}
        maxWidth={860}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-12)' }}>
          <RangePicker value={chartRange} onChange={setChartRange} />
        </div>
        {weightChartFull()}
      </Modal>

    <ChatBubble
      key={clientId}
      messages={messages}
      reports={threadReports}
      onOpenReport={setOpenReport}
      currentUserId={profile?.id}
      recipientName={clientProfile?.full_name || 'client'}
      recipientAvatarUrl={clientProfile?.avatar_url}
      onSend={sendMessage}
      onMarkRead={markMessagesRead}
      hasOlder={hasOlderMessages(messageTotal, messages.length)}
      onLoadOlder={loadOlderMessages}
      loadingOlder={loadingOlderMessages}
    />
    <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </>
  )
}

export default ClientView
