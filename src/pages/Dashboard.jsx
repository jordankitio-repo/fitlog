import StatCard from '../components/StatCard'

function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <StatCard label="Calories" value="1,840" />
      <StatCard label="Protein" value="172g" />
      <StatCard label="Weight" value="175 lbs" />
    </div>
  )
}

export default Dashboard