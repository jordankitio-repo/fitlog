import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Toast from '../components/Toast'
import Skeleton from '../components/Skeleton'
import InfoTip from '../components/InfoTip'
import { computeClientStats } from '../utils/clientStats'
import { getInviteBlockReason } from '../utils/inviteValidation'
import { compareByAttention, summarizeRoster, TONE_RANK } from '../utils/attentionLevel'
import { nudgeReason } from '../utils/nudgeReason'
import { rosterStatus, LENS_HEADERS, LENS_GRADERS } from '../utils/rosterStatus'

// Fraction of target days hit, for ordering within a compliance tone.
function complianceRatio(s) {
  const items = (s?.complianceItems || []).filter(i => i.hasData)
  if (!items.length) return -1
  return items.reduce((t, i) => t + i.value, 0) / (items.length * 7)
}
import { cardStyle } from '../utils/styles'
import { Pill, Field, Icon, Panel, Row } from '../components/ui'

const attentionColors = { red: 'var(--color-error)', yellow: 'var(--color-warning)', green: 'var(--color-success)' }

// How a row's status text is painted. Colour = a graded state; GREY = no grade
// exists to give. "No targets set" is grey because there is no target — nothing
// to measure against, so nothing to colour. This keeps amber meaning exactly one
// thing (this client is slipping) instead of three, without adding a colour.

const STATUS_TONES = {
  red: 'var(--color-error)',      // intervene now
  yellow: 'var(--color-warning)', // watch this client
  green: 'var(--color-success)',  // graded, and the grade is good
  setup: 'var(--color-muted)',    // NOT a grade — nothing to measure against
}


// A banner CTA. Every headline number that names work the coach has to do is
// one of these, so a count is never a dead end: it says how many AND takes you
// to the first one.
//
// `tone` carries the KIND of work — see the table above.
const BANNER_TONES = {
  primary: 'var(--color-primary)',
  warning: 'var(--color-warning)',
  // No `error` entry, on purpose. See the note above.
}

// ── Banner CTA tones ────────────────────────────────────────────────────────
// Tone answers exactly one question: WHAT HAPPENS IF THE COACH IGNORES THIS?
//
//   primary (green)   Routine work. It piles up; nothing breaks.
//                     → check-ins waiting to be reviewed
//   warning (amber)   Blocked. Something cannot be measured or acted on until
//                     the coach fixes it. The state is wrong, not urgent.
//                     → a client with no targets: their logs cannot be graded
//
// There is deliberately NO red banner CTA, and this is the load-bearing rule:
// red means a CLIENT is in trouble. A coach's own to-do list must never shout
// louder than a person who has stopped eating. If admin tasks could go red,
// "4 clients need targets" would out-rank "Hugo, 5 days no log" on the same
// screen — which is precisely backwards. Red belongs to the roster rows.
//
// TONE DOES NOT ESCALATE WITH COUNT. Ten clients missing targets is the same
// KIND of problem as one, so it stays amber and the number does the work. Two
// channels, no overlap: the number carries volume, the tone carries kind.
// Escalating by count would let a big pile of admin outrank a single failing
// client, which is the same mistake in slower motion.
//
// ORDER IS FIXED, not sorted by count: routine first, then gaps. A coach looks
// at this bar every day and should not have to re-find things because the
// numbers moved.
//
// Zero renders nothing — a CTA never appears saying "0". Singular and plural
// are written out per call site; "1 client needs" / "3 clients need".
function BannerAction({ onClick, title, tone = 'primary', children }) {
  const [hover, setHover] = useState(false)
  const live = Boolean(onClick)
  const accent = BANNER_TONES[tone] ?? BANNER_TONES.primary
  return (
    <button
      onClick={onClick}
      disabled={!live}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        fontFamily: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 700,
        color: hover && live ? 'var(--color-on-accent)' : accent,
        background: hover && live ? accent : 'var(--control-bg)',
        border: `1px solid ${hover && live ? accent : `color-mix(in srgb, ${accent} 40%, transparent)`}`,
        boxShadow: hover && live ? 'var(--control-shadow-accent)' : 'var(--control-shadow)',
        borderRadius: '999px', padding: '6px 13px',
        cursor: live ? 'pointer' : 'default',
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        transition: 'background 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
      }}
    >
      {children}
      <Icon name="arrowRight" style={{ transform: hover && live ? 'translateX(2px)' : 'none', transition: 'transform 120ms' }} />
    </button>
  )
}

