import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

function Log({ session }) {
  const [food, setFood] = useState('')
  const [calories, setCalories] = useState('')
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
    const { error } = await supabase
      .from('nutrition_log')
      .insert([{ food, calories: parseInt(calories), user_id: session.user.id }])
    if (error) console.error('Error saving:', error)
    else { setFood(''); setCalories(''); fetchEntries() }
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
        <input
          type="text"
          placeholder="Food name"
          value={food}
          onChange={(e) => setFood(e.target.value)}
          style={{
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            color: 'var(--color-text)',
            fontSize: '1rem'
          }}
        />
        <input
          type="number"
          placeholder="Calories"
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          style={{
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '10px 14px',
            color: 'var(--color-text)',
            fontSize: '1rem'
          }}
        />
        <button
          onClick={handleSubmit}
          style={{
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: '10px 20px',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
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
            justifyContent: 'space-between'
          }}>
            <span>{entry.food}</span>
            <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{entry.calories} cal</span>
          </div>
        ))}
      </div>

      <button
        onClick={getAIFeedback}
        style={{
          backgroundColor: '#1a1a1a',
          color: 'var(--color-primary)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius)',
          padding: '10px 20px',
          cursor: 'pointer',
          fontWeight: 600,
          width: 'fit-content'
        }}
      >
        Get AI feedback
      </button>

      {feedback && (
        <div style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          lineHeight: '1.6'
        }}>
          <p style={{ color: 'var(--color-text)' }}>{feedback}</p>
        </div>
      )}
    </div>
  )
}

export default Log