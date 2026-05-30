 import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'

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

  useEffect(() => {
    fetchClientProfile()
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
    </div>
  )
}

export default ClientView
