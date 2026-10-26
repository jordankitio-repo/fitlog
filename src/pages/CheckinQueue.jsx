import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { refreshNotifications } from '../utils/notifyRefresh'
import Modal from '../components/Modal'
import PushPanel from '../components/PushPanel'
import CheckinReview from '../components/CheckinReview'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { Icon } from '../components/ui'
import { waitingFrom, latestPerClient } from '../utils/reviewQueue'
import { coversPeriod } from '../utils/checkinLookup'
import { checkinPeriod, toLocalDateString, addDays } from '../utils/dateHelpers'
import { relativeTime } from '../utils/relativeTime'
import { formatAnswer } from '../utils/checkinQuestions'

// The review queue: every check-in waiting on this coach, and the coach picks.
//
// The roster used to send them to whichever one had waited longest and offer
// the next when that was done — a conveyor belt. That is the right shape when
// the items are interchangeable, and check-ins are the opposite: a coach knows
// which client is drifting and wants to start there, and a list of four names
// also tells them what the job IS before they are inside it.
//
// The belt did not go away. It lives in the pop-up's footer, so a coach can
// pick from the list or chain straight through, whichever they are doing.

// Enough of the submission to decide whether to open it: the first thing the
// client actually wrote, since the ratings are already on the row.
function previewOf(ci) {
  if (Array.isArray(ci?.answers) && ci.answers.length) {
    // The LONGEST free-text answer, not the first. A questionnaire often asks
    // something one-word ("How was your sleep?" — "Good") before it asks the
    // one that matters, and the first-match rule previewed the one-word answer.
    const texts = ci.answers
      .filter(a => a.type === 'text' && String(a.value || '').trim())
      .map(a => String(a.value).trim())
      .sort((x, y) => y.length - x.length)
    if (texts.length) return texts[0]
    const first = ci.answers.find(a => a.type !== 'text')
    if (first) return `${first.prompt} — ${formatAnswer(first)}`
  }
  return (ci?.notes || ci?.obstacles || '').trim() || 'No note left.'
}

