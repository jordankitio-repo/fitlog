import { useState } from 'react'

// Per-chart "plain colors" preference (turns off the target/compliance coloring
// for users who find it busy). Persisted so the choice sticks across reloads and
// is shared between the Dashboard and ClientView. Keyed by chart id
// ('calorieChart', 'cardioChart', 'stepsChart').
const KEY = 'gardnr-plain-charts'

function load() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch { return new Set() }
}

export function usePlainCharts() {
  const [plain, setPlain] = useState(load)
  const toggle = (chart) => setPlain((prev) => {
    const next = new Set(prev)
    if (next.has(chart)) next.delete(chart); else next.add(chart)
    try { localStorage.setItem(KEY, JSON.stringify([...next])) } catch { /* ignore */ }
    return next
  })
  return [plain, toggle]
}
