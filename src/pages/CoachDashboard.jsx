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
import { attentionLevel, compareByAttention, summarizeRoster } from '../utils/attentionLevel'
import { nudgeReason } from '../utils/nudgeReason'
import { cardStyle } from '../utils/styles'
import { Pill, Field, Icon, Panel, Row, Tracker } from '../components/ui'

const attentionColors = { red: 'var(--color-error)', yellow: 'var(--color-warning)', green: 'var(--color-success)' }


// Page-level triage headline — NOT a card. Rule 1: the page itself is never a
// box, so this sits on the page ground with space separating it, not a border.
// A banner CTA. Every headline number that names work the coach has to do is
// one of these, so a count is never a dead end: it says how many AND takes you
// to the first one.
function BannerAction({ onClick, title, children }) {
  const [hover, setHover] = useState(false)
  const live = Boolean(onClick)
  return (
    <button
      onClick={onClick}
      disabled={!live}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        fontFamily: 'inherit', fontSize: 'var(--text-xs)', fontWeight: 700,
        color: hover && live ? 'var(--color-on-accent)' : 'var(--color-primary)',
        background: hover && live ? 'var(--color-primary)' : 'var(--control-bg)',
        border: `1px solid ${hover && live ? 'var(--color-primary)' : 'color-mix(in srgb, var(--color-primary) 40%, transparent)'}`,
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
function RosterBanner({ roster, checkedIn, total, onReviewClick, onTargetsClick }) {
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
        {roster.noTargets > 0 && (
          <BannerAction onClick={onTargetsClick} title="Open the first client who has no targets">
            {roster.noTargets} {roster.noTargets === 1 ? 'client needs' : 'clients need'} targets
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

function scoreClient(s) {
  if (!s) return -1
  return s.complianceItems
    .filter(i => i.hasData)
    .reduce((sum, i) => sum + i.value, 0)
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

  function logLabel(days) {
    if (days === null) return 'Never logged'
    if (days === 0) return 'Logged today'
    if (days === 1) return 'Logged yesterday'
    return `${days} days ago`
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


  // A client with no targets can't be compliant with anything — same predicate
  // summarizeRoster counts, so the banner and this list can never disagree.
  const noTargetClientIds = clients
    .filter(c => !(clientStats[c.client_id]?.complianceItems?.length))
    .map(c => c.client_id)

  const sortedClients = [...clients].sort((a, b) => {
    const sa = clientStats[a.client_id]
    const sb = clientStats[b.client_id]

    if (sortBy === 'attention') {
      const diff = compareByAttention(sa, sb)
      if (diff !== 0) return diff
      return (sa?.daysSinceLog ?? 999) - (sb?.daysSinceLog ?? 999)
    }

    if (sortBy === 'compliance') {
      const diff = scoreClient(sb) - scoreClient(sa)
      if (diff !== 0) return diff
      const da = sa?.daysSinceLog ?? 999
      const db = sb?.daysSinceLog ?? 999
      return da - db
    }

    if (sortBy === 'recent') {
      const da = sa?.daysSinceLog ?? 999
      const db = sb?.daysSinceLog ?? 999
      return da - db
    }

    if (sortBy === 'checkin') {
      const ca = sa?.checkIn ? 1 : 0
      const cb = sb?.checkIn ? 1 : 0
      return cb - ca
    }

    return 0
  })

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
          onTargetsClick={noTargetClientIds.length ? () => navigate(`/client/${noTargetClientIds[0]}?focus=targets`) : undefined}
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
                  Sort:
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
                    onClick={() => setSortBy(key)}
                  >
                    {label}
                  </Pill>
                ))}
                </>
              )}
                <span style={{ marginLeft: 'auto', alignSelf: 'center', display: 'inline-flex', alignItems: 'center' }}>
                  <InfoTip text={`How to read a roster row:

\u25b8 Status pill — the single most pressing thing. Green on track \u00b7 amber watch \u00b7 red intervene now.

\u25b8 Adh / Nrg — the client's latest check-in self-ratings, each out of 10.

\u25b8 The seven blocks — the last 7 days, oldest on the left. Green hit the calorie target, amber logged but short, grey nothing logged.`} />
                </span>
              </div>
            <Panel flush density="compact">
              {sortedClients.map((c) => {
                const s = clientStats[c.client_id]
                const triage = attentionLevel(s)
                const nudge = nudgeReason({ daysSinceLog: s?.daysSinceLog, hasCheckIn: !!s?.checkIn, checkinDue: s?.checkinDue })
                return (
                  <Row key={c.id} className="roster-row" cols="minmax(0, 1fr) 168px 104px 100px 152px">
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
                      title={triage.reasons.length ? triage.reasons.join(' \u00b7 ') : logLabel(s?.daysSinceLog)}
                    >
                      <span style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: triage.level === 'green' ? 500 : 700,
                        color: triage.level === 'green' ? 'var(--color-muted)' : attentionColors[triage.level],
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {triage.level === 'green' ? logLabel(s?.daysSinceLog) : triage.reasons[0]}
                      </span>
                      {s?.lockInfo?.locked && (
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-error)' }}>Locked</span>
                      )}
                      {/* A coach to-do, not a client failing: without targets there is
                          nothing to be compliant WITH, so triage would happily call
                          this client "on track" and say nothing. */}
                      {s && !s.complianceItems?.length && (
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-warning)' }}>
                          No targets set
                        </span>
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
                    <Tracker days={s?.logDays || []} label={`Last 7 days: ${(s?.logDays || []).filter(d => d === 'on').length} on target`} />

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
