import { useState, useEffect } from 'react'

function Log() {
  const [food, setFood] = useState('')
  const [calories, setCalories] = useState('')
  const [entries, setEntries] = useState([])
  useEffect(() => {
  console.log('Entries updated:', entries)
}, [entries])

  function handleSubmit() {
    if (!food || !calories) return
    setEntries([...entries, { food, calories }])
    setFood('')
    setCalories('')
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
        {entries.map((entry, index) => (
          <div key={index} style={{
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
    </div>
  )
}

export default Log