import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function Log({ session }) {
  const [food, setFood] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [entries, setEntries] = useState([])
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    fetchEntries()
  }, [])

  async function fetchEntries() {
    const { data, error } = await supabase
      .from('nutrition_log')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('Error fetching:', error)
    else setEntries(data)
  }

  async function handleSubmit() {
  if (!food || !calories) return

  const { data: { session: currentSession } } = await supabase.auth.getSession()

  const { error } = await supabase
    .from('nutrition_log')
    .insert([{
      food,
      calories: parseInt(calories),
      protein: parseInt(protein) || 0,
      carbs: parseInt(carbs) || 0,
      fat: parseInt(fat) || 0,
      user_id: currentSession.user.id
    }])

  if (error) console.error('Error saving:', error)
  else {
    setFood(''); setCalories(''); setProtein(''); setCarbs(''); setFat('')
    fetchEntries()
  }
}

  async function getAIFeedback() {
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(
      'https://mlqaurxefttbqsrllbyj.supabase.co/functions/v1/nutrition-coach',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ entries }),
      }
    )
    const data = await response.json()
    setFeedback(data.message)
  }
  async function deleteEntry(id) {
  const { error } = await supabase
    .from('nutrition_log')
    .delete()
    .eq('id', id)

  if (error) console.error('Error deleting:', error)
  else fetchEntries()
}

  const inputStyle = {
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    color: 'var(--color-text)',
    fontSize: '1rem'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1>Log</h1>

      <div style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <input type="text" placeholder="Food name" value={food}
          onChange={(e) => setFood(e.target.value)} style={inputStyle} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          <input type="number" placeholder="Calories" value={calories}
            onChange={(e) => setCalories(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Protein (g)" value={protein}
            onChange={(e) => setProtein(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Carbs (g)" value={carbs}
            onChange={(e) => setCarbs(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Fat (g)" value={fat}
            onChange={(e) => setFat(e.target.value)} style={inputStyle} />
        </div>

        <button onClick={handleSubmit} style={{
          backgroundColor: 'var(--color-primary)',
          color: '#fff', border: 'none',
          borderRadius: 'var(--radius)',
          padding: '10px 20px',
          cursor: 'pointer', fontWeight: 600
        }}>
          Add entry
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
  {entries.map((entry) => (
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
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', alignItems: 'center' }}>
        <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{entry.calories} cal</span>
        <span style={{ color: 'var(--color-muted)' }}>P: {entry.protein}g</span>
        <span style={{ color: 'var(--color-muted)' }}>C: {entry.carbs}g</span>
        <span style={{ color: 'var(--color-muted)' }}>F: {entry.fat}g</span>
        <button
          onClick={() => deleteEntry(entry.id)}
          style={{
            backgroundColor: 'transparent',
            color: '#f87171',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            padding: '2px 8px'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  ))}
</div>

      <button onClick={getAIFeedback} style={{
        backgroundColor: '#1a1a1a',
        color: 'var(--color-primary)',
        border: '1px solid var(--color-primary)',
        borderRadius: 'var(--radius)',
        padding: '10px 20px',
        cursor: 'pointer', fontWeight: 600,
        width: 'fit-content'
      }}>
        Get AI feedback
      </button>

      {feedback && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '20px', lineHeight: '1.6'
        }}>
          <p style={{ color: 'var(--color-text)' }}>{feedback}</p>
        </div>
      )}
    </div>

    
  )
}

export default Log