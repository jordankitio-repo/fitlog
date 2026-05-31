import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'
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
  Legend
} from 'chart.js'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend
)

function toLocalDateString(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

function ClientView() {
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
      alert('Report sent to client.')
    }
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
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#888' }, grid: { color: '#2a2a2a' } },
      y: { ticks: { color: '#888' }, grid: { color: '#2a2a2a' } }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={() => navigate('/')} style={{
          backgroundColor: 'transparent',
          color: 'var(--color-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '6px 12px',
          cursor: 'pointer',
          fontSize: '0.875rem'
        }}>← Back</button>
        <div>
          <h1>{clientProfile?.full_name || 'Client'}</h1>
          <p style={{ fontSize: '0.875rem', marginTop: '2px' }}>{clientProfile?.email}</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={goToPrevDay} style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '6px 12px',
          cursor: 'pointer',
          fontSize: '1rem'
        }}>←</button>

        <input
          type="date"
          value={selectedDate}
          max={toLocalDateString(new Date())}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ ...inputStyle, colorScheme: 'dark' }}
        />

        <button onClick={goToNextDay} disabled={isToday} style={{
          backgroundColor: 'var(--color-surface)',
          color: isToday ? 'var(--color-muted)' : 'var(--color-text)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '6px 12px',
          cursor: isToday ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          opacity: isToday ? 0.5 : 1
        }}>→</button>

        {!isToday && (
          <button onClick={() => setSelectedDate(toLocalDateString(new Date()))} style={{
            backgroundColor: 'transparent',
            color: 'var(--color-primary)',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius)',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}>Today</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <StatCard label="Calories" value={totals.calories} />
        <StatCard label="Protein" value={`${totals.protein}g`} />
        <StatCard label="Carbs" value={`${totals.carbs}g`} />
        <StatCard label="Fat" value={`${totals.fat}g`} />
        <StatCard
          label="Weight"
          value={weightEntry ? `${weightEntry.weight} ${weightEntry.unit}` : '—'}
        />
      </div>

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2>Logging consistency</h2>
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
      </div>

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2>Client targets</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginTop: '-8px' }}>
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
        <div>
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
        <button onClick={saveClientTargets} style={{ backgroundColor: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius)', padding: '10px 20px', cursor: 'pointer', fontWeight: 600, width: 'fit-content' }}>
          {targetsSaved ? 'Saved ✓' : 'Save targets'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h2>Nutrition log</h2>
        {entries.length === 0 ? (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
            No entries for this day.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} style={{
              backgroundColor: 'var(--color-surface)',
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
          ))
        )}
      </div>

      {clientCheckIn && (
  <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <h2>This week's check-in</h2>
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
  </div>
)}

      <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
  <div>
    <h2>Private notes</h2>
    <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', marginTop: '4px' }}>
      Only you can see these. Client never has access.
    </p>
  </div>
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
  <button onClick={saveCoachNotes} style={{
    backgroundColor: 'transparent',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-primary)',
    borderRadius: 'var(--radius)',
    padding: '8px 16px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.875rem',
    width: 'fit-content'
  }}>
    {notesSaved ? 'Saved ✓' : 'Save notes'}
  </button>
</div>

      <button onClick={generateWeeklyReport} disabled={reportLoading} style={{
        backgroundColor: '#1a1a1a',
        color: 'var(--color-primary)',
        border: '1px solid var(--color-primary)',
        borderRadius: 'var(--radius)',
        padding: '10px 20px',
        cursor: reportLoading ? 'not-allowed' : 'pointer',
        fontWeight: 600,
        width: 'fit-content',
        opacity: reportLoading ? 0.7 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        {reportLoading && (
          <span style={{
            width: '14px', height: '14px',
            border: '2px solid var(--color-primary)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite'
          }} />
        )}
        {reportLoading ? 'Generating report...' : 'Generate weekly report'}
      </button>

      {report && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <h2>Weekly Report</h2>
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            rows={20}
            style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '14px',
              color: 'var(--color-text)',
              fontSize: '0.9rem',
              lineHeight: '1.7',
              resize: 'vertical',
              fontFamily: 'inherit',
              width: '100%'
            }}
          />
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={sendReport} style={{
              backgroundColor: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              padding: '10px 20px',
              cursor: 'pointer',
              fontWeight: 600
            }}>
              Send to client
            </button>
            <button onClick={() => setReport('')} style={{
              backgroundColor: 'transparent',
              color: 'var(--color-muted)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '10px 20px',
              cursor: 'pointer'
            }}>
              Discard
            </button>
          </div>
        </div>
      )}
      {weightHistory.length > 1 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2>Weight trend</h2>
          <Line data={{ labels: weightHistory.map(d => d.date), datasets: [{ label: 'Weight', data: weightHistory.map(d => d.weight), borderColor: '#4f8ef7', backgroundColor: 'rgba(79,142,247,0.1)', tension: 0.3, fill: true }] }} options={chartOptions} />
        </div>
      )}

      {calorieHistory.length > 0 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2>Calories — last 14 days</h2>
          <Bar data={{ labels: calorieHistory.map(d => d.date), datasets: [{ label: 'Calories', data: calorieHistory.map(d => d.calories), backgroundColor: '#4f8ef7', borderRadius: 4 }] }} options={chartOptions} />
        </div>
      )}

      {cardioHistory.length > 0 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2>Cardio — last 14 days</h2>
          <Bar data={{ labels: cardioHistory.map(d => d.date), datasets: [{ label: 'Minutes', data: cardioHistory.map(d => d.minutes), backgroundColor: '#a78bfa', borderRadius: 4 }] }} options={chartOptions} />
        </div>
      )}

      {stepsHistory.length > 0 && (
        <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2>Steps — last 14 days</h2>
          <Bar data={{ labels: stepsHistory.map(d => d.date), datasets: [{ label: 'Steps', data: stepsHistory.map(d => d.steps), backgroundColor: '#34d399', borderRadius: 4 }] }} options={chartOptions} />
        </div>
      )}
    </div>
  )
}

export default ClientView