// `embedded` is the phone's pushed page over the roster (CoachDashboard): the
// panel already carries "‹ Clients" and the title, and the open check-in lives
// in the roster's URL (?panel=checkins&ci=<id>) rather than /check-ins/:id, so
// the roster stays mounted underneath. `openId`, `onOpen` and `onCloseItem`
// replace the route in that case.
export default function CheckinQueue({ profile, embedded = false, openId, onOpen, onCloseItem }) {
  const navigate = useNavigate()
  const params = useParams()
  const clientId = embedded ? openId : params.clientId
  const openItem = (id, opts) => (embedded ? onOpen(id, opts) : navigate(`/check-ins/${id}`, opts))
  const [rows, setRows] = useState(null)   // null = loading
  const [reviewing, setReviewing] = useState(false)

  // Locally-reviewed rows, so the list does NOT reload while the pop-up is
  // open. Reloading there pulls the row out from under whoever is reading it —
  // the queue reshuffles mid-sentence and `Next` points somewhere else. The
  // list refreshes when the pop-up closes instead, which is when a coach is
  // looking at it again.
  const [reviewed, setReviewed] = useState({})

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  async function load() {
    if (!profile?.id) return
    const { data: links } = await supabase
      .from('coach_clients')
      .select('client_id, checkin_interval_weeks')
      .eq('coach_id', profile.id)
    const ids = (links || []).map(l => l.client_id)
    if (!ids.length) { setRows([]); return }

    // Eight weeks, the same window clientStats reads, so the roster's count and
    // this list cannot disagree about who is waiting.
    const since = toLocalDateString(addDays(new Date(), -8 * 7))
    const [{ data: cis }, { data: people }] = await Promise.all([
      supabase.from('check_ins').select('*').in('client_id', ids).gte('week_of', since),
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids),
    ])
    const latest = latestPerClient(cis || [])
    const byId = Object.fromEntries((people || []).map(p => [p.id, p]))
    const interval = Object.fromEntries((links || []).map(l => [l.client_id, l.checkin_interval_weeks || 1]))

    // waitingFrom gives the ORDER as well as the membership — oldest first.
    setRows(waitingFrom(latest).map(id => ({
      id,
      name: byId[id]?.full_name || 'Client',
      avatar: byId[id]?.avatar_url || null,
      checkIn: latest[id],
      current: coversPeriod(latest[id], checkinPeriod(interval[id])),
    })))
  }


  // Derived, not stored: the row plus whatever this visit has reviewed. One
  // source of truth, and no effect syncing a copy of it.
  const row = (rows || []).find(r => r.id === clientId) || null
  const open = row && {
    ...row,
    checkIn: reviewed[clientId] ? { ...row.checkIn, ...reviewed[clientId] } : row.checkIn,
  }

  // Still waiting, excluding this one and anything reviewed on this visit.
  const pending = (rows || []).filter(r => r.id !== clientId && !reviewed[r.id])
  const next = pending[0]

  // Closing is where the list catches up — see the note on `reviewed`.
  function closeToList() {
    if (embedded) onCloseItem()
    else navigate('/check-ins')
    load()
  }

  async function review(text) {
    if (!open?.checkIn?.id) return
    setReviewing(true)
    const comment = String(text).trim() || null
    const { error } = await supabase.rpc('review_checkin', { p_id: open.checkIn.id, p_comment: comment })
    if (error) console.error('Error reviewing check-in:', error)
    else {
      setReviewed(r => ({ ...r, [open.id]: { reviewed_at: new Date().toISOString(), coach_comment: comment } }))
      // Clears this coach's live "no check-in" alert, same as the record does.
      refreshNotifications()
      // Same notification the client record sends — their bell derives the
      // event from check_ins, the email is the part that needs asking for.
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-checkin-review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ clientId: open.id, comment }),
        }).catch(() => {})
      }
    }
    setReviewing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
      <div>
        {!embedded && (
          <>
            <Link to="/" className="ds-disclosure ds-control" style={{ width: 'auto', textDecoration: 'none' }}>
              <Icon name="left" size={14} />
              <span>Clients</span>
            </Link>
            <h1 style={{ marginTop: 'var(--space-12)' }}>Check-ins to review</h1>
          </>
        )}
        <p style={{ marginTop: embedded ? 0 : 'var(--space-4)', color: 'var(--color-muted)' }}>
          {rows === null ? ' ' : rows.length === 0
            ? 'Nothing waiting.'
            : `${rows.length} waiting · oldest first`}
        </p>
      </div>

      {rows === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {[0, 1, 2].map(i => <Skeleton key={i} height="76px" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>}
          title="All caught up"
          description="Every check-in your clients have submitted has been reviewed."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map(r => (
            <button
              key={r.id}
              type="button"
              className="ciq-row ds-control"
              onClick={() => openItem(r.id)}
            >
              <Avatar url={r.avatar} name={r.name} size={36} style={{ flexShrink: 0 }} />
              <span className="ciq-body">
                <span className="ciq-head">
                  <span className="ciq-name">{r.name}</span>
                  <span className="ciq-when">
                    {relativeTime(r.checkIn.created_at)}
                    {!r.current && <> · <span style={{ color: 'var(--color-warning)' }}>none since</span></>}
                  </span>
                </span>
                <span className="ciq-preview">{previewOf(r.checkIn)}</span>
              </span>
              <span style={{ color: 'var(--color-faint)', display: 'inline-flex', flexShrink: 0 }}>
                <Icon name="right" size={16} />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* The pop-up's two exits, left and right: back to this list, or into the
          client's record. Closing by X, Escape or the backdrop is the same as
          the left one — they all mean "I am done with this one". */}
      {/* On the phone (embedded), a check-in is PUSHED over the list, as
          every chevron row opens: "‹ Check-ins" is the way back. */}
      {embedded ? (
        <PushPanel
          open={Boolean(open && clientId)}
          title={open?.name || 'Check-in'}
          backLabel="Check-ins"
          onBack={closeToList}
          under="#push-checkins"
        >
          {open && (
            <>
              <div style={{ marginBottom: 'var(--space-12)' }}>
                <Button onClick={() => navigate(`/client/${open.id}?focus=checkIn`)} variant="muted" size="sm">
                  Open record <Icon name="right" size={14} />
                </Button>
              </div>
            {/* KEYED BY THE CHECK-IN. Without this React reuses the instance
                across Next, because the element type and position do not
                change — and the comment box is state inside it. Measured: type
                a note for Dan, mark reviewed, press Next, and Dan's note is
                sitting in Gia's box one click from being sent to her. A key is
                the fix rather than an effect that clears the text, because the
                box genuinely belongs to one check-in and should be born and
                die with it. */}
            <CheckinReview
              key={open.checkIn?.id}
              checkIn={open.checkIn}
              current={open.current}
              reviewing={reviewing}
              onReview={review}
              footer={next && (
                <div style={{ marginTop: 'var(--space-12)' }}>
                  <Button onClick={() => openItem(next.id, { replace: true })} variant="primary" size="sm">
                    Next: {next.name.split(' ')[0]}
                    {pending.length > 1 ? ` · ${pending.length} left` : ''}
                    <Icon name="right" />
                  </Button>
                </div>
              )}
            />
            </>
          )}
        </PushPanel>
      ) : (
      <Modal
        open={Boolean(open && clientId)}
        title={open?.name || 'Check-in'}
        onClose={closeToList}
        maxWidth={640}
      >
        {open && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-12)', marginBottom: 'var(--space-12)' }}>
              <Button onClick={closeToList} variant="ghost" size="sm">
                <Icon name="left" size={14} /> All check-ins
              </Button>
              <Button onClick={() => navigate(`/client/${open.id}?focus=checkIn`)} variant="muted" size="sm">
                Open record <Icon name="right" size={14} />
              </Button>
            </div>
            {/* KEYED BY THE CHECK-IN. Without this React reuses the instance
                across Next, because the element type and position do not
                change — and the comment box is state inside it. Measured: type
                a note for Dan, mark reviewed, press Next, and Dan's note is
                sitting in Gia's box one click from being sent to her. A key is
                the fix rather than an effect that clears the text, because the
                box genuinely belongs to one check-in and should be born and
                die with it. */}
            <CheckinReview
              key={open.checkIn?.id}
              checkIn={open.checkIn}
              current={open.current}
              reviewing={reviewing}
              onReview={review}
              footer={next && (
                <div style={{ marginTop: 'var(--space-12)' }}>
                  <Button onClick={() => openItem(next.id, { replace: true })} variant="primary" size="sm">
                    Next: {next.name.split(' ')[0]}
                    {pending.length > 1 ? ` · ${pending.length} left` : ''}
                    <Icon name="right" />
                  </Button>
                </div>
              )}
            />
          </>
        )}
      </Modal>
      )}
    </div>
  )
}