// Page-level triage headline — NOT a card. Rule 1: the page itself is never a
// box, so this sits on the page ground with space separating it, not a border.
function RosterBanner({ roster, checkedIn, total, onReviewClick }) {
  const seg = (color, n, label) => (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '6px' }}>
      <span className="tnum" style={{ fontWeight: 700, color, fontSize: 'var(--text-md)' }}>{n}</span>
      <span style={{ color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>{label}</span>
    </span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '18px' }}>
      {seg(attentionColors.red, roster.atRisk, 'at risk')}
      {seg(attentionColors.yellow, roster.review, 'needs review')}
      {seg(attentionColors.green, roster.onTrack, 'on track')}
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
        <span className="tnum" style={{ fontWeight: 700, color: 'var(--color-text)' }}>{checkedIn}</span>
        <span className="tnum">/{total}</span> checked in
      </span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {roster.checkInsToReview > 0 && (
          <BannerAction onClick={onReviewClick} title="Review the oldest waiting check-in">
            {roster.checkInsToReview} check-in{roster.checkInsToReview === 1 ? '' : 's'} to review
          </BannerAction>
        )}
      </span>
    </div>
  )
}

// One cell of a stat strip: mono label over a tabular value, hairline divider
// between cells. The shape for "several facts about one subject" — a pill holds
// exactly one fact.
function StatCell({ k, v }) {
  return (
    <span className="ds-statcell">
      <span style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-faint)', fontWeight: 600 }}>{k}</span>
      <span className="tnum" style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.2 }}>{v}</span>
    </span>
  )
}


