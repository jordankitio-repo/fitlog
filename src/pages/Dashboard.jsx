import { useState } from 'react'
import StatCard from '../components/StatCard'

function Dashboard() {
  const [calories, setCalories] = useState(1840)

  return (
    <div>
      <h1>Dashboard</h1>
      <StatCard label="Calories" value={calories} />
      <StatCard label="Protein" value="172g" />
      <StatCard label="Weight" value="175 lbs" />
      <button onClick={() => setCalories(calories + 100)}>
        + 100 cal
      </button>
    </div>
  )
}

export default Dashboard