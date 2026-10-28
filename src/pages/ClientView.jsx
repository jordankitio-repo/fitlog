import { Fragment, cloneElement, useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { refreshNotifications } from '../utils/notifyRefresh'
import StatCard from '../components/StatCard'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import SectionHeader from '../components/SectionHeader'
import Toast from '../components/Toast'
import ComplianceHeatmap from '../components/ComplianceHeatmap'
import CheckinReview from '../components/CheckinReview'
import ComplianceSummary from '../components/ComplianceSummary'
import ReportProse from '../components/ReportProse'
import Modal from '../components/Modal'
import Skeleton from '../components/Skeleton'
import { relativeTime } from '../utils/relativeTime'
import { byMonth, leadOf } from '../utils/reportFeed'
import ComplianceBreakdown from '../components/ComplianceBreakdown'
import EnergyBalanceRead from '../components/EnergyBalanceRead'
import ChatBubble from '../components/ChatBubble'
import { fetchMessageWindow, refreshSize, growSize, hasOlderMessages } from '../utils/messageThread'
import { GOALS, PACE_FOR_GOAL, goalLabel } from '../utils/goals'
import InfoTip from '../components/InfoTip'
import ChartColorToggle from '../components/ChartColorToggle'
import { CONSISTENCY_TIPS } from '../utils/consistencyTips'
import { metricBarData } from '../utils/metricBarChart'
import { bucketHistory, hasValues, historyWindow, padToWindow, DEFAULT_RANGE, axisDay } from '../utils/chartRange'
import { ADHERENCE_DAYS, ADHERENCE_WEEKS, ADHERENCE_NAME, ADHERENCE_FETCH_DAYS, GRAINS, DEFAULT_GRAIN, isGrain, heatmapCap } from '../utils/complianceWindow'
import RangePicker from '../components/RangePicker'
import { usePlainCharts } from '../utils/usePlainCharts'
import { CHART, MARK, baseChartOptions } from '../utils/chartTheme'
import { computeWeightTarget, convertWeight, convertGoalValue, normUnit, unitLabel } from '../utils/weightTarget'
import { measurementCadenceDays, measurementStatus } from '../utils/measurementCadence'
import { useMediaQuery } from '../hooks/useMediaQuery'
import Reorderable from '../components/Reorderable'
import SectionRail from '../components/SectionRail'
import { SECTION_ICONS } from '../utils/sectionIcons'
import DayStepper from '../components/DayStepper'
import TargetCalculator from '../components/TargetCalculator'
import { checkTargets } from '../utils/targetChecks'
import { mergeOrder } from '../utils/cardOrder'
import { resolveLockState } from '../utils/lockState'
import { ageFromBirthDate } from '../utils/biometrics'
import Avatar from '../components/Avatar'
import ActionSheet from '../components/ActionSheet'
import { PauseSheet, GroupsSheet } from '../components/ClientSheets'
import { useCoachGroups } from '../hooks/useCoachGroups'
import { PhotoCompare } from '../components/ProgressPhotos'
import Sparkline from '../components/Sparkline'
import Reveal from '../components/Reveal'
import CheckinCompare from '../components/CheckinCompare'
import CheckinBuilder from '../components/CheckinBuilder'
import { Wheel } from '../components/WheelSelect'
import { sourceLabel } from '../utils/metricSources'
import { shortDay } from '../utils/pause'
import { energyBalanceRead, WINDOW_OPTIONS, WINDOW_DATA_DAYS } from '../utils/energyBalanceRead'
import { computeClientStats } from '../utils/clientStats'
import { latestCheckIn, coversPeriod, checkinRatings } from '../utils/checkinLookup'
import { attentionLevel, gradeCompliance, gradeLogging } from '../utils/attentionLevel'
import { complianceBreakdown } from '../utils/complianceBreakdown'
import { nudgeReason } from '../utils/nudgeReason'
import { CADENCE_OPTIONS } from '../utils/cadence'
import { formatAnswer } from '../utils/checkinQuestions'
import {
  checkinPeriod,
  DEFAULT_CHECKIN_WEEKDAY,
  WEEKDAYS,
  getDatesInRange,
  getWeeklyReportRange,
  parseLocalDateString,
  toLocalDateString,
  addDays
} from '../utils/dateHelpers'
import { cardStyle } from '../utils/styles'
import { groupEntriesByMeal, groupLoggedMeals, formatServing } from '../utils/meals'
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
import { Icon, Pill, Field, Select, Textarea, Switch } from '../components/ui'
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

// The two AI tools, each in its own colour (meeting prep violet, weekly report
// green): the Groundwork card's tiles, and the side panel's two small buttons
// read their colour and icon from here so the two cannot drift apart.
const GW_TOOLS = {
  prep: {
    accent: GW_ACCENT_AI, chip: 'rgba(167, 139, 250, 0.16)',
    title: 'Meeting prep', busy: 'Preparing meeting prep\u2026', sub: 'Private brief before a call',
    icon: <><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h4" /></>,
  },
  report: {
    accent: GW_ACCENT_REPORT, chip: 'rgba(52, 211, 153, 0.16)',
    title: 'Weekly report', busy: 'Drafting report\u2026', sub: 'Draft to review, then send',
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></>,
  },
}
function GroundworkTile({ kind, onClick, loading }) {
  const t = GW_TOOLS[kind]
  return (
    <button className="gw-tile ds-control" onClick={onClick} disabled={loading}
      style={{ '--gw-accent': t.accent, display: 'flex', alignItems: 'center', gap: 'var(--space-12)', width: '100%', textAlign: 'left', padding: 'var(--space-16)', borderRadius: 'var(--radius)', backgroundColor: 'var(--control-bg)', backgroundImage: 'var(--control-sheen)', border: '1px solid var(--control-bd)', boxShadow: 'var(--control-shadow)', cursor: loading ? 'default' : 'pointer', color: 'var(--color-text)', fontFamily: 'inherit', opacity: loading ? 0.65 : 1 }}>
      <span className="gw-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 11, background: t.chip, flexShrink: 0 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
        <span style={{ fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-md)' }}>{loading ? t.busy : t.title}</span>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', lineHeight: 1.35 }}>{t.sub}</span>
      </span>
    </button>
  )
}
const CHART_SERIES = '#34d399'
/* eslint-enable no-restricted-syntax */

// The chart's series is one slot per DAY now (padToWindow), so a window of
// seven slots is seven calendar days. It used to be the last seven weigh-ins,
// which for someone weighing in twice a week was a month labelled "7-day".
// Empty days are skipped, and draw no point of their own.
// A 12px legend swatch of the compliance grades (on target, over, under, well
// under), for series coloured per point by grade. Built once.
let gradeSwatchCanvas = null
function gradeSwatch() {
  if (gradeSwatchCanvas || typeof document === 'undefined') return gradeSwatchCanvas
  const c = document.createElement('canvas')
  c.width = 12; c.height = 12
  const g = c.getContext('2d')
  ;['rgb(52, 211, 153)', 'rgb(251, 146, 60)', 'rgb(251, 191, 36)', 'rgb(248, 113, 113)'].forEach((col, i) => {
    g.fillStyle = col
    g.fillRect(i * 3, 0, 3, 12)
  })
  gradeSwatchCanvas = c
  return c
}

function computeRollingAverage(data, window = 7) {
  return data.map((d, i) => {
    if (d.weight == null) return null
    const vals = data.slice(Math.max(0, i - window + 1), i + 1).map(x => x.weight).filter(v => v != null)
    return Math.round((vals.reduce((sum, v) => sum + v, 0) / vals.length) * 10) / 10
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
  photos: 'Photos',
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
  photos: false,
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
// Photos is NOT a trend chip: as the fourth chip it sat cut off at the edge
// of a phone screen and coaches could not find it. It is its own row, as it
// is its own item on the desktop rail.
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

// Private notes load ten at a time; a long note shows NOTE_CLAMP_LINES lines
// until opened. NOTE_MAX matches the database's check on a note's length.
const NOTES_PAGE = 10
// Notes shown on the record itself (more read as a wall); the rest are in
// All notes, the way check-ins keep four and send the rest to All check-ins.
const NOTES_ON_PAGE = 5
// Earlier check-ins load ten at a time.
const CHECKIN_PAGE = 10
// Earlier check-ins shown on the record itself; the rest are in All check-ins.
const CHECKINS_ON_PAGE = 4
const NOTE_CLAMP_LINES = 6
const NOTE_MAX = 5000
// A note's first non-blank line: what a flag shows wherever it is summarised
// (header, side panel). Not split('\n')[0], which is empty for a body that
// starts with a blank line.
const noteHead = (body) => (body || '').split('\n').find(l => l.trim()) || ''
// Flagged notes shown in the Notes card before the rest move to All notes.
// Every flag shown, always, put 1,400px of flags above the first note at 12.
const FLAGS_ON_PAGE = 5
const NOTE_COLS = 'id, body, created_at, updated_at, date_only, flagged'

// A note's date: "Oct 26, 8:37 PM", or just "Oct 26" for one carried over from
// the old single-text notes, whose times had no zone (see the migration).
function noteDate(n) {
  const d = new Date(n.created_at)
  const year = d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}
  return n.date_only
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...year })
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', ...year, hour: 'numeric', minute: '2-digit' })
}

// The DEFAULT order only — a coach who has dragged anything keeps their own
// layout forever (mergeOrder preserves every saved key and only appends ones
// they have never seen).
//
// It used to end with the four charts, which put the whole question a coach
// opens a record to ask — is the weight actually moving — at 4,422px, below a
// 638px targets FORM and a notes box. Adherence stays near the top because it
// earns it (the heatmap and the breakdown are analysis, not bookkeeping), but
// configuration belongs under the outcome it configures, not over it.
const REORDERABLE_KEYS = ['consistency', 'sentReports', 'nutritionLog', 'checkIn', 'correlatedChart', 'dailyMetrics', 'measurements', 'photos', 'targets', 'privateNotes']

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

const EMPTY_CLIENT_TARGETS = {
  calories: '', protein: '', carbs: '', fat: '',
  cardio_minutes: '', steps: '', weight_goal: '', weight_goal_unit: 'lbs',
}

