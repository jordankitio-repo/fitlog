import { useState } from 'react'
import { Icon, Textarea } from './ui'
import Button from './Button'
import { formatAnswer } from '../utils/checkinQuestions'
import { parseLocalDateString } from '../utils/dateHelpers'

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
export default function CheckinReview({ checkIn, current = true, reviewing = false, onReview, footer = null }) {
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
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '0 0 var(--space-10)' }}>
        Week of {parseLocalDateString(checkIn.week_of).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        {!current && <> · <span style={{ color: 'var(--color-warning)' }}>none since</span></>}
      </p>

      {custom ? (
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
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Adherence</p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{checkIn.adherence_rating}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>/10</span></p>
            </div>
            <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius)', padding: 'var(--space-12)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-4)' }}>Energy level</p>
              <p className="tnum" style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-lg)' }}>{checkIn.energy_level}<span style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)' }}>/10</span></p>
            </div>
          </div>
          {checkIn.obstacles && (
            <div style={{ paddingTop: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: 'var(--space-8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Obstacles</p>
              <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{checkIn.obstacles}</p>
            </div>
          )}
          {checkIn.notes && (
            <div style={{ paddingTop: 'var(--space-4)' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: 'var(--space-8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes for coach</p>
              <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6' }}>{checkIn.notes}</p>
            </div>
          )}
        </>
      )}

      <div style={{ paddingTop: 'var(--space-12)', marginTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
        {checkIn.reviewed_at ? (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 'var(--weight-semibold)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-4)' }}><Icon name="check" /> Reviewed</p>
            {checkIn.coach_comment && (
              <p style={{ fontSize: 'var(--text-base)', lineHeight: '1.6', marginTop: 'var(--space-6)' }}>{checkIn.coach_comment}</p>
            )}
            {footer}
          </>
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
