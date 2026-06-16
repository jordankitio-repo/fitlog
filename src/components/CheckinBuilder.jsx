import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import Button from './Button'
import { QUESTION_TYPES, DEFAULT_QUESTIONS, MAX_QUESTIONS, parseOptions } from '../utils/checkinQuestions'

// Coach-facing builder for the check-in questionnaire (per coach, applies to
// all their clients). Lives on the coach Profile. Each change persists; the
// list is the coach's active (non-archived) questions, ordered by position.
export default function CheckinBuilder({ coachId }) {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef(null)

  // Initial load. setState lives inside the async IIFE (after await), so it's
  // never synchronous within the effect.
  useEffect(() => {
    if (!coachId) return
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('checkin_questions')
        .select('*').eq('coach_id', coachId).eq('archived', false).order('position')
      if (active) { setQuestions(data || []); setLoading(false) }
    })()
    return () => { active = false }
  }, [coachId])

  useEffect(() => () => clearTimeout(savedTimer.current), [])

  // Quiet confirmation after any successful write — edits persist silently
  // otherwise, leaving the coach unsure anything stuck.
  function flashSaved() {
    setSaved(true)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSaved(false), 1600)
  }

  async function addQuestion(seed) {
    if (questions.length >= MAX_QUESTIONS) return
    setBusy(true)
    const row = seed || { prompt: '', type: 'text', config: {}, required: false }
    const { data, error } = await supabase.from('checkin_questions')
      .insert({ coach_id: coachId, prompt: row.prompt, type: row.type, config: row.config, required: row.required, position: questions.length })
      .select().single()
    if (!error && data) { setQuestions(qs => [...qs, data]); flashSaved() }
    setBusy(false)
  }

  async function startFromDefault() {
    setBusy(true)
    const rows = DEFAULT_QUESTIONS.map((q, i) => ({ coach_id: coachId, prompt: q.prompt, type: q.type, config: q.config, required: q.required, position: i }))
    const { data, error } = await supabase.from('checkin_questions').insert(rows).select()
    if (!error && data) { setQuestions([...data].sort((a, b) => a.position - b.position)); flashSaved() }
    setBusy(false)
  }

  // Local-only state patch (used for keystroke edits persisted on blur).
  function patchLocal(id, patch) {
    setQuestions(qs => qs.map(q => (q.id === id ? { ...q, ...patch } : q)))
  }
  // State + DB patch (type/required/config/prompt). Flashes "Saved" on success.
  async function patch(id, p) {
    patchLocal(id, p)
    const { error } = await supabase.from('checkin_questions').update(p).eq('id', id)
    if (!error) flashSaved()
  }

  async function remove(id) {
    if (!window.confirm('Remove this question? Past check-ins keep the answers they were given.')) return
    setQuestions(qs => qs.filter(q => q.id !== id))
    const { error } = await supabase.from('checkin_questions').update({ archived: true }).eq('id', id)
    if (!error) flashSaved()
  }

  async function move(id, dir) {
    const idx = questions.findIndex(q => q.id === id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= questions.length) return
    const a = questions[idx], b = questions[swapIdx]
    const reordered = [...questions]
    reordered[idx] = b; reordered[swapIdx] = a
    setQuestions(reordered.map((q, i) => ({ ...q, position: i })))
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('checkin_questions').update({ position: swapIdx }).eq('id', a.id),
      supabase.from('checkin_questions').update({ position: idx }).eq('id', b.id),
    ])
    if (!e1 && !e2) flashSaved()
  }

  const inputStyle = {
    backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
    padding: '8px 10px', color: 'var(--color-text)', fontSize: '0.875rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  }
  const iconBtn = { background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--color-muted)', padding: '2px 8px', fontSize: '0.85rem' }

  if (loading) return <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>Loading…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: 640, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: 0 }}>
          These questions replace the default check-in for every client. Leave it empty to keep the standard
          Adherence / Energy / Obstacles / Notes form.
        </p>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#34d399', opacity: saved ? 1 : 0, transition: 'opacity 200ms', whiteSpace: 'nowrap' }}>✓ Saved</span>
      </div>

      {questions.length === 0 ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button onClick={startFromDefault} variant="primary" size="sm" loading={busy}>Start from the default 4</Button>
          <Button onClick={() => addQuestion()} variant="muted" size="sm" loading={busy}>Add a blank question</Button>
        </div>
      ) : (
        <>
          {questions.map((q, i) => (
            <div key={q.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: 'var(--color-surface)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)', fontWeight: 700, width: 18 }}>{i + 1}.</span>
                <input
                  value={q.prompt}
                  placeholder="Question prompt"
                  onChange={(e) => patchLocal(q.id, { prompt: e.target.value })}
                  onBlur={(e) => patch(q.id, { prompt: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button onClick={() => move(q.id, -1)} disabled={i === 0} style={{ ...iconBtn, opacity: i === 0 ? 0.4 : 1 }} title="Move up">↑</button>
                <button onClick={() => move(q.id, 1)} disabled={i === questions.length - 1} style={{ ...iconBtn, opacity: i === questions.length - 1 ? 0.4 : 1 }} title="Move down">↓</button>
                <button onClick={() => remove(q.id)} style={{ ...iconBtn, color: '#f87171', marginLeft: '10px' }} title="Remove question">✕</button>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', paddingLeft: 26 }}>
                <select value={q.type} onChange={(e) => patch(q.id, { type: e.target.value, config: QUESTION_TYPES.find(t => t.type === e.target.value)?.defaultConfig || {} })} style={{ ...inputStyle, width: 'auto' }}>
                  {QUESTION_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>

                {q.type === 'rating' && (
                  <label style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    Scale
                    <select value={q.config?.max || 10} onChange={(e) => patch(q.id, { config: { ...q.config, max: Number(e.target.value) } })} style={{ ...inputStyle, width: 'auto' }}>
                      <option value={5}>1–5</option>
                      <option value={10}>1–10</option>
                    </select>
                  </label>
                )}
                {q.type === 'number' && (
                  <input defaultValue={q.config?.unit || ''} placeholder="unit (e.g. hrs)" onBlur={(e) => patch(q.id, { config: { ...q.config, unit: e.target.value.trim() } })} style={{ ...inputStyle, width: 120 }} />
                )}
                {q.type === 'select' && (
                  <input defaultValue={(q.config?.options || []).join(', ')} placeholder="options, comma-separated" onBlur={(e) => patch(q.id, { config: { ...q.config, options: parseOptions(e.target.value) } })} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
                )}

                <label style={{ fontSize: '0.8rem', color: 'var(--color-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                  <input type="checkbox" checked={q.required} onChange={() => patch(q.id, { required: !q.required })} />
                  Required
                </label>
              </div>
            </div>
          ))}
          <div>
            <Button onClick={() => addQuestion()} variant="muted" size="sm" loading={busy} disabled={questions.length >= MAX_QUESTIONS}>
              {questions.length >= MAX_QUESTIONS ? `Max ${MAX_QUESTIONS} questions` : '+ Add question'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
