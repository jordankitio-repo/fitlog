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

// Weight between the two unit systems. The ratio is the one already used in
// energyBalanceRead.js; it is stated once here so a third copy never appears.
export const KG_PER_LB = 0.45359237

// Switching the unit toggle has to CONVERT what is already entered, not just
// relabel the box.
//
// Onboarding, the Profile biometrics and the target calculator each had their
// own toggle and none of them did this: a person who typed 180 lb and then
// changed to metric was left with "180 kg", and the only clue was that the
// label beside it had changed. Nothing errored, the number was plausible, and
// the next screen quietly computed targets for someone twice their weight.
//
// Returns a STRING, because these are all text inputs and handing an input a
// number makes it uncontrolled on the next render. An empty or unparseable
// value converts to an empty one: there is nothing to convert, and inventing a
// 0 would put a weight of zero in a field the reader never filled.
export function convertWeight(value, fromUnit, toUnit) {
  if (fromUnit === toUnit) return value
  const n = Number(value)
  if (!value || Number.isNaN(n)) return value === '' || value == null ? '' : value
  const kg = toUnit === 'kg' || toUnit === 'metric'
  const converted = kg ? n * KG_PER_LB : n / KG_PER_LB
  // One decimal: the precision a bathroom scale offers, and enough that
  // round-tripping lb -> kg -> lb comes back to the same number.
  return String(Math.round(converted * 10) / 10)
}
