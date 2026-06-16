// Pure helpers for the coach-defined check-in questionnaire. One source of
// truth for the builder (coach), the form (client), and the review (coach) so
// they can't drift on defaults, validation, or display.

// Question types the coach can add. defaultConfig seeds the type-specific bits.
export const QUESTION_TYPES = [
  { type: 'rating', label: 'Rating', defaultConfig: { max: 10 } },
  { type: 'boolean', label: 'Yes / No', defaultConfig: {} },
  { type: 'number', label: 'Number', defaultConfig: { unit: '' } },
  { type: 'text', label: 'Text', defaultConfig: {} },
  { type: 'select', label: 'Single choice', defaultConfig: { options: ['Low', 'Medium', 'High'] } },
]

export const MAX_QUESTIONS = 12

// The legacy 4-field check-in expressed as questions: the "Start from default"
// set, and the semantic of the no-config fallback.
export const DEFAULT_QUESTIONS = [
  { prompt: 'Adherence — how well did you follow the plan?', type: 'rating', config: { max: 10 }, required: true },
  { prompt: 'Energy levels this period', type: 'rating', config: { max: 10 }, required: true },
  { prompt: 'Any obstacles or challenges?', type: 'text', config: {}, required: false },
  { prompt: 'Notes for your coach', type: 'text', config: {}, required: false },
]

// Initial form value for a question type (ratings start mid-scale, like the
// legacy sliders; everything else starts empty/unset).
export function blankValue(type, config = {}) {
  if (type === 'rating') return Math.ceil((config.max || 10) / 2)
  if (type === 'boolean') return null
  return ''
}

// Is a single answer "empty" (unanswered)?
export function isAnswerEmpty(type, value) {
  if (type === 'boolean') return value === null || value === undefined
  if (type === 'rating') return value === null || value === undefined || value === ''
  return value === null || value === undefined || String(value).trim() === ''
}

// Ids of required questions left unanswered. values: { [questionId]: value }.
export function validateAnswers(questions = [], values = {}) {
  return questions.filter(q => q.required && isAnswerEmpty(q.type, values[q.id])).map(q => q.id)
}

// Snapshot the answered questions for storage in check_ins.answers. Captures
// prompt/type/config so a later edit/archival never corrupts past check-ins.
export function buildAnswers(questions = [], values = {}) {
  return questions.map(q => ({
    question_id: q.id,
    prompt: q.prompt,
    type: q.type,
    config: q.config || {},
    value: values[q.id] ?? null,
  }))
}

// Display a stored answer for the coach review / history.
export function formatAnswer(answer) {
  const { type, value, config } = answer || {}
  if (isAnswerEmpty(type, value)) return '—'
  if (type === 'rating') return `${value}/${config?.max || 10}`
  if (type === 'boolean') return value ? 'Yes' : 'No'
  if (type === 'number') return config?.unit ? `${value} ${config.unit}` : String(value)
  return String(value)
}

// Parse a comma-separated options string into a clean array (for the builder).
export function parseOptions(text = '') {
  return text.split(',').map(o => o.trim()).filter(Boolean)
}