function ClientView({ profile }) {
  // `section` is the mobile detail route: /client/:id/:section. Absent = the
  // summary. On a desktop it is only a scroll target — the rail is on screen,
  // so every section stays rendered and the param just says where to land.
  const { clientId, section } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))
  const openedOn = useRef(null) // the client the day stepper was last opened for
  const [clientProfile, setClientProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [dayComplete, setDayComplete] = useState(false)
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [weightEntry, setWeightEntry] = useState(null)
  // The weigh-in before the selected day's, for the change shown on the card,
  // and the last few weigh-ins up to that day, for the card's small graph.
  const [prevWeight, setPrevWeight] = useState(null)
  const [recentWeights, setRecentWeights] = useState([])
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
  // From 1440px a side panel holds where this client stands (see triagePanel).
  const hasPanel = useMediaQuery('(min-width: 1440px)')

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
  // A staged schedule change, { weeks, weekday }, applied on Update.
  const [pendingSchedule, setPendingSchedule] = useState(null)
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
      {/* On a phone the labelled switch moves into the card (below), or the
          header has to break "Daily metrics" onto two lines to fit it. */}
      {!compact && <ChartColorToggle plain={plainCharts.has(key)} onToggle={() => togglePlain(key)} />}
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
  // Which device each came from, if one did (null = typed in by hand).
  const [daySources, setDaySources] = useState({ cardio: null, steps: null })
  const [cardioHistory, setCardioHistory] = useState([])
  const [stepsHistory, setStepsHistory] = useState([])
  const [clientTargets, setClientTargets] = useState(EMPTY_CLIENT_TARGETS)
  const [targetsSaved, setTargetsSaved] = useState(false)
  // What is stored, to tell an edited form from an untouched one.
  const [savedClientTargets, setSavedClientTargets] = useState(null)
  const [targetsSaving, setTargetsSaving] = useState(false)
  const [showTargetCalc, setShowTargetCalc] = useState(false)
  const [clientCheckIn, setClientCheckIn] = useState(null)

  const [reviewing, setReviewing] = useState(false)
  const [lockInfo, setLockInfo] = useState({ locked: false, days: 0, reason: 'active' })
  const [daysSinceLog, setDaysSinceLog] = useState(null)
  // The relationship's standing facts: when coaching began, and a pause.
  const [rel, setRel] = useState(null) // { since, pausedUntil, pauseReason }
  // Check-ins before the latest, newest first: the record of how answers moved.
  const [checkinHistory, setCheckinHistory] = useState([])
  const [checkinMore, setCheckinMore] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [checkinArchiveOpen, setCheckinArchiveOpen] = useState(false)
  const [checkinMenuOpen, setCheckinMenuOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const touch = useMediaQuery('(pointer: coarse)')
  const [noteArchiveOpen, setNoteArchiveOpen] = useState(false)
  // The newest progress photo's date, for the Photos row on a phone.
  // undefined = not loaded; null = none.
  const [latestPhotoDate, setLatestPhotoDate] = useState(undefined)
  useEffect(() => {
    let live = true
    supabase.from('progress_photos').select('taken_on').eq('user_id', clientId)
      .order('taken_on', { ascending: false }).limit(1)
      .then(({ data, error }) => { if (live && !error) setLatestPhotoDate(data?.[0]?.taken_on ?? null) })
    return () => { live = false }
  }, [clientId])
  const [openPastCheckin, setOpenPastCheckin] = useState(null)
  // The header's ⋯ menu and the two sheets it opens, the roster's own.
  const [menuOpen, setMenuOpen] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const groupApi = useCoachGroups(profile?.id, showToast)
  const [statusStats, setStatusStats] = useState(null) // this client's triage facts (computeClientStats)
  const [hideCaloriesToggle, setHideCaloriesToggle] = useState(false)
  // Coach-owned now: the client renders this read-only on their Profile.
  const [clientGoal, setClientGoal] = useState('')
  const [checkinInterval, setCheckinInterval] = useState(1)
  // The day the check-in is due (0 = Sunday … 6 = Saturday); see dateHelpers.
  const [checkinWeekday, setCheckinWeekday] = useState(DEFAULT_CHECKIN_WEEKDAY)
  // An off-schedule check-in the coach asked for; open until one arrives.
  const [checkinRequestedAt, setCheckinRequestedAt] = useState(null)
  const [requestingCheckin, setRequestingCheckin] = useState(false)
  // Shown vs owed are different questions (checkinLookup.js). `clientCheckIn`
  // is whatever they filed last; this says whether it lands inside the period
  // we are in now, which is what "due" and the nudge actually mean.
  const checkinCurrent = coversPeriod(clientCheckIn, checkinPeriod(checkinInterval, new Date(), checkinWeekday))

  const [savingCadence, setSavingCadence] = useState(false)
  // Private notes, one row each (coach_note_entries), newest first. null =
  // not loaded yet. Paged: NOTES_PAGE at a time, `notesMore` says there are
  // older ones to fetch.
  const [notes, setNotes] = useState(null)
  const [notesMore, setNotesMore] = useState(false)
  const [newNoteEntry, setNewNoteEntry] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [editingNote, setEditingNote] = useState(null) // { id, body }
  const [noteMenu, setNoteMenu] = useState(null) // note row
  // Flagged notes are few and always shown in full, above the paged list and
  // in the header, so they load apart from it.
  const [flaggedNotes, setFlaggedNotes] = useState([])
  const [noteQuery, setNoteQuery] = useState('')
  const [noteResults, setNoteResults] = useState(null) // null = not searching
  const [openNotes, setOpenNotes] = useState(() => new Set()) // ids shown in full
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

  // The weight card's sub line: when it was taken, and how it moved since the
  // last weigh-in. The change is GREY, never red or green: a gain is the goal
  // for someone building muscle and a warning for someone cutting, so a colour
  // would be wrong for half the roster. The arrow says the direction; the
  // number says how much; the goal decides whether that is good.
  const weightSub = () => {
    // No weigh-in that day: say so, and give the last one, so the card is not
    // a bare dash with nothing under it.
    if (!weightEntry) {
      return prevWeight
        ? <>No weigh-in<br /><span className="tnum">Last {shownWeight(prevWeight.weight, prevWeight.unit)} {unitLabel(weightDisplayUnit)}, {shortDay(prevWeight.logged_date)}</span></>
        : 'No weigh-ins yet'
    }
    const time = weightEntry.weighed_at ? formatTime(weightEntry.weighed_at) : null
    if (!prevWeight) return time
    const delta = Math.round((Number(shownWeight(weightEntry.weight, weightEntry.unit)) - Number(shownWeight(prevWeight.weight, prevWeight.unit))) * 10) / 10
    const since = `since ${shortDay(prevWeight.logged_date)}`
    const change = delta === 0
      ? `No change ${since}`
      : <span className="tnum">{delta > 0 ? '\u2191' : '\u2193'} {Math.abs(delta).toFixed(1)} {unitLabel(weightDisplayUnit)} {since}</span>
    return time ? <>{time}<br />{change}</> : change
  }

  // A stat card's sub line, with the device it came from beneath it.
  const withSource = (sub, source) => (source
    ? <>{sub}{sub && <br />}{source}</>
    : sub)

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

  function showToast(message, type = 'success', action = null) {
    setToast({ message, type, action })
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
  fetchNotes()
  fetchConsistency()
  fetchEnergyBalance()
  fetchSentReports()
  fetchMessages()
  fetchClientStatus()
  fetchClientMeasurements()
}, [clientId])

  // The day the stepper is on now, for the three fetches below to check
  // against when they land: opening on the last logged day changes the date
  // while today's requests are still in flight, and a late answer for today
  // overwrote the day on screen with zeros.
  const dayOnScreen = useRef(selectedDate)
  useEffect(() => {
    dayOnScreen.current = selectedDate
    fetchEntries()
    fetchWeight()
    fetchDayActivity()
  }, [clientId, selectedDate])

  // The targets form: what is wrong with it, and whether it differs from what
  // is stored. Edits survive moving between sections (this page stays
  // mounted); closing or reloading the tab with edits unsaved asks first.
  const targetCheck = checkTargets(clientTargets)
  const targetsDirty = savedClientTargets !== null && (
    Object.keys(EMPTY_CLIENT_TARGETS).some(k => String(clientTargets[k] ?? '') !== String(savedClientTargets[k] ?? ''))
    || clientGoal !== (clientProfile?.primary_goal || '')
  )
  useEffect(() => {
    if (!targetsDirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [targetsDirty])

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
        .select('created_at, lock_cleared_at, hide_calories, checkin_interval_weeks, checkin_weekday, checkin_requested_at, paused_until, pause_reason')
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
      setRel(null)
      setLockInfo({ locked: false, days: 0, reason: 'active' })
      setDaysSinceLog(null)
      setHideCaloriesToggle(false)
      return
    }

    const today = toLocalDateString(new Date())
    const pausedUntil = relationship.paused_until && relationship.paused_until >= today ? relationship.paused_until : null
    setRel({ since: relationship.created_at, pausedUntil, pauseReason: pausedUntil ? relationship.pause_reason : null })

    const interval = relationship.checkin_interval_weeks || 1
    setCheckinInterval(interval)
    setCheckinWeekday(relationship.checkin_weekday ?? DEFAULT_CHECKIN_WEEKDAY)
    setCheckinRequestedAt(relationship.checkin_requested_at || null)
    fetchClientCheckIn()

    setDaysSinceLog(latestLog?.logged_date
      ? Math.floor((new Date() - new Date(`${latestLog.logged_date}T00:00:00`)) / 86400000)
      : null
    )
    // Open on the last day they logged when today is still empty, once per
    // client: a coach checking in the morning saw a wall of 0g for a day not
    // yet started, above the evidence they came for. Within a week only; past
    // that the empty day is the honest picture (the status already says so).
    if (openedOn.current !== clientId) {
      openedOn.current = clientId
      const last = latestLog?.logged_date
      const weekAgo = toLocalDateString(addDays(new Date(), -7))
      if (last && last < today && last >= weekAgo) setSelectedDate(d => (d === today ? last : d))
    }
    setHideCaloriesToggle(Boolean(relationship.hide_calories))
    setLockInfo(resolveLockState({
      lastNutritionDate: latestLog?.logged_date || null,
      connectionCreatedAt: relationship.created_at?.split('T')[0],
      lockClearedAt: relationship.lock_cleared_at,
      pausedUntil: relationship.paused_until || null,
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
      showToast(nudge?.key === 'photos'
        ? `Asked ${clientProfile?.full_name || 'your client'} for photos.`
        : `Nudge sent to ${clientProfile?.full_name || 'client'}.`, 'success')
    }

    setNudging(false)
  }

  async function fetchEntries() {
    const { data: dc } = await supabase
      .from('day_complete').select('logged_date')
      .eq('user_id', clientId).eq('logged_date', selectedDate).maybeSingle()
    if (dayOnScreen.current !== selectedDate) return
    setDayComplete(Boolean(dc))

    const { data, error } = await supabase
      .from('nutrition_log')
      .select('*')
      .eq('user_id', clientId)
      .eq('logged_date', selectedDate)
      .order('created_at', { ascending: true })
    if (dayOnScreen.current !== selectedDate) return
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
    const [{ data, error }, { data: prev, error: prevError }] = await Promise.all([
      supabase.from('weight_log').select('*')
        .eq('user_id', clientId).eq('logged_date', selectedDate)
        .order('created_at', { ascending: false }).limit(1),
      // The weigh-ins up to the selected day, however long ago (not the
      // chart's window, which can start after them): the previous one for the
      // change, the last seven for the card's graph.
      supabase.from('weight_log').select('logged_date, weight, unit')
        .eq('user_id', clientId).lte('logged_date', selectedDate)
        .order('logged_date', { ascending: false }).order('weighed_at', { ascending: false }).limit(21),
    ])
    if (dayOnScreen.current !== selectedDate) return
    if (error) console.error('Error fetching weight:', error)
    else setWeightEntry(data?.[0] ?? null)
    if (prevError) { console.error(prevError); return }
    // One per day (the first row per day is that day's latest), newest first.
    const byDay = []
    for (const w of prev || []) if (!byDay.some(d => d.logged_date === w.logged_date)) byDay.push(w)
    setPrevWeight(byDay.find(w => w.logged_date < selectedDate) ?? null)
    setRecentWeights(byDay.slice(0, 7).reverse())
  }
  // Cardio is summed because a client can log several sessions in one day;
  // steps is a single row per day.
  async function fetchDayActivity() {
    const [{ data: c, error: ce }, { data: st, error: se }] = await Promise.all([
      supabase.from('cardio_log').select('duration, source').eq('user_id', clientId).eq('logged_date', selectedDate).eq('counts_as_cardio', true),
      supabase.from('steps_log').select('steps, source').eq('user_id', clientId).eq('logged_date', selectedDate).limit(1),
    ])
    if (dayOnScreen.current !== selectedDate) return
    // A device's name only when every session came from it: a day of one
    // synced run and one typed-in walk is not "from Apple Health".
    const cardioSrc = c?.length && c.every(r => r.source === c[0].source) ? sourceLabel(c[0].source) : null
    setDaySources({ cardio: ce ? null : cardioSrc, steps: se ? null : sourceLabel(st?.[0]?.source) })
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
  const shortDate = (iso) => axisDay(iso)

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
    .eq('counts_as_cardio', true)
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
  // The latest, then the ones before it a page at a time. It stopped at six:
  // a client three months in had their first two months out of reach.
  async function fetchClientCheckIn({ older = false } = {}) {
  const from = older ? 1 + checkinHistory.length : 0
  const { data, error } = await supabase
    .from('check_ins')
    .select('*')
    .eq('client_id', clientId)
    .order('week_of', { ascending: false })
    .range(from, from + (older ? CHECKIN_PAGE : CHECKIN_PAGE + 1)) // one extra, to know whether more exist
  if (error) { console.error(error); return }
  const rows = data || []
  if (older) {
    setCheckinHistory(prev => [...prev, ...rows.slice(0, CHECKIN_PAGE)])
    setCheckinMore(rows.length > CHECKIN_PAGE)
    return
  }
  const latest = latestCheckIn(rows)
  setClientCheckIn(latest)
  const rest = rows.filter(c => c.id !== latest?.id)
  setCheckinHistory(rest.slice(0, CHECKIN_PAGE))
  setCheckinMore(rest.length > CHECKIN_PAGE)
}

  async function savePause(until, reason) {
    const { error } = await supabase.from('coach_clients')
      .update({ paused_until: until, pause_reason: reason, paused_at: new Date().toISOString() })
      .eq('coach_id', profile.id).eq('client_id', clientId)
    if (error) { showToast("Couldn't pause. Try again.", 'error'); return }
    setPauseOpen(false)
    showToast(`Paused until ${shortDay(until)}.`, 'success')
    fetchLockState()
    fetchClientStatus()
  }

  async function resumeCoaching() {
    const { error } = await supabase.from('coach_clients')
      .update({ paused_until: null, pause_reason: null, paused_at: null })
      .eq('coach_id', profile.id).eq('client_id', clientId)
    if (error) { showToast("Couldn't resume. Try again.", 'error'); return }
    showToast('Coaching resumed.', 'success')
    fetchLockState()
    fetchClientStatus()
  }

  // Ask for a check-in now, off the schedule. The request is recorded first,
  // so the client's card shows it whatever happens to the email; the email is
  // the nudge, with the nudge's 48-hour cooldown.
  async function requestCheckin() {
    if (!profile?.id || requestingCheckin) return
    setRequestingCheckin(true)
    const at = new Date().toISOString()
    const { error } = await supabase.from('coach_clients')
      .update({ checkin_requested_at: at }).eq('coach_id', profile.id).eq('client_id', clientId)
    if (error) {
      setRequestingCheckin(false)
      showToast("Couldn't request a check-in. Try again.", 'error')
      return
    }
    setCheckinRequestedAt(at)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nudge-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ clientId, reason: 'checkin_request' }),
    }).then(r => r.json()).catch(() => ({ error: 'network' }))
    setRequestingCheckin(false)
    showToast(res?.error
      ? `Requested. ${clientFirstName} will see it in the app${res.error === 'too_soon' ? ' (no email: you nudged them in the last 48 hours)' : ''}.`
      : `Requested. ${clientFirstName} has been emailed.`)
  }
  // Open while no check-in has been sent since the request.
  const checkinRequestOpen = Boolean(checkinRequestedAt) && !(clientCheckIn?.created_at && clientCheckIn.created_at >= checkinRequestedAt)

  // Stage a change to either half; back to the saved schedule clears it.
  function stageSchedule(change) {
    const next = { weeks: pendingSchedule?.weeks ?? checkinInterval, weekday: pendingSchedule?.weekday ?? checkinWeekday, ...change }
    setPendingSchedule(next.weeks === checkinInterval && next.weekday === checkinWeekday ? null : next)
  }
  // "Weekly, due Mondays"
  const scheduleLabel = (weeks, weekday) => `${cadenceLabel(weeks)}, due ${WEEKDAYS[weekday]}s`

  // How often AND which day, saved together: either one changes what the
  // client owes, and the trigger tells them (notify_cadence_change).
  async function updateSchedule({ weeks, weekday }) {
    if (!profile?.id) return
    if (weeks === checkinInterval && weekday === checkinWeekday) return
    const prev = { weeks: checkinInterval, weekday: checkinWeekday }
    setSavingCadence(true)
    setCheckinInterval(weeks)
    setCheckinWeekday(weekday)
    const { error } = await supabase
      .from('coach_clients')
      .update({ checkin_interval_weeks: weeks, checkin_weekday: weekday })
      .eq('coach_id', profile.id)
      .eq('client_id', clientId)
    setSavingCadence(false)
    if (error) {
      console.error(error)
      setCheckinInterval(prev.weeks)
      setCheckinWeekday(prev.weekday)
      showToast('Could not update the check-in schedule. Try again.', 'error')
      return false
    }
    setPendingSchedule(null)
    showToast(`Check-in schedule updated. ${clientFirstName} has been told.`)
    return true
  }

  async function reviewCheckIn(text = '') {
    if (!clientCheckIn?.id) return
    setReviewing(true)
    const comment = String(text).trim() || null
    const { error } = await supabase.rpc('review_checkin', { p_id: clientCheckIn.id, p_comment: comment })
    if (error) console.error('Error reviewing check-in:', error)
    else {
      fetchClientCheckIn()
      // The coach's own bell carries a live "no check-in" alert for this
      // client, and reviewing clears the condition behind it. Without this the
      // alert sits there until a navigation or a tab refocus. The RECEIPT
      // ("Dan checked in") deliberately stays — see NotificationCenter.
      refreshNotifications()
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

  // Search across every note on this client, not only the loaded page.
  // Debounced, and answered by the database (ilike), so a coach with three
  // hundred notes searches all of them.
  useEffect(() => {
    const q = noteQuery.trim()
    if (!q || !profile?.id) return undefined
    let live = true
    const t = setTimeout(() => {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      supabase.from('coach_note_entries').select(NOTE_COLS)
        .eq('coach_id', profile.id).eq('client_id', clientId)
        .ilike('body', pattern)
        .order('flagged', { ascending: false }).order('created_at', { ascending: false })
        .limit(50)
        .then(({ data, error }) => {
          if (!live) return
          if (error) { console.error(error); setNoteResults([]); return }
          setNoteResults(data || [])
        })
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [noteQuery, clientId, profile?.id])

  async function fetchNotes({ older = false } = {}) {
    if (!profile?.id) return
    const from = older ? (notes?.length || 0) : 0
    const base = () => supabase.from('coach_note_entries').select(NOTE_COLS)
      .eq('coach_id', profile.id).eq('client_id', clientId)
      .order('created_at', { ascending: false })
    const [{ data, error }, flagged] = await Promise.all([
      base().eq('flagged', false).range(from, from + NOTES_PAGE), // one extra, to know whether more exist
      older ? Promise.resolve(null) : base().eq('flagged', true),
    ])
    if (error || flagged?.error) { console.error(error || flagged.error); if (!older) setNotes([]); return }
    if (flagged) setFlaggedNotes(flagged.data || [])
    const page = (data || []).slice(0, NOTES_PAGE)
    setNotesMore((data || []).length > NOTES_PAGE)
    setNotes(older ? [...(notes || []), ...page] : page)
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
  // With the relationship, or the stats grade every client as weekly and due
  // on Saturday whatever their cadence and day actually are.
  const { data: relationship } = await supabase.from('coach_clients')
    .select('client_id, created_at, lock_cleared_at, checkin_interval_weeks, checkin_weekday, paused_until')
    .eq('coach_id', profile.id).eq('client_id', clientId).eq('status', 'active').maybeSingle()
  const map = await computeClientStats([clientId], relationship ? [relationship] : [])
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

// Adding is an INSERT: two open copies of this record can each add a note and
// both survive, which the one-text-field version could not promise.
async function addNote() {
  const body = newNoteEntry.trim()
  if (!body || addingNote) return
  setAddingNote(true)
  const { data, error } = await supabase.from('coach_note_entries')
    .insert({ coach_id: profile.id, client_id: clientId, body })
    .select(NOTE_COLS).single()
  setAddingNote(false)
  if (error) {
    console.error(error)
    // The typed note stays in the box, so nothing is lost.
    showToast("Couldn't add the note. Try again.", 'error')
    return
  }
  setNotes(prev => [data, ...(prev || [])])
  setNewNoteEntry('')
}

async function saveNoteEdit() {
  const { id, body } = editingNote
  const text = body.trim()
  if (!text) return
  const updated_at = new Date().toISOString()
  const { error } = await supabase.from('coach_note_entries').update({ body: text, updated_at }).eq('id', id)
  if (error) { console.error(error); showToast("Couldn't save the note. Try again.", 'error'); return }
  const edit = (list) => list.map(n => (n.id === id ? { ...n, body: text, updated_at } : n))
  setNotes(prev => edit(prev || []))
  setFlaggedNotes(edit)
  setNoteResults(prev => prev && edit(prev))
  setEditingNote(null)
}

// No confirm: delete at once and offer Undo, the way Mail and Notes do. A
// confirm stops the coach every time to protect against the rare slip; Undo
// costs nothing until the slip happens. Undo puts the very same row back
// (same id, date and flag).
async function deleteNote(note) {
  const { error } = await supabase.from('coach_note_entries').delete().eq('id', note.id)
  if (error) { console.error(error); showToast("Couldn't delete the note. Try again.", 'error'); return }
  const drop = (list) => list.filter(n => n.id !== note.id)
  setNotes(prev => drop(prev || []))
  setFlaggedNotes(drop)
  setNoteResults(prev => prev && drop(prev))
  showToast('Note deleted.', 'success', { label: 'Undo', onClick: () => restoreNote(note) })
}

async function restoreNote(note) {
  const { id, body, created_at, updated_at, date_only, flagged } = note
  const { error } = await supabase.from('coach_note_entries')
    .insert({ id, coach_id: profile.id, client_id: clientId, body, created_at, updated_at, date_only, flagged })
  if (error) { console.error(error); showToast("Couldn't restore the note.", 'error'); return }
  const put = (list) => [...list.filter(n => n.id !== id), note].sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (flagged) setFlaggedNotes(put); else setNotes(prev => put(prev || []))
  setToast({ message: '', type: 'success' })
}

async function toggleFlag(note) {
  const flagged = !note.flagged
  const { error } = await supabase.from('coach_note_entries').update({ flagged }).eq('id', note.id)
  if (error) { console.error(error); showToast("Couldn't update the note. Try again.", 'error'); return }
  const moved = { ...note, flagged }
  const byDate = (a, b) => b.created_at.localeCompare(a.created_at)
  if (flagged) {
    setNotes(prev => (prev || []).filter(n => n.id !== note.id))
    setFlaggedNotes(prev => [...prev, moved].sort(byDate))
  } else {
    setFlaggedNotes(prev => prev.filter(n => n.id !== note.id))
    setNotes(prev => [...(prev || []), moved].sort(byDate))
  }
  setNoteResults(prev => prev && prev.map(n => (n.id === note.id ? moved : n)))
}

  async function fetchClientTargets() {
  const { data, error } = await supabase
    .from('targets')
    .select('*')
    .eq('user_id', clientId)
    .maybeSingle()
  if (error) console.error(error)
  else if (data) {
    const loaded = {
      calories: data.calories?.toString() || '',
      protein: data.protein?.toString() || '',
      carbs: data.carbs?.toString() || '',
      fat: data.fat?.toString() || '',
      cardio_minutes: data.cardio_minutes?.toString() || '',
      steps: data.steps?.toString() || '',
      weight_goal: data.weight_goal?.toString() || '',
      weight_goal_unit: data.weight_goal_unit || 'lbs'
    }
    setClientTargets(loaded)
    setSavedClientTargets(loaded)
  } else {
    setSavedClientTargets(EMPTY_CLIENT_TARGETS)
  }
}

  async function saveClientTargets() {
  if (Object.keys(targetCheck.errors).length) return
  setTargetsSaving(true)
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

  // A failed save used to go to the console only: the button still read "Save
  // targets", the coach believed it had saved, and the client kept the old plan.
  if (error) {
    console.error(error)
    showToast("Couldn't save the targets. Try again.", 'error')
    setTargetsSaving(false)
    return
  }

  // The goal lives on `profiles`, which a coach cannot write directly (only
  // profiles_update_self exists), so it goes through the narrow
  // set_client_primary_goal RPC. Only on an actual change: no point writing a
  // row every time the coach adjusts protein.
  if (clientGoal !== (clientProfile?.primary_goal || '')) {
    const { error: goalError } = await supabase.rpc('set_client_primary_goal', {
      p_client_id: clientId,
      p_goal: clientGoal || null,
    })
    if (goalError) {
      console.error(goalError)
      showToast("Targets saved, but the goal didn't. Try again.", 'error')
      setTargetsSaving(false)
      return
    }
    await fetchClientProfile()
  }

  setSavedClientTargets(clientTargets)
  setTargetsSaving(false)
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
        weight: dayWeight ? `${dayWeight.weight} ${unitLabel(dayWeight.unit)}` : null,
        totalCalories: dayEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
        totalProtein: dayEntries.reduce((sum, e) => sum + (e.protein || 0), 0),
        totalCarbs: dayEntries.reduce((sum, e) => sum + (e.carbs || 0), 0),
        totalFat: dayEntries.reduce((sum, e) => sum + (e.fat || 0), 0),
        meals: dayEntries.map(e => e.food),
        // Every workout goes to the report, the non-cardio ones marked, so the
        // model neither ignores a strength session nor counts it as cardio.
        cardioSessions: dayCardio.map(c => `${c.exercise_type} ${c.duration}min${c.calories_burned ? ` ${c.calories_burned}cal` : ''}${c.counts_as_cardio === false ? ' (not cardio)' : ''}`),
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

    const weekOf = checkinPeriod(checkinInterval, new Date(), checkinWeekday).weekOf
    const { data: checkInData } = await supabase
      .from('check_ins').select('*').eq('client_id', clientId).eq('week_of', weekOf).maybeSingle()

    // No `reaction`: it was fetched only to feed the call-prep prompt, and it has
    // been write-dead since reactions were removed in 60cc27f. See call-prep.
    const { data: messagesData } = await supabase
      .from('messages').select('content, created_at')
      .eq('coach_id', session.user.id).eq('client_id', clientId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })

    // The week's notes, the same 7 days as the messages: the brief is about
    // this week, so a quiet week sends none and a busy one sends them all.
    // Flagged notes go in whatever their age (an injury stays relevant).
    const { data: weekNotes } = await supabase
      .from('coach_note_entries').select(NOTE_COLS)
      .eq('coach_id', session.user.id).eq('client_id', clientId).eq('flagged', false)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })

    const weekData = days.map(date => {
      const dayEntries = nutritionResult.data?.filter(e => e.logged_date === date) || []
      const dayWeight = weightResult.data?.find(w => w.logged_date === date)
      const dayCardio = cardioResult.data?.filter(c => c.logged_date === date) || []
      const daySteps = stepsResult.data?.find(s => s.logged_date === date)
      return {
        date,
        weight: dayWeight ? `${dayWeight.weight} ${unitLabel(dayWeight.unit)}` : null,
        totalCalories: dayEntries.reduce((sum, e) => sum + (e.calories || 0), 0),
        totalProtein: dayEntries.reduce((sum, e) => sum + (e.protein || 0), 0),
        cardioSessions: dayCardio.map(c => `${c.exercise_type} ${c.duration}min${c.counts_as_cardio === false ? ' (not cardio)' : ''}`),
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
          privateNotes: [...flaggedNotes.map(n => `FLAGGED ${noteDate(n)}: ${n.body}`), ...(weekNotes || []).map(n => `${noteDate(n)}: ${n.body}`)].join('\n\n'),
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

  // value / target for a stat card's bar, or null when there is no target.
  const dayProgress = (actual, target) => {
    const t = Number(target)
    return Number.isFinite(t) && t > 0 ? (Number(actual) || 0) / t : null
  }
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
        type: 'line', label: `Goal (${goalRef.goal} ${unitLabel(goalRef.displayUnit)})`,
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
    plugins: {
      ...baseChartOptions().plugins,
      legend: {
        ...baseChartOptions().plugins.legend,
        labels: {
          ...baseChartOptions().plugins.legend.labels,
          // Calories' bars are coloured per day by grade, so chart.js took the
          // first day's colour for the key: transparent, an unlogged day, and
          // the key showed a label with no swatch. Its swatch is the grade
          // scale itself, four bands, which is what "coloured by target" means.
          generateLabels: (chart) => {
            const labels = ChartJS.defaults.plugins.legend.labels.generateLabels(chart)
            return labels.map(l => (l.text === 'Calories %' ? { ...l, pointStyle: gradeSwatch(), fillStyle: 'transparent', strokeStyle: 'transparent' } : l))
          },
        },
      },
    },
    scales: {
      x: { ticks: { color: CHART.tick, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 }, grid: { display: false }, border: { color: CHART.grid } },
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
  const shownWeight = (value, unit) => (Math.round(convertWeight(Number(value), normUnit(unit || weightDisplayUnit), weightDisplayUnit) * 10) / 10).toFixed(1)
  const destMeta = (key) => {
    const w = weightHistory[weightHistory.length - 1]
    const rail = railMeta[key]
    if (rail?.meta) return { text: String(rail.meta), tone: rail.metaTone || null }
    switch (key) {
      // In the record's one weight unit (the goal's), like every chart here:
      // a goal in lb over a row reading "66.7 kg" made the coach convert.
      case 'trends': return { text: w ? `${shownWeight(w.weight, w.unit)} ${unitLabel(weightDisplayUnit)}` : 'No weight yet' }
      case 'nutritionLog': return { text: `${consistency.days7}/7 this week` }
      case 'targets': return { text: clientTargets.calories ? `${Number(clientTargets.calories).toLocaleString()} cal` : 'Not set' }
      // Not "Written" — a note that exists is always written, so the word
      // answered nothing. The DATE is the useful fact: it says which week's
      // thinking the note holds, which a recency ("2 months ago") makes the
      // reader work out.
      case 'privateNotes':
        if (!notes) return null
        if (!notes.length && !flaggedNotes.length) return { text: 'None' }
        return { text: new Date([...notes, ...flaggedNotes].map(n => n.created_at).sort().at(-1)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
      case 'sentReports': return { text: sentTotal ? `${sentTotal}` : 'None' }
      case 'photos':
        if (latestPhotoDate === undefined) return null
        return { text: latestPhotoDate ? shortDay(latestPhotoDate) : 'None' }
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
      empty: 'No nutrition logged yet', valueKey: 'calories',
      // Padded to the whole window so the range control visibly changes
      // the span (chartRange.js padToWindow).
      history: () => padToWindow(bucketHistory(calorieHistory, 'calories', chartRange), 'calories', chartRange),
      data: (h) => calorieChartData(plainCharts.has('dailyMetrics'), h),
    },
    {
      key: 'cardioChart', label: 'Cardio', unit: 'min',
      empty: 'No cardio logged yet', valueKey: 'minutes',
      history: () => padToWindow(bucketHistory(cardioHistory, 'minutes', chartRange), 'minutes', chartRange),
      data: (h) => metricBarData({ history: h, valueKey: 'minutes', label: 'Minutes', target: parseInt(clientTargets.cardio_minutes) || null, fallback: (a) => `rgba(59, 130, 246, ${a})`, plain: plainCharts.has('dailyMetrics') }),
    },
    {
      key: 'stepsChart', label: 'Steps', unit: 'steps',
      empty: 'No steps logged yet', valueKey: 'steps',
      history: () => padToWindow(bucketHistory(stepsHistory, 'steps', chartRange), 'steps', chartRange),
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
    // The side panel says both of these in words, so while it shows they
    // come off the rail: the rail is where to go, the panel what is true.
    checkIn: hasPanel ? null : clientCheckIn && !clientCheckIn.reviewed_at
      ? { meta: 'New', metaTone: 'success' }
      : (!checkinCurrent ? { meta: 'Due', metaTone: 'warning' } : null),
    nutritionLog: !hasPanel && daysSinceLog != null && daysSinceLog >= 3
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
    // With the side panel, Message is its button (unread count and all).
    { label: null, items: hasPanel ? [] : [railItem('messages', 'Messages')] },
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
          // The goal maths reads the weigh-ins; the chart draws the window.
          // The marker is matched by ROW, not position, because padding
          // shifts every index.
          const plotHistory = padToWindow(dispHistory, 'weight', chartRange)
          const reachedRow = wt?.reached ? dispHistory[wt.reachedIndex] : null
          const isMark = (i) => reachedRow != null && plotHistory[i] === reachedRow
          const datasets = [
            {
              label: 'Weight',
              data: plotHistory.map(d => d.weight),
              spanGaps: true,
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
              pointRadius: plotHistory.map((_, i) => (isMark(i) ? 7 : 0)),
              pointHoverRadius: 5,
              pointStyle: 'circle',
              pointBackgroundColor: plotHistory.map((_, i) => (isMark(i) ? '#15803d' : '#34d399')),
              pointBorderColor: plotHistory.map((_, i) => (isMark(i) ? '#ffffff' : '#34d399')),
              pointBorderWidth: plotHistory.map((_, i) => (isMark(i) ? 2.5 : 1)),
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
            data: computeRollingAverage(plotHistory),
            spanGaps: true,
            borderColor: 'rgba(52, 211, 153, 0.45)',
            backgroundColor: 'transparent',
            borderWidth: MARK.lineWidth,
            borderDash: [4, 4],
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          })
          if (wt) datasets.push({
            label: `Goal (${wt.goal} ${unitLabel(wt.displayUnit)})`,
            data: plotHistory.map(() => wt.goal),
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
                callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} ${unitLabel(displayUnit)}` },
              },
            },
            scales: {
              ...chartOptions.scales,
              y: { ...chartOptions.scales.y, title: { display: true, text: `Weight (${unitLabel(displayUnit)})`, color: CHART.tick } },
            },
          }
          return (
            <>
              <Line data={{ labels: plotHistory.map(d => d.date), datasets }} options={weightChartOptions} />
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
                        ? <>. Holding at {wtNow.goal} {unitLabel(wtNow.displayUnit)}</>
                        : <>. First hit {wtNow.goal} {unitLabel(wtNow.displayUnit)} on {new Date(wtNow.reachedIso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</>}
                    </>
                  ) : (
                    <><strong style={{ color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>{wtNow.remainingAbs} {unitLabel(wtNow.displayUnit)}</strong> {wtNow.direction === 'up' ? 'to gain' : 'to lose'} to reach the {wtNow.goal} {unitLabel(wtNow.displayUnit)} goal</>
                  )}
                </p>
              )}
            </>
          )
        })() : chartEmpty('No weight logged yet', `${clientFirstName} logs this on their Today tab.`))

  // One earlier check-in: date and ratings, opening in place. Shared by the
  // four on the page and the All check-ins list.
  const renderPastCheckin = (c) => {
    const open = openPastCheckin === c.id
    const ratings = checkinRatings(c).slice(0, 2).map(r => `${r.label.length > 10 ? r.label.slice(0, 9) + '\u2026' : r.label} ${r.value}`).join(' \u00b7 ')
    return (
      <div key={c.id} className="cv-ci-item">
        <button type="button" className="cv-ci-row ds-control" aria-expanded={open} onClick={() => setOpenPastCheckin(open ? null : c.id)}>
          <span className="cv-ci-row-when">{shortDay(c.week_of)}</span>
          <span className="cv-ci-row-val tnum">{ratings}</span>
          <Icon name="right" size={16} style={{ color: 'var(--color-faint)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 180ms ease' }} />
        </button>
        <Reveal open={open}>
          <div style={{ padding: 'var(--space-4) 0 var(--space-16)' }}>
            <CheckinReview checkIn={c} readOnly clientId={clientId} intervalWeeks={checkinInterval} weightUnit={weightDisplayUnit} />
          </div>
        </Reveal>
      </div>
    )
  }

  // One private note: date (and flag), body folded past six lines, ⋯ menu.
  // Shared by the flagged list, the paged list and search results, so a note
  // looks the same wherever it turns up.
  const noteWords = noteQuery.trim().toLowerCase()
  const markMatch = (text) => {
    if (!noteWords) return text
    const out = []
    let i = 0
    const lower = text.toLowerCase()
    for (let at = lower.indexOf(noteWords); at !== -1; at = lower.indexOf(noteWords, i)) {
      out.push(text.slice(i, at), <mark key={at} className="cv-note-mark">{text.slice(at, at + noteWords.length)}</mark>)
      i = at + noteWords.length
    }
    out.push(text.slice(i))
    return out
  }
  const renderNote = (n) => {
                  const editing = editingNote?.id === n.id
                  const long = n.body.length > 360 || n.body.split('\n').length > NOTE_CLAMP_LINES
                  const open = openNotes.has(n.id)
                  return (
                    <div key={n.id}>
                      {/* The ⋯ keeps its 32px target but hangs into the space
                          above and below the line (negative margin), so the
                          date sits a caption's distance above its note, not a
                          button's. Never sideways: a side overhang made the
                          card's content wider than the card, and focusing
                          the search box scrolled the whole card left. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', height: 18, marginBottom: 'var(--space-4)' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', flex: 1, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                          {n.flagged && <Icon name="flag" size={12} aria-label="Flagged" style={{ color: 'var(--color-warning)' }} />}
                          {noteDate(n)}{n.updated_at ? ' · edited' : ''}
                        </span>
                        {!editing && (
                          <button type="button" className="rost-m-more ds-control" style={{ margin: '-8px 0' }} onClick={() => setNoteMenu(n)} aria-label={`Options for the note from ${noteDate(n)}`}>
                            <Icon name="more" />
                          </button>
                        )}
                      </div>
                      {editing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
                          <Textarea value={editingNote.body} maxLength={NOTE_MAX} rows={Math.min(10, Math.max(3, editingNote.body.split('\n').length + 1))}
                            onChange={(e) => setEditingNote({ id: n.id, body: e.target.value })} aria-label="Edit note" style={{ lineHeight: '1.6', resize: 'vertical' }} />
                          <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
                            <Button onClick={saveNoteEdit} variant="primary" size="sm" disabled={!editingNote.body.trim()}>Save</Button>
                            <Button onClick={() => setEditingNote(null)} variant="ghost" size="sm">Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className={long && !open ? 'cv-note-clamp' : undefined}
                            style={{ fontSize: 'var(--text-base)', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, '--clamp': NOTE_CLAMP_LINES }}>
                            {markMatch(n.body)}
                          </p>
                          {long && (
                            <button type="button" className="pp-retry" style={{ textDecoration: 'none', fontSize: 'var(--text-sm)', marginTop: 'var(--space-4)' }}
                              aria-expanded={open}
                              onClick={() => setOpenNotes(prev => { const next = new Set(prev); if (open) next.delete(n.id); else next.add(n.id); return next })}>
                              {open ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )
  }

  // The header's parts, composed once: the header shows them, and on a wide
  // screen the side panel takes the triage ones (status, flag, nudge, lock).
  const paused = Boolean(rel?.pausedUntil)
  const status = statusStats ? attentionLevel({ ...statusStats, lockInfo }) : null
  const reasons = status ? status.reasons.filter(r => r !== 'Locked') : []
  const showStatus = status && !(status.level !== 'green' && reasons.length === 0)
  const tone = status && (status.level === 'red' ? 'var(--color-error)' : status.level === 'yellow' ? 'var(--color-warning)' : 'var(--color-success)')
  // A paused client is not nudged: the pause is the coach saying so.
  const nudge = paused ? null : nudgeReason({ daysSinceLog, hasCheckIn: checkinCurrent, checkinDue: checkinPeriod(checkinInterval, new Date(), checkinWeekday).dueWindow })
  const nudgeLabel = nudge && (nudge.key === 'checkin' ? 'Nudge to check in' : 'Nudge to log')

  /* C1: status is plain coloured text — no container, no border, no dot.
     Green keeps --color-success rather than going muted: green and grey
     must never collide (B1), or a healthy client reads identically to an
     unconfigured one. */
  // Paused is not a grade (C1's grey: nothing to grade against), so it
  // is muted and regular weight, the roster's "Paused until" exactly.
  const statusText = paused ? (
    <span className="cv-head-status" style={{ color: 'var(--color-muted)' }}>
      Paused until {shortDay(rel.pausedUntil)}{rel.pauseReason ? ` \u00b7 ${rel.pauseReason}` : ''}
    </span>
  ) : showStatus && (
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
  // The roster's ⋯, for the roster's per-client actions. Before this, a
  // coach looking AT a client had to go back to the list to pause them.
  const moreButton = (
    <button type="button" className="rost-m-more ds-control" onClick={() => setMenuOpen(true)} aria-label={`More for ${clientProfile?.full_name || 'client'}`}>
      <Icon name="more" />
    </button>
  )
  // Who this is, in one muted line: the goal, how long they have been
  // coached, and the coach's own labels. Each part only when known.
  const groupNames = groupApi.groupsOf(clientId).map(g => g.name)
  const facts = [
    goalLabel(clientProfile?.primary_goal),
    rel?.since && `Client since ${new Date(rel.since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
    groupNames.length > 0 && groupNames.join(', '),
  ].filter(Boolean)
  const factsText = facts.length > 0 && <span className="cv-head-facts">{facts.join(' \u00b7 ')}</span>
  // A flagged note's first line, in the header, so an injury or an
  // allergy is in front of the coach on every visit without opening
  // Notes (Trainerize keeps a flagged injury on the profile the same
  // way). Plain text with a glyph, not a pill (C1); it links to Notes.
  const flagLine = flaggedNotes.length > 0 && (
    <Link to={`/client/${clientId}/privateNotes`} className="cv-head-flags ds-control"
      title={flaggedNotes.map(n => noteHead(n.body)).join('\n')}
      aria-label={`Flagged: ${flaggedNotes.map(n => noteHead(n.body)).join('; ')}. Open notes`}>
      <Icon name="flag" size={13} />
      <span className="cv-head-flags-text">{noteHead(flaggedNotes[0].body)}</span>
      {flaggedNotes.length > 1 && <span className="cv-head-flags-more">+{flaggedNotes.length - 1}</span>}
    </Link>
  )
  const unlockButton = lockInfo.locked && (
    <Button onClick={unlockClient} variant="danger" size="sm">Unlock</Button>
  )


  // WHERE THIS CLIENT STANDS, beside the record on a wide screen.
  // The page is the evidence (charts, history, check-ins, photos); this is
  // the verdict and the next move, kept in view while the coach scrolls it.
  // Separate cards on the page background, Cronometer's right column, not a
  // second full-height sidebar: two grey walls boxed the record in, and a
  // list of small labels read like settings rather than a verdict. So the
  // first card leads with one big figure. Nothing is drawn twice: while the
  // panel shows, the header drops its status, flag, lock and nudge.
  // The flags past those shown in the Notes card, opening All notes.
  const moreFlagged = (n) => (
    <Button onClick={() => setNoteArchiveOpen(true)} variant="muted" size="sm">{n} more flagged</Button>
  )
  const TONE_COLOR = { red: 'var(--color-error)', yellow: 'var(--color-warning)', green: 'var(--color-success)' }
  const compliance = statusStats ? gradeCompliance(statusStats) : null
  const logging = statusStats ? gradeLogging({ ...statusStats, lockInfo }) : null
  const checkinDay = clientCheckIn?.created_at && shortDay(toLocalDateString(new Date(clientCheckIn.created_at)))
  const requestButton = (
    <Button variant="muted" size="sm" style={{ width: '100%' }} onClick={requestCheckin} loading={requestingCheckin} disabled={requestingCheckin || paused}>
      Request check-in
    </Button>
  )
  const checkinCard = clientCheckIn && !clientCheckIn.reviewed_at
    ? { text: `Sent ${checkinDay}, waiting for your review`, tone: 'var(--color-success)', action: <Button variant="primary" size="sm" style={{ width: '100%' }} onClick={() => goToSection('checkIn')}>Review check-in</Button> }
    : checkinRequestOpen ? { text: `You asked for one on ${shortDay(toLocalDateString(new Date(checkinRequestedAt)))}.` }
    : !checkinCurrent ? { text: 'Due this period, not in yet.', tone: 'var(--color-warning)', action: nudge?.key === 'checkin' ? cloneElement(nudgeButton, { fullWidth: true }) : requestButton }
    : { text: checkinDay ? `Reviewed, sent ${checkinDay}.` : 'Up to date.', action: paused ? null : requestButton }
  const triagePanel = hasPanel && (
    <aside className="cv-panel" aria-label={`Where ${clientFirstName} stands`}>
      <section className="cvp-card">
        {paused ? (
          <p className="cvp-big" style={{ color: 'var(--color-muted)', fontSize: 'var(--text-lg)' }}>Paused until {shortDay(rel.pausedUntil)}</p>
        ) : compliance?.max ? (
          <div>
            <p className="cvp-big tnum" style={{ color: TONE_COLOR[compliance.tone] }}>
              {compliance.sum}<span className="cvp-big-of">/{compliance.max}</span>
            </p>
            <p className="cvp-caption">
              <InfoTip text={`Every target counts once a day, so ${compliance.max / 7} targets over 7 days is ${compliance.max} chances; this is how many were hit.\n\nHit means: calories within 90-110% of target; protein, cardio and steps at 90% of target or more.\n\nThe rows below are each target's own days out of 7.`}>
                targets hit · past 7 days
              </InfoTip>
            </p>
          </div>
        ) : (
          <div>
            <p className="cvp-big" style={{ color: 'var(--color-muted)', fontSize: 'var(--text-lg)' }}>{compliance?.text || 'Not enough data yet'}</p>
            {compliance?.fix === 'targets' && (
              <button type="button" className="cvp-link ds-control" onClick={() => goToSection('targets')}>Set targets<Icon name="right" size={12} /></button>
            )}
          </div>
        )}
        {logging && !paused && !lockInfo.locked && (
          <p className="cvp-line" style={{ color: logging.tone === 'green' ? 'var(--color-text-dim)' : TONE_COLOR[logging.tone], fontWeight: logging.tone === 'green' ? undefined : 'var(--weight-medium)' }}>
            {logging.text}
          </p>
        )}
        {/* Locked: the one line that says why, then its two remedies side by
            side (the logging line would only have said "Locked" again). */}
        {lockInfo.locked && (
          <>
            {lockText}
            <div className="cvp-act cvp-prep">
              {cloneElement(unlockButton, { fullWidth: true })}
              {nudge?.key !== 'checkin' && nudgeButton && cloneElement(nudgeButton, { fullWidth: true })}
            </div>
          </>
        )}
        {/* What the figure is made of: each target's days out of seven, so
            "12/28" says which targets carry it and which one is the gap. One
            neutral bar for all four: protein's own red read as a bad grade. */}
        {/* Only when something was logged: four rows of "no logs" under
            "Nothing logged" said one fact five times. */}
        {!paused && statusStats?.complianceItems?.some(i => i.hasData) && (
          <div className="cvp-split">
            {statusStats.complianceItems.map(i => (
              <div key={i.label} className="cvp-split-row">
                <span className="cvp-split-label">{i.label}</span>
                <span className="cvp-split-bar" aria-hidden="true">
                  <span style={{ width: `${(i.value / 7) * 100}%` }} />
                </span>
                <span className="cvp-split-num tnum" style={{ color: i.hasData ? undefined : 'var(--color-faint)' }}>{i.hasData ? `${i.value}/7` : 'no logs'}</span>
              </div>
            ))}
          </div>
        )}
        {!lockInfo.locked && nudge?.key !== 'checkin' && nudgeButton && <div className="cvp-act">{cloneElement(nudgeButton, { fullWidth: true })}</div>}
      </section>

      <section className="cvp-card">
        <p className="cvp-label">Check-in</p>
        <p className="cvp-text" style={{ color: checkinCard.tone, fontWeight: checkinCard.tone ? 'var(--weight-medium)' : undefined }}>{checkinCard.text}</p>
        {checkinCard.action && <div className="cvp-act">{checkinCard.action}</div>}
      </section>

      {/* Flags as ONE line: how many, and the newest, opening Notes. The
          panel never grows with the client's data (a list of flags here made
          it taller than a laptop screen and gave it a scrollbar of its own
          beside the page's); the full list is in Notes. */}
      {flaggedNotes.length > 0 && (
        <button type="button" className="cvp-card cvp-flagline ds-control" onClick={() => goToSection('privateNotes')}
          title={flaggedNotes.map(n => noteHead(n.body)).join('\n')}
          aria-label={`${flaggedNotes.length} flagged ${flaggedNotes.length === 1 ? 'note' : 'notes'}: ${flaggedNotes.map(n => noteHead(n.body)).join('; ')}. Open notes`}>
          <Icon name="flag" size={14} />
          <span className="cvp-flagline-count">{flaggedNotes.length} flagged</span>
          <span className="cvp-flagline-text">{noteHead(flaggedNotes[0].body)}</span>
          <Icon name="right" size={12} />
        </button>
      )}

      {/* Groundwork's two tools, as two small buttons in their own colours
          (the Groundwork tiles' icons); what they write appears in the record,
          in the Groundwork card, which scrolls into view. */}
      <div className="cvp-prep">
        {['prep', 'report'].map(kind => {
          const t = GW_TOOLS[kind]
          const busy = kind === 'prep' ? briefingLoading : reportLoading
          return (
            <Button key={kind} variant="muted" size="sm" fullWidth loading={busy} disabled={busy}
              onClick={async () => { await (kind === 'prep' ? generateCallPrep() : generateWeeklyReport()); setAiToolsCollapsed(false); goToSection('groundwork') }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
              {t.title}
            </Button>
          )
        })}
      </div>

      {/* Green, unless the check-in card's Review is: one primary per view. */}
      <Button variant={clientCheckIn && !clientCheckIn.reviewed_at ? 'muted' : 'primary'} size="sm" style={{ width: '100%' }} onClick={() => handleRailJump('messages')}>
        <Icon name="message" size={15} />Message {clientFirstName}
        {unreadFromClient > 0 && <span className="cvp-unread tnum">{unreadFromClient} new</span>}
      </Button>
    </aside>
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
      {/* THE WAY OFF THIS RECORD WHEN THERE IS NO RAIL.
          Two navigation systems governed this page and their breakpoints did
          not meet: the rail appears from 1024px, the bottom tab bar (which
          carries a "Clients" tab) only below 600. Between 601 and 1023 — a
          desktop window dragged narrower — there was NOTHING. No rail, no tab
          bar, and the summary route has no back link of its own, so the only
          exits were the browser's own and the logo.
          Rendered whenever the rail is gone and hidden by CSS at the same
          600px line the tab bar takes over at (.cv-backbar), so the two can
          never drift apart again. */}
      {!hasRail && (
        <Link to="/" className="cv-backbar ds-disclosure ds-control" style={{ width: 'auto', textDecoration: 'none' }}>
          <Icon name="left" size={14} />
          <span>All clients</span>
        </Link>
      )}

      {/* The header, composed once and laid out twice.
          On a phone it was four stacked fragments with no grouping: a name over
          an email over a red status over a second red word over a muted
          sentence over a button, with Nudge floating off on its own. The parts
          are the same; what changes is that the two ACTIONS end up together in
          one row instead of marooned in separate containers, and the lock
          reads as one sentence rather than a label and an explanation that
          look like two different things. */}
      {(() => {
        if (!hasRail) {
          return (
            <div className="cv-head-m">
              <div className="cv-head-m-id">
                <Avatar url={clientProfile?.avatar_url} name={clientProfile?.full_name || ''} size={44} />
                <div className="cv-head-m-name">
                  <h1>{clientProfile?.full_name || 'Client'}</h1>
                  {factsText}
                  {statusText}
                  {flagLine}
                </div>
                <span style={{ marginLeft: 'auto', alignSelf: 'flex-start' }}>{moreButton}</span>
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
                {factsText && <p style={{ marginTop: 'var(--space-2)' }}>{factsText}</p>}
                {!hasPanel && statusText && <div style={{ marginTop: 'var(--space-4)' }}>{statusText}</div>}
                {!hasPanel && flagLine && <div style={{ marginTop: 'var(--space-6)' }}>{flagLine}</div>}
                {!hasPanel && lockInfo.locked && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap', marginTop: 'var(--space-10)' }}>
                    {lockText}
                    {unlockButton}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>{!hasPanel && nudgeButton}{moreButton}</div>
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

      {/* On a wide screen the two tools are buttons in the side panel, so the
          record opens on the client's numbers rather than on tools; the card
          appears here only to hold what they produce. */}
      {!(hasPanel && !callBriefing && !report) && (
      <div id="section-groundwork" style={sectionStyle('groundwork')}>
        <SectionHeader
          title="Groundwork"
          collapsed={hasRail && aiToolsCollapsed}
          onToggle={hasRail ? () => setAiToolsCollapsed(!aiToolsCollapsed) : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
            {!hasPanel && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-12)' }}>
              <GroundworkTile kind="prep" onClick={generateCallPrep} loading={briefingLoading} />
              <GroundworkTile kind="report" onClick={generateWeeklyReport} loading={reportLoading} />
            </div>
            )}

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
      )}

      {/* The same `‹ Today ›` as the client's Log and My Progress, so a coach
          and the client pick a day the same way (components/DayStepper). */}
      <div style={{ display: isVisible('stats') ? 'flex' : 'none', alignItems: 'center' }}>
        <DayStepper value={selectedDate} onChange={setSelectedDate} />
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
              <StatCard label="Calories" value={num(totals.calories)} sub={dayTarget(totals.calories, clientTargets.calories, ' cal')} progress={dayProgress(totals.calories, clientTargets.calories)} color="var(--color-calories)" />
              <StatCard label="Protein" value={`${num(totals.protein)}g`} sub={dayTarget(totals.protein, clientTargets.protein, 'g')} progress={dayProgress(totals.protein, clientTargets.protein)} color="var(--color-protein)" />
              <StatCard label="Carbs" value={`${num(totals.carbs)}g`} sub={dayTarget(totals.carbs, clientTargets.carbs, 'g')} progress={dayProgress(totals.carbs, clientTargets.carbs)} color="var(--color-carbs)" />
              <StatCard label="Fat" value={`${num(totals.fat)}g`} sub={dayTarget(totals.fat, clientTargets.fat, 'g')} progress={dayProgress(totals.fat, clientTargets.fat)} color="var(--color-fat)" />
            </div>
            {/* Cardio and Steps were never on this panel, though the coach sets a
                target for both and the page carries a chart for each — so the
                client's own Dashboard showed seven metrics for a day while the
                coach's view of the same day showed five. */}
            <div className="cv-stats-activity" style={{ display: 'grid', gap: 'var(--space-16)' }}>
              {/* A synced value says which device, on its own line under the
                  target: a coach reads a step count from a phone differently
                  from one typed in (Trainerize marks synced data the same way). */}
              <StatCard label="Cardio" value={dayCardio ? `${dayCardio} min` : '—'} sub={withSource(dayTarget(dayCardio, clientTargets.cardio_minutes, ' min'), dayCardio && daySources.cardio)} progress={dayProgress(dayCardio, clientTargets.cardio_minutes)} color="var(--color-cardio)" />
              <StatCard label="Steps" value={daySteps ? num(daySteps) : '—'} sub={withSource(dayTarget(daySteps, clientTargets.steps), daySteps && daySources.steps)} progress={dayProgress(daySteps, clientTargets.steps)} color="var(--color-steps)" />
              <StatCard label="Weight" value={weightEntry ? `${shownWeight(weightEntry.weight, weightEntry.unit)} ${unitLabel(weightDisplayUnit)}` : '—'} sub={withSource(weightSub(), weightEntry && sourceLabel(weightEntry.source))} color="var(--color-weight)"
                to={`/client/${clientId}/trends`}
                /* With the rail (desktop), the chart is on this page: scroll to
                   it the way the rail's Progress item does. Following the link
                   there only worked once: after it, the address already said
                   /trends, so a second click changed nothing and went nowhere.
                   The href stays for a new tab and for the phone. */
                onOpen={hasRail ? () => handleRailJump(DEFAULT_TREND) : null}
                aside={weightEntry && recentWeights.length >= 2 ? <Sparkline points={recentWeights.map(w => Number(shownWeight(w.weight, w.unit)))} minSpan={weightDisplayUnit === 'kg' ? 1 : 2} /> : null} />
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
          {/* Named, because these six count LOGGING, and the card is called
              Adherence: a green 7/7 sat above "0 days on target" with nothing
              saying the two measured different things. Same caption style as
              "Calorie compliance" below it, so the card reads as two parts. */}
          <p className="ds-colhead" style={{ margin: 0 }}>Days logged</p>
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
                color: consistency.days7 >= 5 ? 'var(--color-success)' : consistency.days7 >= 3 ? 'var(--color-warning)' : 'var(--color-error)',
              },
              {
                key: 'last30',
                label: compact ? '30 days' : 'Last 30 days',
                tip: CONSISTENCY_TIPS.last30,
                value: consistency.days30,
                unit: '/30',
                color: consistency.days30 >= 20 ? 'var(--color-success)' : consistency.days30 >= 10 ? 'var(--color-warning)' : 'var(--color-error)',
              },
              {
                key: 'weekdays',
                label: 'Weekdays logged',
                tip: CONSISTENCY_TIPS.weekdays,
                value: consistency.weekdayLogged,
                unit: `/${consistency.weekdayTotal}`,
                sub: `${consistency.weekdayTotal > 0 ? Math.round((consistency.weekdayLogged / consistency.weekdayTotal) * 100) : 0}%`,
                color: consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.8 ? 'var(--color-success)' : consistency.weekdayLogged / (consistency.weekdayTotal || 1) >= 0.5 ? 'var(--color-warning)' : 'var(--color-error)',
              },
              {
                key: 'weekends',
                label: 'Weekends logged',
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
                // A best week of nothing has no dates worth naming: with no
                // logs at all this printed the current, unfinished week.
                sub: consistency.bestWeekCount > 0
                  ? `${consistency.bestWeekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${consistency.bestWeekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : 'None yet',
                color: consistency.bestWeekCount === 7 ? 'var(--color-success)' : consistency.bestWeekCount >= 5 ? 'var(--color-warning)' : 'var(--color-muted)',
              }] : []),
            ].map(c => (
              <div key={c.key} style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)', textAlign: 'center', minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>
                  <InfoTip text={c.tip}>{c.label}</InfoTip>
                </p>
                <p className="tnum" style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-title)', color: c.value === 0 ? 'var(--color-muted)' : c.color, margin: 0, lineHeight: 1.1 }}>
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
              {/* The grid and its tally in one column: the strip counts the
                  squares above it, so it sits under them. It used to head the
                  other column, which left this one ending ~100px short of it. */}
              <div className="cv-adherence-grid">
              <ComplianceHeatmap
                logsByDate={heatmapData}
                calorieTarget={clientTargets.calories}
                weeks={ADHERENCE_WEEKS}
                grain={grain}
              />
              <ComplianceSummary
                logsByDate={heatmapData}
                calorieTarget={clientTargets.calories}
                variant="coach"
                windowDays={ADHERENCE_DAYS}
                bare
              />
              </div>
              <div className="cv-adherence-reads">
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
                    <Reveal open={open}>
                      <div style={{ padding: '0 0 var(--space-16)', maxWidth: '68ch' }}>
                        <ReportProse content={r.content} />
                      </div>
                    </Reveal>
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
          {/* 720px at most: on a laptop a calorie field 740px wide is a long
              way for a four-digit number, and the eye loses the row. */}
          <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column' }}>
          {/* The switch right after its label on one line, the way "By target"
              sits in Daily metrics' header, with the explanation under both;
              not at the far end of a 720px row where the eye has to travel to
              pair them. */}
          <div style={{ padding: 'var(--space-12) 0', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-10)' }}>
              <p style={{ fontWeight: 'var(--weight-semibold)', margin: 0 }}>Hide calories from client</p>
              <Switch checked={hideCaloriesToggle} onChange={toggleHideCalories} label="Hide calories from client" />
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 'var(--space-4) 0 0' }}>
              For clients who shouldn't see numbers.
            </p>
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
                    // The latest weigh-in, in the calculator's units, so the
                    // coach is not asked for a number the client logs daily.
                    // And the pace the client's goal implies, as setup uses.
                    weight: (() => {
                      const last = weightHistory[weightHistory.length - 1]
                      if (!last) return undefined
                      const to = (clientProfile?.unit_preference || (clientTargets.weight_goal_unit === 'kg' ? 'metric' : 'imperial')) === 'metric' ? 'kg' : 'lbs'
                      return Math.round(convertWeight(last.weight, normUnit(last.unit), to) * 10) / 10
                    })(),
                    pace: PACE_FOR_GOAL[clientGoal] || undefined,
                  }}
                  onApply={(t) => {
                    setClientTargets(prev => ({ ...prev, calories: String(t.calories), protein: String(t.protein), carbs: String(t.carbs), fat: String(t.fat) }))
                    setShowTargetCalc(false)
                  }}
                />
              </div>
            )}
          </div>
          {/* Two groups, as the client sees them on Today: the four nutrition
              numbers with the macros' own total beneath them, then activity. */}
          {[
            [{ label: 'Calories', key: 'calories', placeholder: 'e.g. 2000' },
              { label: 'Protein (g)', key: 'protein', placeholder: 'e.g. 150' },
              { label: 'Carbs (g)', key: 'carbs', placeholder: 'e.g. 200' },
              { label: 'Fat (g)', key: 'fat', placeholder: 'e.g. 65' }],
            [{ label: 'Cardio (min/day)', key: 'cardio_minutes', placeholder: 'e.g. 30' },
              { label: 'Steps/day', key: 'steps', placeholder: 'e.g. 10000' }],
          ].map((group, gi) => (
            <Fragment key={gi}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-12)' }}>
                {group.map(f => (
                  /* ui/Field, not a local input. These had drifted from
                     controlStyle on both axes the primitive exists to hold still:
                     10px 14px against its 10px 12px, and --text-body against
                     its --text-base. */
                  <Field
                    key={f.key}
                    label={f.label}
                    type="number"
                    inputMode="numeric"
                    placeholder={f.placeholder}
                    value={clientTargets[f.key]}
                    error={targetCheck.errors[f.key]}
                    aria-invalid={Boolean(targetCheck.errors[f.key])}
                    onChange={(e) => setClientTargets({ ...clientTargets, [f.key]: e.target.value })}
                  />
                ))}
              </div>
              {/* The macros' own total, under the macros, so calories and
                  macros cannot quietly disagree. A note, not an error: a coach
                  may round on purpose. */}
              {gi === 0 && targetCheck.macroCalories != null && (
                <p style={{ margin: '0 0 var(--space-8)', fontSize: 'var(--text-sm)', color: targetCheck.mismatch ? 'var(--color-warning)' : 'var(--color-muted)' }}>
                  {targetCheck.mismatch
                    ? <>Macros add up to {targetCheck.macroCalories.toLocaleString()} cal, not {Number(clientTargets.calories).toLocaleString()}. <button type="button" className="ds-control" onClick={() => setClientTargets(prev => ({ ...prev, calories: String(targetCheck.macroCalories) }))} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--color-primary)', fontWeight: 'var(--weight-medium)', cursor: 'pointer' }}>Use {targetCheck.macroCalories.toLocaleString()}</button></>
                    : `Macros add up to ${targetCheck.macroCalories.toLocaleString()} cal`}
                </p>
              )}
            </Fragment>
          ))}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', color: 'var(--color-muted)' }}>Weight goal</p>
            <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
              <Field
                type="number"
                placeholder="e.g. 175"
                aria-label="Weight goal"
                value={clientTargets.weight_goal}
                onChange={(e) => setClientTargets({ ...clientTargets, weight_goal: e.target.value })}
                /* `min-width: 0` is the whole fix. A flex item defaults to
                   min-width:auto and a number input's intrinsic minimum is
                   wide — this one measured 221px — so `flex: 1` could not
                   shrink it, and at 360 it pushed the unit select 20px past
                   the card. The same note already sits on .cv-checkin-config
                   for the same reason. */
                style={{ flex: 1, width: 'auto', minWidth: 0 }}
              />
              <Select
                value={clientTargets.weight_goal_unit}
                aria-label="Weight goal unit"
                onChange={(e) => {
                  const unit = e.target.value
                  setClientTargets(prev => ({ ...prev, weight_goal_unit: unit, weight_goal: convertGoalValue(prev.weight_goal, prev.weight_goal_unit, unit) }))
                }}
                /* And the select never gives up its 80px: it is the narrower
                   of the two and the one carrying a dropdown arrow. */
                style={{ width: '80px', flexShrink: 0, cursor: 'pointer' }}
              >
                <option value="lbs">lb</option>
                <option value="kg">kg</option>
              </Select>
            </div>
            {targetCheck.errors.weight_goal && (
              <p style={{ margin: 'var(--space-6) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>{targetCheck.errors.weight_goal}</p>
            )}
          </div>
          <div style={{ marginTop: 'var(--space-12)' }}>
            <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-6)', color: 'var(--color-muted)' }}>Primary goal</p>
            {/* One axis, scrolled — not wrapped. Four chips wrap to 3 + 1 on a
                phone, which reads as two groups of goals rather than one list
                of four. The roster's lens bar already made this call; this is
                the same control in the same situation. */}
            <div className="ds-chipstrip" role="group" aria-label="Primary goal">
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
              {clientFirstName} sees this but can't change it.
            </p>
          </div>
          <div style={{ marginTop: 'var(--space-8)' }}>
            {/* Muted until something changed, as the client's own Daily
                targets page does; never pressable over an invalid field. */}
            <Button
              onClick={saveClientTargets}
              variant={targetsDirty ? 'primary' : 'muted'}
              size="sm"
              disabled={!targetsDirty || Object.keys(targetCheck.errors).length > 0}
              loading={targetsSaving}
            >
              {targetsSaved ? <>Saved <Icon name="check" /></> : 'Save targets'}
            </Button>
          </div>
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
              {dayComplete ? <><Icon name="check" /> Day complete</> : 'Not marked complete. Totals may be partial.'}
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
                    <span className="tnum" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{num(group.calories)} kcal</span>
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
                        <span className="tnum" style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-base)' }}>{num(item.calories)} <span style={{ fontWeight: 'var(--weight-normal)', color: 'var(--color-muted)' }}>kcal</span></span>
                      </div>
                      {item.entries.map((entry) => (
                        <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                          <span>{entry.food}</span>
                          <span className="tnum">{num(entry.calories)} kcal · {entry.protein}g P · {formatServing(entry.serving_size, entry.serving_unit)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* The client's own Today row, so coach and client read
                       one entry the same way: the food and its calories on
                       the first line, the serving and macros under it. The
                       calories were primary green here and "kcal" there. */
                    <div key={item.entry.id} className="ds-row" style={{ padding: 'var(--space-12) 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-12)' }}>
                        <span style={{ fontWeight: 'var(--weight-medium)', minWidth: 0 }}>{item.entry.food}</span>
                        <span className="tnum" style={{ fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap' }}>{num(item.entry.calories)} <span style={{ fontWeight: 'var(--weight-normal)', color: 'var(--color-muted)' }}>kcal</span></span>
                      </div>
                      <span className="tnum" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                        {formatServing(item.entry.serving_size, item.entry.serving_unit)} · {num(item.entry.protein)}g P · {num(item.entry.carbs)}g C · {num(item.entry.fat)}g F
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </SectionHeader>
      </div>

      {/* Triage first: on a phone, a check-in waiting on the coach is the work
          on their desk, so it sits straight under the header (CSS order; the
          header and back bar are pinned above it in index.css) instead of two
          screens down under the day's stats and the adherence analysis. */}
      <div key="checkIn" id="section-checkIn" style={sectionStyle('checkIn', !hasRail && !section && clientCheckIn && !clientCheckIn.reviewed_at ? { order: -1 } : undefined)}>
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
          /* The section's settings, out of the way of the check-in itself:
             the request, the schedule and the questions, behind one ⋯ in
             the corner. They were a standing row of three controls under
             every check-in a coach reads. */
          menu={(
            <button type="button" className="rost-m-more ds-control" onClick={() => setCheckinMenuOpen(true)} aria-label="Check-in options">
              <Icon name="more" />
            </button>
          )}
          badgeTone={railMeta.checkIn?.metaTone === 'success' ? 'soft' : 'solid'}
          badgeColor={railMeta.checkIn?.metaTone === 'success' ? 'var(--color-success)' : 'var(--color-warning)'}
        >
          {/* A flex column purely so the two halves can swap order on a phone:
              the cadence chips and the questionnaire link are CONFIGURATION, and
              they were sitting above the thing they configure. On a narrow screen
              four wrapped chips took more of the box than the check-in did. */}
          <div className="cv-checkin">
          {/* The check-in itself lives in CheckinReview, shared with the
              review queue — see that file for what stayed here and why.
              NO footer here, deliberately. Reviewing from /check-ins is
              draining a list, and the next one belongs under it; opening a
              client's record is about THAT client, and being pushed at
              somebody else afterwards is a different job starting itself. The
              chain lives on the queue page, which is the surface that means
              it. */}
          {/* Keyed for the reason the queue's copy is: react-router keeps this
              page mounted when only :clientId changes, so going from one
              client to another (from the bell, say) would otherwise carry the
              half-typed comment across. */}
          {/* An open request, as a line in the card rather than a tag on the
              title, where it crowded the heading. */}
          {checkinRequestOpen && (
            <p style={{ margin: '0 0 var(--space-8)', fontSize: 'var(--text-sm)', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <Icon name="message" size={14} />
              You asked for a new check-in on {shortDay(toLocalDateString(new Date(checkinRequestedAt)))}.
            </p>
          )}
          <CheckinReview
            key={clientCheckIn?.id}
            checkIn={clientCheckIn}
            clientId={clientId}
            intervalWeeks={checkinInterval}
            weightUnit={weightDisplayUnit}
            current={checkinCurrent}
            reviewing={reviewing}
            onReview={reviewCheckIn}
          />
          {/* The ones before it, a row each, opening in place. A coach reads
              this week's answers against the last few; with only the latest
              on the record they had nothing to read them against. */}
          {/* Each rating across the recent check-ins, Coachway's "ratings
              become charts": an energy score sliding 8, 7, 5, 4 is the signal,
              and as rows of text it had to be read off one week at a time.
              The whole 1-10 scale, so a 7 sits where a 7 sits. */}
          {(() => {
            const run = [...checkinHistory.slice(0, 7)].reverse().concat(clientCheckIn ? [clientCheckIn] : [])
            if (run.length < 3) return null
            const rows = checkinRatings(clientCheckIn).map(r => ({
              ...r,
              points: run.map(c => checkinRatings(c).find(x => x.id === r.id)?.value).filter(v => v != null),
            })).filter(r => r.points.length >= 2)
            if (!rows.length) return null
            return (
              <div>
                <p className="ds-colhead" style={{ margin: 'var(--space-16) 0 var(--space-4)' }}>Trend · last {run.length} check-ins</p>
                {rows.map(r => (
                  <div key={r.id} className="ci-trend">
                    <span className="ci-trend-label">{r.label}</span>
                    <Sparkline points={r.points} domain={[1, 10]} color="var(--color-primary)" width={96} height={24} />
                    <span className="ci-trend-value tnum">{r.value}<span style={{ fontWeight: 'var(--weight-normal)', color: 'var(--color-muted)' }}>/10</span></span>
                  </div>
                ))}
              </div>
            )
          })()}
          {checkinHistory.length > 0 && (
            <div className="cv-ci-past">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 'var(--space-16) 0 var(--space-4)' }}>
                <p className="ds-colhead" style={{ margin: 0 }}>Earlier</p>
                {clientCheckIn && <Button onClick={() => setCompareOpen(true)} variant="ghost" size="sm">Compare</Button>}
              </div>
              {/* The four most recent, then the rest in their own list: ten
                  rows here made the check-in card a long scroll. The same
                  call the sent reports make ("All reports"). */}
              {checkinHistory.slice(0, CHECKINS_ON_PAGE).map(renderPastCheckin)}
              {(checkinHistory.length > CHECKINS_ON_PAGE || checkinMore) && (
                <div style={{ paddingTop: 'var(--space-8)' }}>
                  <Button onClick={() => setCheckinArchiveOpen(true)} variant="muted" size="sm">All check-ins</Button>
                </div>
              )}
            </div>
          )}
          </div>
        </SectionHeader>
      </div>

      <div key="privateNotes" id="section-privateNotes" style={sectionStyle('privateNotes')}>
        <SectionHeader title="Private notes" collapsed={isCollapsed('privateNotes')} onToggle={sectionToggle('privateNotes')}>
            {/* 720px at most, like Targets: a note is prose, and prose across a
                1,800px line is hard to follow back to the next line. */}
            <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            {/* Add first, history under it: a note is written far more often
                than the old ones are reread, and the newest lands right under
                the box it was typed in. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
              <Textarea
                value={newNoteEntry}
                onChange={(e) => setNewNoteEntry(e.target.value)}
                placeholder="Add a note…"
                rows={3}
                maxLength={NOTE_MAX}
                aria-label="Add a note"
                style={{ lineHeight: '1.6', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                <Button onClick={addNote} variant="primary" size="sm" loading={addingNote} disabled={!newNoteEntry.trim() || addingNote}>Add note</Button>
                {/* Only near the limit: a counter on every keystroke is noise. */}
                {newNoteEntry.length > NOTE_MAX - 500 && (
                  <span className="tnum" style={{ fontSize: 'var(--text-xs)', color: newNoteEntry.length >= NOTE_MAX ? 'var(--color-warning)' : 'var(--color-muted)' }}>
                    {(NOTE_MAX - newNoteEntry.length).toLocaleString()} left
                  </span>
                )}
              </div>
            </div>
            {/* One note per row, separated by space, not rules: a hairline
                under every note cut the list into strips. A long note shows
                six lines until opened; the list shows ten until asked. */}
            {notes === null ? (
              <Skeleton height="64px" />
            ) : (notes.length > 0 || flaggedNotes.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-20)', marginTop: 'var(--space-8)' }}>
                {/* The roster's search field. Only once there is something to
                    search: below a page of notes, scrolling is faster. */}
                {(notesMore || notes.length + flaggedNotes.length > 5 || noteQuery) && (
                  <label className="rost-search cv-note-search">
                    <Icon name="search" size={15} />
                    <input type="search" placeholder="Search notes" aria-label="Search notes" value={noteQuery}
                      onChange={(e) => { setNoteQuery(e.target.value); if (!e.target.value.trim()) setNoteResults(null) }} />
                  </label>
                )}
                {noteQuery.trim() ? (
                  noteResults === null ? <Skeleton height="48px" /> : (
                    <>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', margin: 0 }} aria-live="polite">
                        {noteResults.length === 0 ? 'No notes match.' : `${noteResults.length === 50 ? '50+' : noteResults.length} note${noteResults.length === 1 ? '' : 's'}`}
                      </p>
                      {noteResults.map(renderNote)}
                    </>
                  )
                ) : (
                  <>
                    {/* Flagged first, under their own caption, the way
                        Trainerize floats a flagged note to the top. */}
                    {flaggedNotes.length > 0 && <p className="ds-colhead" style={{ margin: 0 }}>Flagged</p>}
                    {flaggedNotes.slice(0, FLAGS_ON_PAGE).map(renderNote)}
                    {flaggedNotes.length > FLAGS_ON_PAGE && <div>{moreFlagged(flaggedNotes.length - FLAGS_ON_PAGE)}</div>}
                    {flaggedNotes.length > 0 && notes.length > 0 && <p className="ds-colhead" style={{ margin: 'var(--space-4) 0 0' }}>Notes</p>}
                    {notes.slice(0, NOTES_ON_PAGE).map(renderNote)}
                    {(notes.length > NOTES_ON_PAGE || notesMore) && (
                      <div>
                        <Button onClick={() => setNoteArchiveOpen(true)} variant="muted" size="sm">All notes</Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
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
                          Weight <span style={{ color: 'var(--color-faint)' }}>({unitLabel(weightDisplayUnit)})</span>
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
                {compact && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'calc(-1 * var(--space-8))' }}>
                    <ChartColorToggle plain={plainCharts.has('dailyMetrics')} onToggle={() => togglePlain('dailyMetrics')} />
                  </div>
                )}
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
                      {hasValues(history, m.valueKey) ? (
                        <div style={{ height: '150px' }}>
                          <Bar data={m.data(history)} options={stackedMetricOptions(isLast)} />
                        </div>
                      ) : chartEmpty(m.empty, `${clientFirstName} logs this on their Today tab.`)}
                    </div>
                  )
                  })
                })()}
              </div>
            )}
          </SectionHeader>
        </div>
      )}

      <div key="photos" id="section-photos" style={sectionStyle('photos')}>
        <SectionHeader
          title="Progress photos"
          collapsed={isCollapsed('photos')}
          onToggle={sectionToggle('photos')}
          /* Measurements' Request, for photos: emails the client to take a
             new set (same 48-hour cooldown as every nudge). */
          action={(
            <Button onClick={() => nudgeClient({ key: 'photos' })} variant="muted" size="sm" disabled={nudging}>
              {nudging ? 'Sending…' : 'Request'}
            </Button>
          )}
        >
          {!isCollapsed('photos') && (
            <PhotoCompare key={clientId} userId={clientId} unit={weightDisplayUnit}
              emptyText={`${clientFirstName} adds these in their check-in or on their Today tab.`}
              canExport={Boolean(clientProfile?.share_progress_photos)}
              onToast={showToast} />
          )}
        </SectionHeader>
      </div>

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
              ? chartEmpty("No measurements yet", `${clientFirstName} adds these on their Today tab.`)
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
        {/* Pause before Offboard: the gentle option first, the one that
            cannot be undone last. Pause lived only in the header's ⋯, so the
            section a coach opens to manage the relationship offered the
            permanent action and not the temporary one. */}
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
          {rel?.pausedUntil
            ? `Paused until ${shortDay(rel.pausedUntil)}. Resumes by itself.`
            : 'Pause for a holiday or injury: no grades, nudges or check-in reminders until it ends.'}
        </p>
        <div>
          {rel?.pausedUntil
            ? <Button onClick={resumeCoaching} variant="muted" size="sm">Resume coaching</Button>
            : <Button onClick={() => setPauseOpen(true)} variant="muted" size="sm">Pause coaching</Button>}
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginTop: 'var(--space-8)' }}>
          Offboarding ends coaching. {clientFirstName} keeps their data and continues solo.
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
      {triagePanel}
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
                  <Reveal open={open}>
                    <div style={{ padding: 'var(--space-8) 0 var(--space-16)' }}>
                      <ReportProse content={r.content} />
                    </div>
                  </Reveal>
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
      hideLauncher={hasPanel}
      onMarkRead={markMessagesRead}
      hasOlder={hasOlderMessages(messageTotal, messages.length)}
      onLoadOlder={loadOlderMessages}
      loadingOlder={loadingOlderMessages}
    />
    <ActionSheet
      open={menuOpen}
      title={clientProfile?.full_name}
      onClose={() => setMenuOpen(false)}
      actions={[
        rel?.pausedUntil
          ? { label: 'Resume coaching', icon: 'repeat', onSelect: resumeCoaching }
          : { label: 'Pause coaching', icon: 'calendar', onSelect: () => setPauseOpen(true) },
        { label: 'Groups', icon: 'grip', onSelect: () => setGroupsOpen(true) },
      ]}
    />
    <ActionSheet
      open={Boolean(noteMenu)}
      title="Note"
      onClose={() => setNoteMenu(null)}
      actions={noteMenu ? [
        { label: noteMenu.flagged ? 'Remove flag' : 'Flag', icon: 'flag', onSelect: () => toggleFlag(noteMenu) },
        { label: 'Edit', icon: 'pencil', onSelect: () => setEditingNote({ id: noteMenu.id, body: noteMenu.body }) },
        { label: 'Delete', icon: 'trash', destructive: true, onSelect: () => deleteNote(noteMenu) },
      ] : []}
    />
    {/* Every note, over the record: the page keeps five. Flagged stay on
        top under their own caption, as on the page. */}
    <Modal open={noteArchiveOpen} title="All notes" onClose={() => setNoteArchiveOpen(false)} maxWidth={640} sheet tall>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-20)' }}>
        {flaggedNotes.length > 0 && <p className="ds-colhead" style={{ margin: 0 }}>Flagged</p>}
        {flaggedNotes.map(renderNote)}
        {flaggedNotes.length > 0 && notes?.length > 0 && <p className="ds-colhead" style={{ margin: 'var(--space-4) 0 0' }}>Notes</p>}
        {(notes || []).map(renderNote)}
        {notesMore && (
          <div>
            <Button onClick={() => fetchNotes({ older: true })} variant="ghost" size="sm">Show older</Button>
          </div>
        )}
      </div>
    </Modal>
    <ActionSheet
      open={checkinMenuOpen}
      title="Check-in"
      onClose={() => setCheckinMenuOpen(false)}
      actions={[
        { label: 'Request check-in', icon: 'message', onSelect: requestCheckin },
        { label: 'Schedule', icon: 'calendar', onSelect: () => { setPendingSchedule(null); setScheduleOpen(true) } },
        { label: 'Edit questions', icon: 'pencil', onSelect: () => setQuestionsOpen(true) },
      ]}
    />
    {/* The questions, from the bottom like the menu that opened them, over
        the record rather than a jump to Profile: a coach editing a question
        mid-review stays on the client they were reading. The same editor
        Profile uses. */}
    <Modal open={questionsOpen} title="Check-in questions" onClose={() => setQuestionsOpen(false)} maxWidth={640} sheet tall>
      {questionsOpen && <CheckinBuilder coachId={profile.id} />}
    </Modal>
    {/* The schedule: how often and which day, staged and confirmed here, with
        what the change means for the client spelled out before it is saved. */}
    <Modal open={scheduleOpen} title="Check-in schedule" onClose={() => { setScheduleOpen(false); setPendingSchedule(null) }} maxWidth={440} sheet>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
        {touch ? (
          /* Two wheels side by side, the iOS picker with columns: on a phone
             the schedule is set right here, not through two fields that each
             open a wheel of their own. */
          (() => {
            const cols = [
              ['Frequency', CADENCE_OPTIONS.map(o => ({ value: String(o.weeks), label: o.label })), String(pendingSchedule?.weeks ?? checkinInterval), (v) => stageSchedule({ weeks: Number(v) })],
              ['Due', WEEKDAYS.map((d, i) => ({ value: String(i), label: d })), String(pendingSchedule?.weekday ?? checkinWeekday), (v) => stageSchedule({ weekday: Number(v) })],
            ]
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  {cols.map(([label]) => <span key={label} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', textAlign: 'center' }}>{label}</span>)}
                </div>
                {/* One band across both columns, as iOS draws it. */}
                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="wheel-band" aria-hidden="true" style={{ top: 80, height: 40 }} />
                  {cols.map(([label, opts, val, set]) => (
                    <Wheel key={label} label={label} band={false} options={opts} index={Math.max(0, opts.findIndex(o => o.value === val))} onIndex={(i) => set(opts[i].value)} />
                  ))}
                </div>
              </div>
            )
          })()
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
          <Select label="Frequency" value={pendingSchedule?.weeks ?? checkinInterval} disabled={savingCadence}
            onChange={(e) => stageSchedule({ weeks: Number(e.target.value) })}>
            {CADENCE_OPTIONS.map(opt => <option key={opt.weeks} value={opt.weeks}>{opt.label}</option>)}
          </Select>
          <Select label="Due on" value={pendingSchedule?.weekday ?? checkinWeekday} disabled={savingCadence}
            onChange={(e) => stageSchedule({ weekday: Number(e.target.value) })}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </Select>
        </div>
        )}
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
          {pendingSchedule ? (
            <>
              From <strong style={{ color: 'var(--color-text)' }}>{scheduleLabel(checkinInterval, checkinWeekday)}</strong> to{' '}
              <strong style={{ color: 'var(--color-text)' }}>{scheduleLabel(pendingSchedule.weeks, pendingSchedule.weekday)}</strong>. {clientFirstName} will be told.
              {(() => {
                // Say it when the move makes the check-in due today or
                // tomorrow: the client was told one day and now owes it at
                // once. Request covers a sooner one without moving the day.
                const p = checkinPeriod(pendingSchedule.weeks, new Date(), pendingSchedule.weekday)
                const daysLeft = p.intervalWeeks * 7 - 1 - p.daysIn
                if (daysLeft > 1 || coversPeriod(clientCheckIn, p)) return null
                return <> <strong style={{ color: 'var(--color-warning)' }}>The check-in becomes due {daysLeft === 0 ? 'today' : 'tomorrow'}.</strong></>
              })()}
            </>
          ) : `${clientFirstName} checks in ${cadenceLabel(checkinInterval).toLowerCase()}, due ${WEEKDAYS[checkinWeekday]}s.`}
        </p>
        <Button variant="primary" style={{ width: '100%' }} disabled={!pendingSchedule || savingCadence} loading={savingCadence}
          onClick={async () => { if (await updateSchedule(pendingSchedule)) setScheduleOpen(false) }}>Save</Button>
      </div>
    </Modal>
    {/* Every earlier check-in, over the record: the page keeps four. */}
    <Modal open={checkinArchiveOpen} title="All check-ins" onClose={() => setCheckinArchiveOpen(false)} maxWidth={640} sheet tall>
      <div className="cv-ci-sheet">
        {checkinHistory.map(renderPastCheckin)}
        {checkinMore && (
          <div style={{ paddingTop: 'var(--space-12)' }}>
            <Button onClick={() => fetchClientCheckIn({ older: true })} variant="ghost" size="sm">Show older</Button>
          </div>
        )}
      </div>
    </Modal>
    <CheckinCompare
      open={compareOpen}
      onClose={() => setCompareOpen(false)}
      checkIns={[clientCheckIn, ...checkinHistory].filter(Boolean)}
      clientId={clientId}
      intervalWeeks={checkinInterval}
      weightUnit={weightDisplayUnit}
    />
    <PauseSheet open={pauseOpen} name={clientProfile?.full_name} onClose={() => setPauseOpen(false)} onSave={savePause} />
    <GroupsSheet open={groupsOpen} clientId={clientId} api={groupApi} onClose={() => setGroupsOpen(false)} />
    <Toast message={toast.message} type={toast.type} action={toast.action} onClose={() => setToast({ message: '', type: 'success' })} />
    </>
  )
}

export default ClientView
