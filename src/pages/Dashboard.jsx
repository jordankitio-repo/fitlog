import { useState, useEffect } from 'react'
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
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
)

function toLocalDateString(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

function Dashboard({ profile }) {
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [weightEntry, setWeightEntry] = useState(null)
  const [reports, setReports] = useState([])
  const [weightHistory, setWeightHistory] = useState([])
  const [calorieHistory, setCalorieHistory] = useState([])

  useEffect(() => {
    fetchTotals()
    fetchWeight()
    fetchReports()
    fetchWeightHistory()
    fetchCalorieHistory()
  }, [selectedDate])

  async function fetchTotals() {
    const { data, error } = await supabase
      .from('nutrition_log')
      .select('calories, protein, carbs, fat')
      .eq('logged_date', selectedDate)
    if (error) { console.error('Error fetching totals:', error); return }
    const totals = data.reduce((acc, entry) => ({
      calories: acc.calories + (entry.calories || 0),
      protein: acc.protein + (entry.protein || 0),
      carbs: acc.carbs + (entry.carbs || 0),
      fat: acc.fat + (entry.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 })
    setTotals(totals)
  }

  async function fetchWeight() {
    const { data, error } = await supabase
      .from('weight_log')
      .select('*')
      .eq('logged_date', selectedDate)
      .maybeSingle()
    if (error) { console.error('Error fetching weight:', error); return }
    setWeightEntry(data)
  }

  async function fetchReports() {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('Error fetching reports:', error)
    else setReports(data)
  }

  async function fetchWeightHistory() {
    const { data, error } = await supabase
      .from('weight_log')
      .select('logged_date, weight, unit')
      .order('logged_date', { ascending: true })
      .limit(30)
    if (error) console.error('Error fetching weight history:', error)
    else setWeightHistory(data.map(d => ({
      date: d.logged_date.slice(5),
      weight: parseFloat(d.weight),
      unit: d.unit
    })))
  }

  async function fetchCalorieHistory() {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 13)
    const { data, error } = await supabase
      .from('nutrition_log')
      .select('logged_date, calories')
      .gte('logged_date', start.toISOString().split('T')[0])
      .lte('logged_date', end.toISOString().split('T')[0])
    if (error) console.error('Error fetching calorie history:', error)
    else {
      const grouped = {}
      data.forEach(e => {
        grouped[e.logged_date] = (grouped[e.logged_date] || 0) + e.calories
      })
      setCalorieHistory(Object.entries(grouped).map(([date, calories]) => ({
        date: date.slice(5),
        calories
      })).sort((a, b) => a.date.localeCompare(b.date)))
    }
  }

  const isToday = selectedDate === toLocalDateString(new Date())

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1>{profile?.role === 'client' ? 'My Progress' : 'Dashboard'}</h1>
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
      </div>

      {reports.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2>Reports from your coach</h2>
          {reports.map((r) => (
            <div key={r.id} style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                Week of {r.week_of}
              </p>
              <p style={{
                color: 'var(--color-text)',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap',
                fontSize: '0.9rem'
              }}>
                {r.content}
              </p>
            </div>
          ))}
        </div>
      )}

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

      {weightHistory.length > 1 && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <h2>Weight trend</h2>
          <Line
            data={{
              labels: weightHistory.map(d => d.date),
              datasets: [{
                label: 'Weight',
                data: weightHistory.map(d => d.weight),
                borderColor: '#4f8ef7',
                backgroundColor: 'rgba(79,142,247,0.1)',
                pointBackgroundColor: '#4f8ef7',
                tension: 0.3,
                fill: true
              }]
            }}
            options={chartOptions}
          />
        </div>
      )}

      {calorieHistory.length > 0 && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <h2>Calories — last 14 days</h2>
          <Bar
            data={{
              labels: calorieHistory.map(d => d.date),
              datasets: [{
                label: 'Calories',
                data: calorieHistory.map(d => d.calories),
                backgroundColor: '#4f8ef7',
                borderRadius: 4
              }]
            }}
            options={chartOptions}
          />
        </div>
      )}
    </div>
  )
}

export default Dashboard
