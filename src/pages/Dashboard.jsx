import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'

function toLocalDateString(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()))
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })

  useEffect(() => {
    fetchTotals()
  }, [selectedDate])

  async function fetchTotals() {
    const { data, error } = await supabase
      .from('nutrition_log')
      .select('calories, protein, carbs, fat')
      .eq('logged_date', selectedDate)

    if (error) {
      console.error('Error fetching totals:', error)
      return
    }

    const totals = data.reduce((acc, entry) => ({
      calories: acc.calories + (entry.calories || 0),
      protein: acc.protein + (entry.protein || 0),
      carbs: acc.carbs + (entry.carbs || 0),
      fat: acc.fat + (entry.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

    setTotals(totals)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1>Dashboard</h1>

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
        <StatCard label="Calories" value={totals.calories} />
        <StatCard label="Protein" value={`${totals.protein}g`} />
        <StatCard label="Carbs" value={`${totals.carbs}g`} />
        <StatCard label="Fat" value={`${totals.fat}g`} />
      </div>
    </div>
  )
}

export default Dashboard