function CoachDashboard({ profile }) {
  const [clients, setClients] = useState([])
  const [clientStats, setClientStats] = useState({})
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [soloAccountDetected, setSoloAccountDetected] = useState(false)
  const [pendingInviteEmail, setPendingInviteEmail] = useState('')
  const [inviteEmailedTo, setInviteEmailedTo] = useState('') // address the invite email reached, or ''
  const inviteInputRef = useRef(null)
  const [inviting, setInviting] = useState(false)
  const invitingRef = useRef(false) // synchronous double-submit guard (state is async)
  const [loading, setLoading] = useState(true)
  const [nudgeLoadingIds, setNudgeLoadingIds] = useState({})
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [sortBy, setSortBy] = useState('attention')
  // 'worst' puts the clients who need the coach at the top (the default a
  // triage screen should open on); 'best' flips it. Semantic rather than
  // asc/desc, because "ascending" means nothing for a column that can read
  // "Never logged" or "No targets set".
  const [sortDir, setSortDir] = useState('worst')
  const [linkCopied, setLinkCopied] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    setLoading(true)

    const { data: relationships, error } = await supabase
      .from('coach_clients')
      .select('id, coach_id, client_id, status, created_at, lock_cleared_at, last_nudged_at, checkin_interval_weeks')
      .eq('coach_id', profile.id)
      .eq('status', 'active')

    if (error) { console.error(error); setLoading(false); return }
    if (!relationships.length) { setClients([]); setLoading(false); return }

    const clientIds = relationships.map(r => r.client_id)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .in('id', clientIds)

    const merged = relationships.map(r => ({
      ...r,
      client: profiles.find(p => p.id === r.client_id)
    }))

    setClients(merged)
    await fetchAllClientStats(clientIds, relationships)
    setLoading(false)
  }

  async function fetchAllClientStats(clientIds, relationships = []) {
    const stats = await computeClientStats(clientIds, relationships)
    setClientStats(stats)
  }


  function showToast(message, type = 'success') {
    setToast({ message, type })
  }

  async function nudgeClient(client, nudge) {
    setNudgeLoadingIds(prev => ({ ...prev, [client.client_id]: true }))

    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nudge-client`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clientId: client.client_id, reason: nudge?.key, days: nudge?.days ?? null }),
      }
    )
    const data = await response.json()

    if (data.error === 'too_soon') {
      showToast(`You nudged ${client.client?.full_name || 'this client'} recently. Wait 48 hours before nudging again.`, 'error')
    } else if (data.error) {
      showToast('Could not send nudge. Try again.', 'error')
    } else {
      showToast(`Nudge sent to ${client.client?.full_name || 'client'}.`, 'success')
    }

    setNudgeLoadingIds(prev => ({ ...prev, [client.client_id]: false }))
  }

  // Jump the new coach straight to the invite field from the empty-roster CTA.
  function focusInvite() {
    inviteInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => inviteInputRef.current?.focus(), 350)
  }

  async function checkAndInvite() {
    const normalizedEmail = inviteEmail.trim().toLowerCase()
    if (!normalizedEmail) return
    setInviteLink('')
    setInviteError('')
    setSoloAccountDetected(false)
    setPendingInviteEmail('')
    setInviteEmailedTo('')

    // Check if the email already has an account via a SECURITY DEFINER RPC —
    // profiles RLS hides other users' rows from the coach, so a direct read
    // always returned null and existing-account states never fired.
    const { data: lookupRows } = await supabase.rpc('invite_email_status', { p_email: normalizedEmail })
    const existing = (Array.isArray(lookupRows) ? lookupRows[0] : null) || null

    let existingRelation = null
    if (existing?.role === 'client') {
      const { data } = await supabase
        .from('coach_clients')
        .select('id')
        .eq('coach_id', profile.id)
        .eq('client_id', existing.id)
        .eq('status', 'active')
        .maybeSingle()
      existingRelation = data
    }

    const { data: pendingInvite } = await supabase
      .from('invitations')
      .select('id')
      .eq('coach_id', profile.id)
      .eq('client_email', normalizedEmail)
      .eq('status', 'pending')
      .maybeSingle()

    const blockReason = getInviteBlockReason(existing, existingRelation, pendingInvite)

    switch (blockReason) {
      case 'coach':
        setInviteError('This email belongs to a coach account and cannot be invited as a client.')
        setInviteLink('')
        return
      case 'already-your-client':
        setInviteError('This person is already your client.')
        setInviteLink('')
        return
      case 'client-of-another':
        setInviteError('This person is already connected to another coach.')
        setInviteLink('')
        return
      case 'duplicate-pending':
        setInviteError('You already sent an invite to this email.')
        setInviteLink('')
        return
      case 'existing-solo':
        setPendingInviteEmail(normalizedEmail)
        setSoloAccountDetected(true)
        return
      default:
        break
    }

    // No blocking account state - send invite
    await sendInvite(normalizedEmail)
  }

  async function sendInvite(email, accountExists = false) {
    // Prevent a rapid double-click from creating two pending invites (+ two emails).
    if (invitingRef.current) return
    invitingRef.current = true
    setInviting(true)
    try {
      const { data, error } = await supabase
        .from('invitations')
        .insert([{ coach_id: profile.id, client_email: email, account_exists: accountExists }])
        .select().single()
      if (error) {
        setInviteError('Error sending invite.')
        setInviteLink('')
        console.error(error)
      }
      else {
        setInviteLink(`${window.location.origin}/join?token=${data.token}`)
        setInviteError('')
        setInviteEmail('')
        setSoloAccountDetected(false)
        setPendingInviteEmail('')

        // Email the link straight to the client. The link stays on screen as a
        // fallback, so a failed/unconfigured email never blocks inviting.
        try {
          const { data: res, error: fnError } = await supabase.functions.invoke('notify-invite', {
            body: { invitationId: data.id },
          })
          if (fnError || !res?.success) throw fnError || new Error('send failed')
          setInviteEmailedTo(email)
          setToast({ message: `Invite emailed to ${email}`, type: 'success' })
        } catch (err) {
          console.error('notify-invite failed:', err)
          setInviteEmailedTo('')
          setToast({ message: "Couldn't email the invite. Copy the link below to share it.", type: 'error' })
        }
      }
    } finally {
      invitingRef.current = false
      setInviting(false)
    }
  }

  // Clients with a check-in the coach hasn't reviewed yet, oldest submission
  // first — so the roster banner's "check-ins to review" can jump straight to
  // the most-waiting one, and drain the queue one click at a time at any scale.
  const reviewClientIds = clients
    .filter(c => { const s = clientStats[c.client_id]; return s?.checkIn && !s.checkIn.reviewed_at })
    .sort((a, b) => (clientStats[a.client_id].checkIn.created_at || '').localeCompare(clientStats[b.client_id].checkIn.created_at || ''))
    .map(c => c.client_id)



  // One direction multiplier over every lens, so a new lens can never forget to
  // honour it.
  const dirMul = sortDir === 'best' ? -1 : 1
  const sortedClients = [...clients].sort((a, b) => dirMul * compareForLens(a, b))

  // Every lens sorts by the SAME grade the column shows, worst first. The old
  // per-lens comparators had drifted: compliance sorted by descending score and
  // "last logged" by ascending days, so both actually put the healthiest client
  // at the top while the header said "worst first".
  function compareForLens(a, b) {
    const sa = clientStats[a.client_id]
    const sb = clientStats[b.client_id]

    if (sortBy === 'attention') {
      const diff = compareByAttention(sa, sb)
      if (diff !== 0) return diff
      return (sb?.daysSinceLog ?? -1) - (sa?.daysSinceLog ?? -1)
    }

    const grade = LENS_GRADERS[sortBy]
    if (!grade) return 0
    const byTone = TONE_RANK[grade(sa).tone] - TONE_RANK[grade(sb).tone]
    if (byTone !== 0) return byTone

    // Within a tone, order by how bad it actually is.
    if (sortBy === 'compliance') return complianceRatio(sa) - complianceRatio(sb)
    if (sortBy === 'recent') return (sb?.daysSinceLog ?? 999) - (sa?.daysSinceLog ?? 999)
    return 0
  }

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1>Coach Dashboard</h1>
        <p style={{ marginTop: '4px', color: 'var(--color-muted)' }}>Welcome, {profile.full_name}</p>
      </div>

      {/* Roster triage headline */}
      {clients.length > 0 && !loading && (
        <RosterBanner
          roster={summarizeRoster(clientStats)}
          checkedIn={clients.filter(c => clientStats[c.client_id]?.checkIn).length}
          total={clients.length}
          onReviewClick={reviewClientIds.length ? () => navigate(`/client/${reviewClientIds[0]}?focus=checkIn`) : undefined}
        />
      )}

      {/* Client list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ ...cardStyle, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Skeleton width="38%" height="18px" />
                  <Skeleton width="64px" height="22px" borderRadius="999px" />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[...Array(4)].map((_, j) => <Skeleton key={j} width="66px" height="22px" borderRadius="999px" />)}
                </div>
              </div>
            ))}
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={(
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            )}
            title="Add your first client"
            description="Invite someone you coach by email. They get a link to join, and their logging shows up here for you to track."
            action={<Button variant="primary" onClick={focusInvite}>Invite your first client <Icon name="arrowRight" /></Button>}
          />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {clients.length > 1 && (
                <>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', alignSelf: 'center', marginRight: 4 }}>
                  View:
                </p>
                {[
                  { key: 'attention', label: 'Attention' },
                  { key: 'compliance', label: 'Compliance' },
                  { key: 'recent', label: 'Last logged' },
                  { key: 'checkin', label: 'Check-in' },
                ].map(({ key, label }) => (
                  <Pill
                    key={key}
                    active={sortBy === key}
                    aria-pressed={sortBy === key}
                    onClick={() => { setSortBy(key); setSortDir('worst') }}
                  >
                    {label}
                  </Pill>
                ))}
                </>
              )}
                <span style={{ marginLeft: 'auto', alignSelf: 'center', display: 'inline-flex', alignItems: 'center' }}>
                  <InfoTip text={`How to read a row

NEEDS ATTENTION is not one measurement — it is the single most pressing
thing about that client, whichever kind that happens to be:

  "5 days no log"      how recently they logged
  "No check-in"        they haven't submitted this period's check-in
  "Calories 2/7 days"  days on target in the last week
  "No targets set"     you haven't set what to measure against
  "Logged today"       nothing needs you

So read DOWN the column for who needs you, not to compare clients on the
same metric. Sorting by Attention puts the most pressing at the top.

COLOUR IS A GRADE, GREY MEANS NO GRADE EXISTS:

  RED     Intervene now.
  AMBER   Watch.
  GREEN   On track.
  GREY    Nothing to grade yet — no targets set.

CHECK-IN shows their latest self-ratings, adherence and energy, out of 10.
A dash means none submitted this period.`} />
                </span>
              </div>
            <Panel flush density="compact">
              {/* Column header. One row, not per-row noise — and it earns its
                  place by anchoring the tracker in TIME. Seven cells with no
                  axis are unreadable: "two green then grey" could mean a client
                  who just started or one who stopped four days ago, and a coach
                  cannot tell which end is today. */}
              <Row className="roster-row roster-head" cols="minmax(0, 1fr) 200px 104px 152px">
                <span className="ds-colhead">Client</span>
                <button
                  type="button"
                  className="ds-colhead ds-sortbtn"
                  onClick={() => setSortDir(d => (d === 'worst' ? 'best' : 'worst'))}
                  aria-label={`${LENS_HEADERS[sortBy] ?? LENS_HEADERS.attention}, ${sortDir} first. Click to reverse.`}
                >
                  {LENS_HEADERS[sortBy] ?? LENS_HEADERS.attention}
                  <Icon name={sortDir === 'worst' ? 'down' : 'up'} size={13} strokeWidth={2.5} />
                </button>
                <span className="ds-colhead">Check-in</span>
                <span />
              </Row>
              {sortedClients.map((c) => {
                const s = clientStats[c.client_id]
                const status = rosterStatus(sortBy, s)
                const nudge = nudgeReason({ daysSinceLog: s?.daysSinceLog, hasCheckIn: !!s?.checkIn, checkinDue: s?.checkinDue })
                return (
                  <Row key={c.id} className="roster-row" cols="minmax(0, 1fr) 200px 104px 152px">
                    {/* who */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <Avatar url={c.client?.avatar_url} name={c.client?.full_name || ''} size={30} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 'var(--text-base)', fontWeight: 600, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.client?.full_name || 'Unnamed'}
                        </p>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.client?.email}
                        </p>
                      </div>
                    </div>

                    {/* state — one fact, at a fixed x-position so it scans in one pass */}
                    <div
                      style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}
                      title={status.title}
                    >
                      <span style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: status.tone === 'green' || status.tone === 'setup' ? 500 : 700,
                        color: STATUS_TONES[status.tone] ?? 'var(--color-muted)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {status.text}
                      </span>
                      {s?.lockInfo?.locked && (
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-error)' }}>Locked</span>
                      )}
                    </div>

                    {/* check-in self-ratings — several facts, so a strip, not a pill */}
                    <div className="roster-strip" style={{ display: 'flex' }}>
                      {s?.checkIn ? (
                        <>
                          <StatCell k="Adh" v={`${s.checkIn.adherence_rating}/10`} />
                          <StatCell k="Nrg" v={`${s.checkIn.energy_level}/10`} />
                        </>
                      ) : (
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-faint)' }}>—</span>
                      )}
                    </div>

                    {/* 7 days of logging, oldest left */}
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      {/* Rank 3 (pale). Open is what a coach does on every row, so it
                          holds rank 2; Nudge appears only on some rows and emails a real
                          person, so it should not compete with the safe, exploratory
                          action beside it. Two elevated buttons side by side is rank
                          inflation: neither reads as the answer. */}
                      {nudge && (
                        <Button
                          onClick={() => nudgeClient(c, nudge)}
                          variant="ghost"
                          size="sm"
                          loading={Boolean(nudgeLoadingIds[c.client_id])}
                          title={nudge.key === 'checkin' ? 'Nudge them to do this week\u2019s check-in' : 'Nudge them to log \u2014 they\u2019ve gone quiet'}
                        >
                          Nudge
                        </Button>
                      )}
                      <Button onClick={() => navigate(`/client/${c.client_id}`)} variant="muted" size="sm">
                        Open <Icon name="right" />
                      </Button>
                    </div>
                  </Row>
                )
              })}
            </Panel>
          </>
        )}
      </div>

      {/* Invite section */}
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2>Invite a client</h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Field
            ref={inviteInputRef}
            type="email"
            placeholder="Client email"
            aria-label="Client email"
            value={inviteEmail}
            onChange={(e) => {
              setInviteEmail(e.target.value)
              setInviteError('')
              setInviteLink('')
            }}
            style={{ flex: 1, width: 'auto' }}
          />
          <Button onClick={checkAndInvite} variant="primary" loading={inviting} disabled={inviting}>Send invite</Button>
        </div>
        {soloAccountDetected && (
          <div style={{
            padding: '14px 16px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--color-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <p style={{ fontSize: 'var(--text-base)', margin: 0 }}>
              <strong>{pendingInviteEmail}</strong> already has a Gardnr account. Send them an invite to connect as your client? Their existing data will be preserved.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                onClick={() => sendInvite(pendingInviteEmail, true)}
                variant="primary"
                size="sm"
                loading={inviting}
                disabled={inviting}
              >
                Send invite anyway
              </Button>
              <Button
                onClick={() => { setSoloAccountDetected(false); setPendingInviteEmail('') }}
                variant="ghost"
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {inviteError && (
          <p style={{ color: 'var(--color-error)', fontSize: 'var(--text-base)' }}>{inviteError}</p>
        )}
        {inviteLink && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {inviteEmailedTo && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 600, margin: 0 }}>
                <Icon name="check" /> Invite emailed to {inviteEmailedTo}
              </p>
            )}
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 0 }}>
              {inviteEmailedTo ? 'Or share this link directly:' : 'Share this invite link:'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', wordBreak: 'break-all', margin: 0 }}>{inviteLink}</p>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteLink)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                } catch {
                  showToast('Couldn\'t copy. Select the link and copy it manually.', 'error')
                }
              }}
              style={{ backgroundColor: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '4px 10px', cursor: 'pointer', fontSize: 'var(--text-sm)', color: linkCopied ? 'var(--color-success)' : 'var(--color-text)', whiteSpace: 'nowrap', transition: 'color 120ms' }}
            >
              {linkCopied ? 'Copied' : 'Copy'}
            </button>
            </div>
          </div>
        )}
      </div>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />
    </div>
  )
}

export default CoachDashboard
