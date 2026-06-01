import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import Toast from '../components/Toast'
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
  Legend
} from 'chart.js'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend
)

function SectionHeader({ title, collapsed, onToggle, badge, children, animated = true }) {
  return (
    <>
      <div
        onClick={onToggle}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {badge && (
            <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>{badge}</span>
          )}
        </div>
        <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {animated ? (
        <div style={{
          display: 'grid',
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          transition: 'grid-template-rows 0.25s ease',
          overflow: 'hidden',
        }}>
          <div style={{ minHeight: 0 }}>{children}</div>
        </div>
      ) : (
        !collapsed && <div style={{ paddingTop: '8px' }}>{children}</div>
      )}
    </>
  )
}

function toLocalDateString(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

function ClientView({ profile }) {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))
  const [clientProfile, setClientProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [weightEntry, setWeightEntry] = useState(null)
  const [report, setReport] = useState('')
  const [reportLoading, setReportLoading] = useState(false)
  const [weightHistory, setWeightHistory] = useState([])
  const [calorieHistory, setCalorieHistory] = useState([])
  const [cardioHistory, setCardioHistory] = useState([])
  const [stepsHistory, setStepsHistory] = useState([])
  const [clientTargets, setClientTargets] = useState({
    calories: '', protein: '', carbs: '', fat: '',
    cardio_minutes: '', steps: '', weight_goal: '', weight_goal_unit: 'lbs'
  })
  const [targetsSaved, setTargetsSaved] = useState(false)
  const [clientCheckIn, setClientCheckIn] = useState(null)
  const [coachNotes, setCoachNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [consistency, setConsistency] = useState({ streak: 0, days7: 0, days30: 0 })
  const [sentReports, setSentReports] = useState([])
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [messageSending, setMessageSending] = useState(false)
  const [callBriefing, setCallBriefing] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [aiToolsCollapsed, setAiToolsCollapsed] = useState(false)
  const [clientMessages, setClientMessages] = useState([])
  const [openClientReactId, setOpenClientReactId] = useState(null)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    stats: false,
    consistency: false,
    messages: false,
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

  function toggleSection(key) {
    setSectionsCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  useEffect(() => {
  fetchClientProfile()
  fetchWeightHistory()
  fetchCalorieHistory()
  fetchCardioHistory()
  fetchStepsHistory()
  fetchClientTargets()
  fetchClientCheckIn()
  fetchCoachNotes()
  fetchConsistency()
  fetchSentReports()
  fetchMessages()
  fetchClientMessages()
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

  async function fetchEntries() {
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
      .maybeSingle()
    if (error) console.error('Error fetching weight:', error)
    else setWeightEntry(data)
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
  start.setDate(start.getDate() - 13)
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
  start.setDate(start.getDate() - 13)
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
  start.setDate(start.getDate() - 13)
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

  async function fetchClientCheckIn() {
  const weekOf = toLocalDateString(new Date(new Date().setDate(new Date().getDate() - new Date().getDay())))
  const { data, error } = await supabase
    .from('check_ins')
    .select('*')
    .eq('client_id', clientId)
    .eq('week_of', weekOf)
    .maybeSingle()
  if (error) console.error(error)
  else setClientCheckIn(data)
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
    .gte('logged_date', toLocalDateString(new Date(new Date().setDate(new Date().getDate() - 30))))
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

  let streak = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    if (loggedDates.includes(toLocalDateString(d))) streak++
    else break
  }

  setConsistency({ streak, days7, days30 })
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

    const { data: { session } } = await supabase.auth.getSession()

    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(toLocalDateString(d))
    }

    const { data: nutritionData } = await supabase
      .from('nutrition_log').select('*').eq('user_id', clientId).in('logged_date', days)

    const { data: weightData } = await supabase
      .from('weight_log').select('*').eq('user_id', clientId).in('logged_date', days)

    const { data: cardioData } = await supabase
      .from('cardio_log').select('*').eq('user_id', clientId).in('logged_date', days)

    const { data: stepsData } = await supabase
      .from('steps_log').select('*').eq('user_id', clientId).in('logged_date', days)

    const weekOf = toLocalDateString(new Date(new Date().setDate(new Date().getDate() - new Date().getDay())))
    const { data: checkInData } = await supabase
      .from('check_ins').select('*').eq('client_id', clientId).eq('week_of', weekOf).maybeSingle()

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
          clientName: clientProfile?.full_name || 'Client',
          weekData,
          checkIn: checkInData ? {
            adherence: checkInData.adherence_rating,
            energy: checkInData.energy_level,
            obstacles: checkInData.obstacles,
            notes: checkInData.notes
          } : null
        }),
      }
    )

    const data = await response.json()
    setReport(data.report || data.error || 'Failed to generate report.')
    setReportLoading(false)
  }

  async function sendReport() {
    const { data: { session } } = await supabase.auth.getSession()

    const weekOf = toLocalDateString(new Date(
      new Date().setDate(new Date().getDate() - 6)
    ))

    const { error } = await supabase
      .from('reports')
      .insert([{
        coach_id: session.user.id,
        client_id: clientId,
        content: report,
        week_of: weekOf
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
          clientEmail: clientProfile.email,
          clientName: clientProfile.full_name || 'there',
          coachName: profile?.full_name || 'Your coach',
          weekOf
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

    const weekOf = toLocalDateString(new Date(new Date().setDate(new Date().getDate() - new Date().getDay())))
    const { data: checkInData } = await supabase
      .from('check_ins').select('*').eq('client_id', clientId).eq('week_of', weekOf).maybeSingle()

    const { data: messagesData } = await supabase
      .from('coach_messages').select('content, reaction, created_at')
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

    const response = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/call-prep',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clientName: clientProfile?.full_name || 'Client',
          weekData,
          checkIn: checkInData ? {
            adherence: checkInData.adherence_rating,
            energy: checkInData.energy_level,
            obstacles: checkInData.obstacles,
            notes: checkInData.notes
          } : null,
          privateNotes: coachNotes,
          recentMessages: messagesData || []
        }),
      }
    )

    const data = await response.json()
    setCallBriefing(data.briefing || data.error || 'Failed to generate briefing.')
    setBriefingLoading(false)
  }

  async function fetchMessages() {
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const { data, error } = await supabase
    .from('coach_messages')
    .select('*')
    .eq('coach_id', currentSession.user.id)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) console.error(error)
  else setMessages(data)
}

