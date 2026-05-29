import { useState } from 'react'
import StatCard from '../components/StatCard'

function Dashboard() {
  const [calories, setCalories] = useState(1840)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <StatCard label="Calories" value={calories} />
        <StatCard label="Protein" value="172g" />
        <StatCard label="Weight" value="175 lbs" />
      </div>

      <button
        onClick={() => setCalories(calories + 100)}
        style={{
          backgroundColor: 'var(--color-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius)',
          padding: '10px 20px',
          cursor: 'pointer',
          fontWeight: 600,
          width: 'fit-content'
        }}
      >
        + 100 cal
      </button>
    </div>
  )
}

export default Dashboard