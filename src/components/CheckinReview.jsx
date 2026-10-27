import { useState } from 'react'
import { Icon, Textarea } from './ui'
import Button from './Button'
import { formatAnswer } from '../utils/checkinQuestions'
import { parseLocalDateString } from '../utils/dateHelpers'
import CheckinWeek from './CheckinWeek'
import { CheckinPhotos } from './ProgressPhotos'

// The written part of a check-in for the compact history entry: every answer
// that is not a 1-10 rating (those go on the ratings line), blanks left out.
function readOnlyTexts(c) {
  if (Array.isArray(c.answers) && c.answers.length > 0) {
    return c.answers
      .filter(a => a.type !== 'rating' && a.value != null && String(a.value).trim() !== '')
      .map(a => ({ label: a.prompt, value: formatAnswer(a) }))
  }
  return [
    c.obstacles && { label: 'Obstacles', value: c.obstacles },
    c.notes && { label: 'Notes for coach', value: c.notes },
  ].filter(Boolean)
}

// The body of a check-in, and the act of reviewing it.
//
// Lifted out of ClientView verbatim, because the review QUEUE shows the same
// thing over a list and a second copy would be wrong the first time either
// changed — the rule this codebase keeps relearning. What stayed behind in
// ClientView is everything that is about the client RECORD rather than the
// check-in: the cadence control, its confirmation, the section header.
//
// It owns the comment box and nothing else. Whether a review succeeded, what to
// do afterwards, and what sits under the Reviewed line are the caller's: the
// queue page puts the next waiting client there, and the client record
// deliberately puts nothing (chaining belongs to the queue — see ClientView).
//
// MOUNT ONE PER CHECK-IN. The comment box is state in here, so both callers key
// this component by the check-in's id; reusing an instance across two different
// check-ins carries one client's half-typed note into another's box.
//
// `readOnly` is for an older check-in opened from the history list: no comment
// box, an unreviewed one just says so, and only what the row above it does
// not already show (the period's numbers, the written answers, the review),
// rather than a second full card inside the list.
//
// With `clientId`, the period's numbers (CheckinWeek) sit under the week line:
// the answers and what actually happened, read together. `intervalWeeks` sets
// the period's length and `weightUnit` the reader's unit.
export default function CheckinReview({ checkIn, readOnly = false, current = true, reviewing = false, onReview, footer = null, clientId = null, intervalWeeks = 1, weightUnit = null }) {
  const [comment, setComment] = useState('')

  if (!checkIn) {
    return (
      <div style={{ paddingTop: 'var(--space-8)' }}>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>No check-in submitted yet.</p>
      </div>
    )
  }

  const custom = Array.isArray(checkIn.answers) && checkIn.answers.length > 0

  return (
    <>
      {/* ALWAYS name the week it covers. A heading says how recent it is; this
          says exactly which one, so a coach is never reading ratings without
          knowing what they are ratings OF. */}
      {/* Not in the history list, whose row already names the week. */}
      {!readOnly && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '0 0 var(--space-10)' }}>
        Week of {parseLocalDateString(checkIn.week_of).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        {!current && <> · <span style={{ color: 'var(--color-warning)' }}>none since</span></>}
      </p>}

      {clientId && <CheckinWeek clientId={clientId} weekOf={checkIn.week_of} intervalWeeks={intervalWeeks} weightUnit={weightUnit} compact={readOnly} />}
      {clientId && <CheckinPhotos clientId={clientId} weekOf={checkIn.week_of} intervalWeeks={intervalWeeks} />}

      {readOnly ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {/* No ratings line: the history row this opens from already reads
              "Adherence 10 · Energy 8". */}
          {readOnlyTexts(checkIn).map(t => (
            <div key={t.label}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '0 0 var(--space-2)' }}>{t.label}</p>
              <p style={{ fontSize: 'var(--text-base)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{t.value}</p>
            </div>
          ))}
        </div>
      ) : 
      custom ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
          {checkIn.answers.map((a, i) => (
            <div key={a.question_id || i}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.prompt}</p>
              {a.type === 'text'
                ? <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{(a.value && String(a.value).trim()) ? a.value : '—'}</p>
                : <p style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>{formatAnswer(a)}</p>}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-12)' }}>
            <div style={{ backgroundColor: 'color-mix(in srgb, var(--color-text) 5%, transparent)', borderRadius: 'var(--radius)', padding: 'var(--space-12)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Adherence</p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{checkIn.adherence_rating != null ? <>{checkIn.adherence_rating}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>/10</span></> : <span style={{ color: 'var(--color-muted)' }}>&mdash;</span>}</p>
            </div>
            <div style={{ backgroundColor: 'color-mix(in srgb, var(--color-text) 5%, transparent)', borderRadius: 'var(--radius)', padding: 'var(--space-12)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Energy level</p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{checkIn.energy_level != null ? <>{checkIn.energy_level}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>/10</span></> : <span style={{ color: 'var(--color-muted)' }}>&mdash;</span>}</p>
            </div>
          </div>
          {checkIn.obstacles && (
            <div style={{ paddingTop: 'var(--space-16)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: 'var(--space-8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Obstacles</p>
              <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{checkIn.obstacles}</p>
            </div>
          )}
          {checkIn.notes && (
            <div style={{ paddingTop: 'var(--space-16)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: 'var(--space-8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes for coach</p>
              <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{checkIn.notes}</p>
            </div>
          )}
        </>
      )}

      <div style={{ paddingTop: 'var(--space-12)', marginTop: 'var(--space-16)', borderTop: '1px solid var(--color-border)' }}>
        {checkIn.reviewed_at ? (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 'var(--weight-semibold)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-4)' }}><Icon name="check" /> Reviewed</p>
            {checkIn.coach_comment && (
              <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6', marginTop: 'var(--space-6)' }}>{checkIn.coach_comment}</p>
            )}
            {footer}
          </>
        ) : readOnly ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>Not reviewed</p>
        ) : (
          <>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comment for the client (optional)…"
              rows={2}
              aria-label="Comment for the client"
              style={{ resize: 'vertical' }}
            />
            <Button onClick={() => onReview?.(comment)} variant="primary" size="sm" loading={reviewing} style={{ marginTop: 'var(--space-8)' }}>Mark reviewed</Button>
          </>
        )}
      </div>
    </>
  )
}