async function fetchClientMessages() {
  const { data, error } = await supabase
    .from('client_messages')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
  if (error) console.error(error)
  else {
    setClientMessages(data)
    const unreadIds = data.filter(m => !m.read_at).map(m => m.id)
    if (unreadIds.length > 0) {
      await supabase.from('client_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds)
    }
  }
}

async function reactToClientMessage(messageId, emoji) {
  const { error } = await supabase
    .from('client_messages')
    .update({ reaction: emoji })
    .eq('id', messageId)
  if (error) console.error(error)
  else fetchClientMessages()
}

async function sendMessage() {
  if (!newMessage.trim()) return
  setMessageSending(true)
  const { data: { session: currentSession } } = await supabase.auth.getSession()
  const { error } = await supabase.from('coach_messages').insert([{
    coach_id: currentSession.user.id,
    client_id: clientId,
    content: newMessage.trim()
  }])
  if (error) console.error(error)
  else { setNewMessage(''); fetchMessages() }
  setMessageSending(false)
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
    const d = new Date(selectedDate)
    d.setDate(d.getDate() - 1)
    setSelectedDate(toLocalDateString(d))
  }

  function goToNextDay() {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + 1)
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
        borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,0.1)',
        tension: 0.3, fill: false, yAxisID: 'yWeight', pointRadius: 3, spanGaps: true,
      })
    }

    if (calorieHistory.length > 0 && calTarget) {
      datasets.push({
        type: 'bar', label: 'Calories %',
        data: allDates.map(date => {
          const cal = calorieHistory.find(d => d.date === date)?.calories
          return cal ? Math.round((cal / calTarget) * 100) : null
        }),
        backgroundColor: 'rgba(251,191,36,0.5)', borderColor: '#fbbf24',
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
        backgroundColor: 'rgba(167,139,250,0.5)', borderColor: '#a78bfa',
        borderWidth: 1, borderRadius: 3, yAxisID: 'yPct',
      })
    }

    return { labels: allDates, datasets }
  }

  const correlatedChartOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { display: true, labels: { color: '#888', boxWidth: 12, padding: 16 } },
      tooltip: {
        backgroundColor: '#1a1a1a', borderColor: '#2a2a2a', borderWidth: 1,
        titleColor: '#f0f0f0', bodyColor: '#888', padding: 10, cornerRadius: 6,
      }
    },
    scales: {
      x: { ticks: { color: '#888' }, grid: { color: '#2a2a2a' } },
      yWeight: {
        type: 'linear', position: 'left',
        ticks: { color: '#4f8ef7' }, grid: { color: '#2a2a2a' },
      },
      yPct: {
        type: 'linear', position: 'right', min: 0, max: 150,
        ticks: { color: '#888', callback: (v) => `${v}%` },
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

  const chartOptions = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a1a',
        borderColor: '#2a2a2a',
        borderWidth: 1,
        titleColor: '#f0f0f0',
        bodyColor: '#888',
        padding: 10,
        cornerRadius: 6,
        displayColors: false,
      }
    },
    scales: {
      x: { ticks: { color: '#888' }, grid: { color: '#2a2a2a' } },
      y: { ticks: { color: '#888' }, grid: { color: '#2a2a2a' } }
    }
  }

  return (
    <>
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Button onClick={() => navigate('/')} variant="ghost" size="sm">← Back</Button>
        <div>
          <h1>{clientProfile?.full_name || 'Client'}</h1>
          <p style={{ fontSize: '0.875rem', marginTop: '2px' }}>{clientProfile?.email}</p>
        </div>
      </div>

      {/* AI Tools */}
      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          onClick={() => setAiToolsCollapsed(!aiToolsCollapsed)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0 }}>AI tools</h2>
            <span style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', border: '1px solid #a78bfa' }}>Coach only</span>
          </div>
          <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>{aiToolsCollapsed ? '▶' : '▼'}</span>
        </div>

        {!aiToolsCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Button onClick={generateCallPrep} variant="ai" loading={briefingLoading}>
                {briefingLoading ? 'Preparing...' : 'Prep for call'}
              </Button>

              <Button onClick={generateWeeklyReport} variant="outline" loading={reportLoading}>
                {reportLoading ? 'Generating...' : 'Generate weekly report'}
              </Button>
            </div>

            {callBriefing && (
              <div style={{ backgroundColor: 'var(--color-bg)', border: '1px solid #a78bfa', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontWeight: 600 }}>Call briefing — {clientProfile?.full_name}</p>
                  <Button onClick={() => setCallBriefing('')} variant="ghost" size="sm">Dismiss</Button>
                </div>
                <p style={{ fontSize: '0.65rem', color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Not visible to client</p>
                <pre style={{ color: 'var(--color-text)', fontSize: '0.875rem', lineHeight: '1.7', whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{callBriefing}</pre>
              </div>
            )}

            {report && (
              <div style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontWeight: 600 }}>Weekly Report</p>
                <textarea
                  value={report}
                  onChange={(e) => setReport(e.target.value)}
                  rows={20}
                  style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '14px', color: 'var(--color-text)', fontSize: '0.9rem', lineHeight: '1.7', resize: 'vertical', fontFamily: 'inherit', width: '100%' }}
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
          style={{ ...inputStyle, colorScheme: 'dark' }}
        />

        <Button onClick={goToNextDay} disabled={isToday} variant="muted" size="sm">→</Button>

        {!isToday && <Button onClick={() => setSelectedDate(toLocalDateString(new Date()))} variant="outline" size="sm">Today</Button>}
      </div>

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionHeader title="Today's stats" collapsed={sectionsCollapsed.stats} onToggle={() => toggleSection('stats')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <StatCard label="Calories" value={totals.calories} />
            <StatCard label="Protein" value={`${totals.protein}g`} />
            <StatCard label="Carbs" value={`${totals.carbs}g`} />
            <StatCard label="Fat" value={`${totals.fat}g`} />
            <StatCard label="Weight" value={weightEntry ? `${weightEntry.weight} ${weightEntry.unit}` : '—'} />
          </div>
        </SectionHeader>
      </div>

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionHeader title="Logging consistency" collapsed={sectionsCollapsed.consistency} onToggle={() => toggleSection('consistency')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Current streak</p>
              <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.streak > 0 ? '#34d399' : 'var(--color-muted)' }}>
                {consistency.streak}
                <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 400 }}> days</span>
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Last 7 days</p>
              <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.days7 >= 5 ? '#34d399' : consistency.days7 >= 3 ? 'var(--color-primary)' : '#f87171' }}>
                {consistency.days7}<span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 400 }}>/7</span>
              </p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Last 30 days</p>
              <p style={{ fontWeight: 700, fontSize: '1.5rem', color: consistency.days30 >= 20 ? '#34d399' : consistency.days30 >= 10 ? 'var(--color-primary)' : '#f87171' }}>
                {consistency.days30}<span style={{ fontSize: '0.875rem', color: 'var(--color-muted)', fontWeight: 400 }}>/30</span>
              </p>
            </div>
          </div>
        </SectionHeader>
      </div>

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionHeader
          title="Messages"
          collapsed={sectionsCollapsed.messages}
          onToggle={() => toggleSection('messages')}
          badge={clientMessages.some(m => !m.read_at) ? `${clientMessages.filter(m => !m.read_at).length} new from client` : null}
        >
            {clientMessages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {clientMessages.map(m => (
                  <div key={m.id} style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#34d399', backgroundColor: 'var(--color-border)', padding: '2px 6px', borderRadius: '999px', whiteSpace: 'nowrap', marginTop: '2px' }}>Client</span>
                          <p style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{m.content}</p>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginLeft: '44px' }}>
                          {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {!m.read_at && (
                          <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: '999px' }}>NEW</span>
                        )}
                        {m.reaction && <span style={{ fontSize: '1rem' }}>{m.reaction}</span>}
                        <button
                          onClick={() => setOpenClientReactId(openClientReactId === m.id ? null : m.id)}
                          style={{ backgroundColor: 'transparent', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--color-muted)' }}
                        >
                          {m.reaction ? '✎' : 'React +'}
                        </button>
                      </div>
                    </div>
                    {openClientReactId === m.id && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '6px', borderTop: '1px solid var(--color-border)' }}>
                        {['👍', '💪', '🔥', '🎯', '👎', '😔', '😰', '🤕', '😴'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => { reactToClientMessage(m.id, m.reaction === emoji ? null : emoji); setOpenClientReactId(null) }}
                            style={{ backgroundColor: m.reaction === emoji ? 'var(--color-border)' : 'transparent', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '1rem' }}
                          >
                            {emoji}
                          </button>
                        ))}
                        {m.reaction && (
                          <button
                            onClick={() => { reactToClientMessage(m.id, null); setOpenClientReactId(null) }}
                            style={{ backgroundColor: 'transparent', border: '1px solid #f87171', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.7rem', color: '#f87171', fontWeight: 600 }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {clientMessages.length > 0 && <div style={{ borderTop: '1px solid var(--color-border)' }} />}

            <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
              Send a message to {clientProfile?.full_name || 'client'}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Great work this week! Keep it up..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                style={{ flex: 1, backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '10px 14px', color: 'var(--color-text)', fontSize: '0.875rem' }}
              />
              <Button onClick={sendMessage} disabled={messageSending} variant="primary" loading={messageSending}>
                Send
              </Button>
            </div>

            {messages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                {messages.map(m => (
                  <div key={m.id} style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a78bfa', backgroundColor: 'var(--color-border)', padding: '2px 6px', borderRadius: '999px', whiteSpace: 'nowrap', marginTop: '2px' }}>You</span>
                        <p style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>{m.content}</p>
                      </div>
                      <p style={{ fontSize: '0.7rem', color: 'var(--color-muted)', marginLeft: '44px' }}>
                        {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {!m.read_at && <span style={{ marginLeft: '8px', color: '#fbbf24' }}>· Unread</span>}
                      </p>
                    </div>
                    {m.reaction && <span style={{ fontSize: '1.25rem' }}>{m.reaction}</span>}
                  </div>
                ))}
              </div>
            )}
        </SectionHeader>
      </div>

      {sentReports.length > 0 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SectionHeader title="Sent reports" collapsed={sectionsCollapsed.sentReports} onToggle={() => toggleSection('sentReports')}>
            {sentReports.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', border: '1px solid var(--color-border)' }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>Week of {r.week_of}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '2px' }}>
                  Sent {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {r.archived && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)', backgroundColor: 'var(--color-border)', padding: '2px 8px', borderRadius: '999px' }}>Archived</span>
                )}
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px',
                  backgroundColor: r.read_at ? '#064e3b' : '#1e3a5f',
                  color: r.read_at ? '#34d399' : '#93c5fd'
                }}>
                  {r.read_at ? '✓ Read' : 'Unread'}
                </span>
              </div>
            </div>
            ))}
          </SectionHeader>
        </div>
      )}

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <SectionHeader title="Client targets" collapsed={sectionsCollapsed.targets} onToggle={() => toggleSection('targets')}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginTop: '8px' }}>
            Set daily goals for {clientProfile?.full_name || 'this client'}. These appear on their dashboard.
          </p>
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
                <p style={{ fontSize: '0.75rem', marginBottom: '6px', color: 'var(--color-muted)' }}>{f.label}</p>
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
            <p style={{ fontSize: '0.75rem', marginBottom: '6px', color: 'var(--color-muted)' }}>Weight goal</p>
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

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionHeader title="Nutrition log" collapsed={sectionsCollapsed.nutritionLog} onToggle={() => toggleSection('nutritionLog')}>
          {entries.length === 0 ? (
            <EmptyState
              icon="🍽️"
              title="No entries for this day"
              description="Client hasn't logged any nutrition yet."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {entries.map((entry) => (
                <div key={entry.id} style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>{entry.food}</span>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{entry.calories} cal</span>
                    <span style={{ color: 'var(--color-muted)' }}>P: {entry.protein}g</span>
                    <span style={{ color: 'var(--color-muted)' }}>C: {entry.carbs}g</span>
                    <span style={{ color: 'var(--color-muted)' }}>F: {entry.fat}g</span>
                    <span style={{ color: 'var(--color-muted)' }}>{entry.serving_size}{entry.serving_unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionHeader>
      </div>

      {clientCheckIn && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SectionHeader title="This week's check-in" collapsed={sectionsCollapsed.checkIn} onToggle={() => toggleSection('checkIn')}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Adherence</p>
                  <p style={{ fontWeight: 700, fontSize: '1.25rem' }}>{clientCheckIn.adherence_rating}<span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>/10</span></p>
                </div>
                <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: '14px' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Energy level</p>
                  <p style={{ fontWeight: 700, fontSize: '1.25rem' }}>{clientCheckIn.energy_level}<span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>/10</span></p>
                </div>
              </div>
              {clientCheckIn.obstacles && (
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Obstacles</p>
                  <p style={{ fontSize: '0.875rem', lineHeight: '1.6' }}>{clientCheckIn.obstacles}</p>
                </div>
              )}
              {clientCheckIn.notes && (
                <div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginBottom: '4px' }}>Notes for coach</p>
                  <p style={{ fontSize: '0.875rem', lineHeight: '1.6' }}>{clientCheckIn.notes}</p>
                </div>
              )}
          </SectionHeader>
        </div>
      )}

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SectionHeader title="Private notes" collapsed={sectionsCollapsed.privateNotes} onToggle={() => toggleSection('privateNotes')}>
            <textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              placeholder="Injuries, life context, goals, observations..."
              rows={5}
              style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                padding: '12px 14px',
                color: 'var(--color-text)',
                fontSize: '0.875rem',
                lineHeight: '1.6',
                resize: 'vertical',
                fontFamily: 'inherit',
                width: '100%'
              }}
            />
            <Button onClick={saveCoachNotes} variant="outline" size="sm">
              {notesSaved ? 'Saved ✓' : 'Save notes'}
            </Button>
        </SectionHeader>
      </div>

      {(weightHistory.length > 0 || calorieHistory.length > 0) && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SectionHeader title="Progress overview" collapsed={sectionsCollapsed.correlatedChart} onToggle={() => toggleSection('correlatedChart')} animated={false}>
            {!sectionsCollapsed.correlatedChart && (
              <div style={{ paddingTop: '8px' }}>
                <Chart type="bar" data={getCorrelatedChartData()} options={correlatedChartOptions} />
              </div>
            )}
          </SectionHeader>
        </div>
      )}

      {weightHistory.length > 1 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SectionHeader title="Weight trend" collapsed={sectionsCollapsed.weightChart} onToggle={() => toggleSection('weightChart')} animated={false}>
            {!sectionsCollapsed.weightChart && (
              <Line data={{ labels: weightHistory.map(d => d.date), datasets: [{ label: 'Weight', data: weightHistory.map(d => d.weight), borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,0.1)', tension: 0.3, fill: true }] }} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      {calorieHistory.length > 0 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SectionHeader title="Calories — last 14 days" collapsed={sectionsCollapsed.calorieChart} onToggle={() => toggleSection('calorieChart')} animated={false}>
            {!sectionsCollapsed.calorieChart && (
              <Bar data={{ labels: calorieHistory.map(d => d.date), datasets: [{ label: 'Calories', data: calorieHistory.map(d => d.calories), backgroundColor: '#4f8ef7', borderRadius: 4 }] }} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      {cardioHistory.length > 0 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SectionHeader title="Cardio — last 14 days" collapsed={sectionsCollapsed.cardioChart} onToggle={() => toggleSection('cardioChart')} animated={false}>
            {!sectionsCollapsed.cardioChart && (
              <Bar data={{ labels: cardioHistory.map(d => d.date), datasets: [{ label: 'Minutes', data: cardioHistory.map(d => d.minutes), backgroundColor: '#a78bfa', borderRadius: 4 }] }} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}

      {stepsHistory.length > 0 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <SectionHeader title="Steps — last 14 days" collapsed={sectionsCollapsed.stepsChart} onToggle={() => toggleSection('stepsChart')} animated={false}>
            {!sectionsCollapsed.stepsChart && (
              <Bar data={{ labels: stepsHistory.map(d => d.date), datasets: [{ label: 'Steps', data: stepsHistory.map(d => d.steps), backgroundColor: '#34d399', borderRadius: 4 }] }} options={chartOptions} />
            )}
          </SectionHeader>
        </div>
      )}
    </div>
    <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </>
  )
}

export default ClientView
