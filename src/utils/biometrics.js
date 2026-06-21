// Shared helpers for the onboarding/profile biometrics. Height is stored
// canonically in cm; weight uses the user's unit preference.

export function ageFromBirthDate(dateStr) {
  if (!dateStr) return null
  const b = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// cm → { ft, in } (rounded to whole inches), and back.
export function cmToFtIn(cm) {
  const n = Number(cm) || 0
  if (!n) return { ft: '', in: '' }
  const totalIn = Math.round(n / 2.54)
  return { ft: String(Math.floor(totalIn / 12)), in: String(totalIn % 12) }
}

export function ftInToCm(ft, inch) {
  const total = (Number(ft) || 0) * 12 + (Number(inch) || 0)
  return total > 0 ? Math.round(total * 2.54 * 10) / 10 : 0
}
