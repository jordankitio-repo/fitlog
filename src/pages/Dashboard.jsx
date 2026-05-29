import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import StatCard from '../components/StatCard'

function Dashboard() {
  const [totals, setTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })

  useEffect(() => {
    fetchTodayTotals()
  }, [])

  async function fetchTodayTotals() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('nutrition_log')
      .select('calories, protein, carbs, fat')
      .gte('created_at', today.toISOString())

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1>Dashboard</h1>
      <p style={{ marginTop: '-16px', fontSize: '0.875rem' }}>Today's totals</p>

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