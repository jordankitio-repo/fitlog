// Check-in cadence options + labels, shared by the coach control (ClientView)
// and the client's own check-in card (Dashboard) so they always read the same.
export const CADENCE_OPTIONS = [
  { weeks: 1, label: 'Weekly' },
  { weeks: 2, label: 'Biweekly' },
  { weeks: 3, label: 'Every 3 weeks' },
  { weeks: 4, label: 'Every 4 weeks' },
]

export function cadenceLabel(weeks) {
  const w = Math.max(1, Math.floor(weeks) || 1)
  if (w === 1) return 'Weekly'
  if (w === 2) return 'Biweekly'
  return `Every ${w} weeks`
}
