import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useTabReturn } from '../hooks/useTabReturn'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import Toast from '../components/Toast'
import Modal from '../components/Modal'
import ActionSheet from '../components/ActionSheet'
import PushPanel from '../components/PushPanel'
import CheckinQueue from './CheckinQueue'
import { PauseSheet, GroupsSheet } from '../components/ClientSheets'
import { useCoachGroups } from '../hooks/useCoachGroups'
import { shortDay } from '../utils/pause'
import Skeleton from '../components/Skeleton'
import InfoTip from '../components/InfoTip'
import { computeClientStats } from '../utils/clientStats'
import { getInviteBlockReason } from '../utils/inviteValidation'
import { attentionLevel, summarizeRoster, TONE_RANK } from '../utils/attentionLevel'
import { nudgeReason } from '../utils/nudgeReason'
import { waitingFrom } from '../utils/reviewQueue'
import { rosterStatus, LENS_HEADERS, LENS_GRADERS, lensToneRank } from '../utils/rosterStatus'

// Fraction of target days hit, for ordering within a compliance tone.
function complianceRatio(s) {
  const items = (s?.complianceItems || []).filter(i => i.hasData)
  if (!items.length) return -1
  return items.reduce((t, i) => t + i.value, 0) / (items.length * 7)
}
import { cardStyle } from '../utils/styles'
import { Pill, Field, Icon, Panel, Row, Textarea } from '../components/ui'
import { scrollBehavior } from '../utils/motion'
import { formatAnswer } from '../utils/checkinQuestions'

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
  paused: 'var(--color-muted)',   // NOT a grade — the coach paused them
}




// Page-level triage headline — NOT a card. Rule 1: the page itself is never a
// box, so this sits on the page ground with space separating it, not a border.
// The roster's counts, as tiles (Apple Fitness's Summary): a label, the
// number large beneath it. The three grades and Paused are also the roster's
// filters, Everfit's "views with live counts": tap one to see only those
// clients, tap it again for everyone. "Needs attention", not "needs review":
// "review" belongs to the check-ins button, and two numbers both said it.
function RosterBanner({ roster, checkedIn, total, filter, onFilter }) {
  const tile = (level, color, n, label) => (
    <button
      key={level}
      type="button"
      className={`rost-tile rost-tile-${level} ds-control`}
      aria-pressed={filter === level}
      disabled={n === 0 && filter !== level}
      onClick={() => onFilter(filter === level ? null : level)}
    >
      <span className="rost-tile-label">{label}</span>
      <span className="rost-tile-n tnum" style={{ color }}>{n}</span>
    </button>
  )
  const showPaused = roster.paused > 0 || filter === 'paused'
  return (
    <div className={`rost-banner${showPaused ? ' has-paused' : ''}`}>
      {tile('red', attentionColors.red, roster.atRisk, 'At risk')}
      {tile('yellow', attentionColors.yellow, roster.review, 'Needs attention')}
      {tile('green', attentionColors.green, roster.onTrack, 'On track')}
      {showPaused && tile('paused', 'var(--color-text)', roster.paused, 'Paused')}
      {/* A ratio, not a filter: a tile you cannot press, so it has no
          pressed state and is not a button. */}
      <div className="rost-tile rost-tile-static">
        <span className="rost-tile-label">Checked in this week</span>
        <span className="rost-tile-n tnum">{checkedIn}<span style={{ color: 'var(--color-muted)' }}>/{total}</span></span>
      </div>
    </div>
  )
}

// The one commit on the page: it opens work that ends in a message to a real
// person, so it takes the filled brand green. Beside Invite on a desktop;
// full width under the tiles on a phone.
function ReviewButton({ count, onClick }) {
  if (!count) return null
  return (
    <Button variant="primary" size="sm" onClick={onClick} disabled={!onClick} className="rost-review">
      {count} check-in{count === 1 ? '' : 's'} to review
      <Icon name="right" />
    </Button>
  )
}

// One cell of a stat strip: mono label over a tabular value, hairline divider
// between cells. The shape for "several facts about one subject" — a pill holds
// exactly one fact.
// The phone row's check-in line: only the ratings the client gave (a blank
// one printed "null/10"). "Adh" so it fits one line; the desktop header and
// the help spell it out.
function checkinLine(s) {
  const c = s?.checkIn
  if (!c || (c.adherence_rating == null && c.energy_level == null)) return ''
  return [
    c.adherence_rating != null && `Adh ${c.adherence_rating}/10`,
    c.energy_level != null && `Energy ${c.energy_level}/10`,
  ].filter(Boolean).join(' · ')
}

function StatCell({ k, v }) {
  return (
    <span className="ds-statcell">
      <span style={{ fontSize: 'var(--text-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-faint)', fontWeight: 'var(--weight-medium)' }}>{k}</span>
      <span className="tnum" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)', lineHeight: 1.2 }}>{v}</span>
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
  // Narrowing the list: a banner count (attention level) and a name search.
  const [levelFilter, setLevelFilter] = useState(null)
  const [query, setQuery] = useState('')
  // Invites sent and not yet accepted: who to chase, and the link to resend.
  const [pendingInvites, setPendingInvites] = useState([])
  const [resentIds, setResentIds] = useState(() => new Set())
  // Groups: the coach's labels, and who is in each (shared with the record).
  const groupApi = useCoachGroups(profile.id, showToast)
  const { groups, members } = groupApi
  const [groupFilter, setGroupFilter] = useState('')
  // The row's ⋯ menu and the sheets it opens.
  const [menuFor, setMenuFor] = useState(null)
  const [pauseFor, setPauseFor] = useState(null)
  const [groupsFor, setGroupsFor] = useState(null)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const lastBroadcastAt = useRef(0)
  const [linkCopied, setLinkCopied] = useState(false)
  const navigate = useNavigate()
  // The roster is a TABLE on a desktop and a LIST on a phone. Collapsing the
  // grid was not enough: it left three column headers labelling columns that
  // no longer existed, an email truncated mid-domain, and a bare dash holding
  // a line. Below this width the row is rebuilt, not re-flowed.
  const compact = useMediaQuery('(max-width: 900px)')
  // On a phone the check-in queue is PUSHED over the roster, sliding in from
  // the right like every other page a chevron opens (components/PushPanel).
  // Its state is in the roster's own URL, so the back gesture closes it and
  // the roster underneath never unmounts.
  const [searchParams] = useSearchParams()
  const queueOpen = compact && searchParams.get('panel') === 'checkins'
  const queueItem = searchParams.get('ci') || null
  const openQueue = () => (compact ? navigate('/?panel=checkins') : navigate('/check-ins'))

  useEffect(() => {
    fetchClients()
    fetchPendingInvites()
  }, [])
  // Back on this tab (kept alive): refresh the roster in place, without the
  // loading state, so the list the coach left stays put while it updates.
  useTabReturn(() => { fetchClients({ silent: true }); fetchPendingInvites() })

  async function savePause(until, reason) {
    const c = pauseFor
    const { error } = await supabase.from('coach_clients')
      .update({ paused_until: until, pause_reason: reason, paused_at: new Date().toISOString() })
      .eq('id', c.id)
    if (error) { showToast("Couldn't pause. Try again.", 'error'); return }
    setPauseFor(null)
    showToast(`${c.client?.full_name || 'Client'} paused until ${shortDay(until)}.`, 'success')
    fetchClients({ silent: true })
  }

  async function resumeClient(c) {
    const { error } = await supabase.from('coach_clients')
      .update({ paused_until: null, pause_reason: null, paused_at: null }).eq('id', c.id)
    if (error) { showToast("Couldn't resume. Try again.", 'error'); return }
    showToast(`${c.client?.full_name || 'Client'} is back on the roster.`, 'success')
    fetchClients({ silent: true })
  }

  // One message to each client in the group, each a normal message in their
  // own thread ("{first name}" filled in per client). Everfit's broadcast,
  // with its two-minute gap between sends.
  async function sendBroadcast(recipients) {
    const text = broadcastText.trim()
    if (!text || !recipients.length) return
    if (Date.now() - lastBroadcastAt.current < 2 * 60 * 1000) { showToast('Wait two minutes between group messages.', 'error'); return }
    setBroadcasting(true)
    const rows = recipients.map(c => ({
      coach_id: profile.id, client_id: c.client_id, sender_id: profile.id,
      content: text.replace(/\{first name\}/gi, (c.client?.full_name || '').split(' ')[0] || 'there'),
    }))
    const { error } = await supabase.from('messages').insert(rows)
    setBroadcasting(false)
    if (error) { showToast("Couldn't send. Nothing was sent. Try again.", 'error'); return }
    lastBroadcastAt.current = Date.now()
    setBroadcastOpen(false); setBroadcastText('')
    showToast(`Sent to ${recipients.length} client${recipients.length === 1 ? '' : 's'}.`, 'success')
  }

  async function fetchPendingInvites() {
    const { data, error } = await supabase
      .from('invitations').select('id, client_email, token, created_at')
      .eq('coach_id', profile.id).eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) { console.error(error); return }
    setPendingInvites(data || [])
  }

  async function resendInvite(inv) {
    const { data: res, error } = await supabase.functions.invoke('notify-invite', { body: { invitationId: inv.id } })
    if (error || !res?.success) { showToast("Couldn't resend. Copy the link instead.", 'error'); return }
    setResentIds(prev => new Set(prev).add(inv.id))
    showToast(`Invite resent to ${inv.client_email}`, 'success')
  }

  async function cancelInvite(inv) {
    const { error } = await supabase.from('invitations').delete().eq('id', inv.id)
    if (error) { showToast("Couldn't cancel the invite. Try again.", 'error'); return }
    setPendingInvites(prev => prev.filter(i => i.id !== inv.id))
  }

  async function copyInviteLink(inv) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join?token=${inv.token}`)
      showToast('Invite link copied', 'success')
    } catch {
      showToast("Couldn't copy the link.", 'error')
    }
  }

  async function fetchClients({ silent = false } = {}) {
    if (!silent) setLoading(true)

    const { data: relationships, error } = await supabase
      .from('coach_clients')
      .select('id, coach_id, client_id, status, created_at, lock_cleared_at, last_nudged_at, checkin_interval_weeks, checkin_weekday, paused_until, pause_reason')
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
    inviteInputRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
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
        fetchPendingInvites()
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
  //
  // The RULE lives in reviewQueue.js because the client record asks the same
  // question of the database, and two spellings of one rule is how
  // `week_of === period.weekOf` ended up in three places.
  const reviewClientIds = waitingFrom(
    Object.fromEntries(clients.map(c => [c.client_id, clientStats[c.client_id]?.checkIn || null])),
  )



  // One direction multiplier over every lens, so a new lens can never forget to
  // honour it.
  const dirMul = sortDir === 'best' ? -1 : 1
  const q = query.trim().toLowerCase()
  const sortedClients = [...clients]
    .filter(c => !levelFilter || attentionLevel(clientStats[c.client_id]).level === levelFilter)
    .filter(c => !groupFilter || members.some(m => m.group_id === groupFilter && m.client_id === c.client_id))
    .filter(c => !q || (c.client?.full_name || '').toLowerCase().includes(q) || (c.client?.email || '').toLowerCase().includes(q))
    .sort((a, b) => dirMul * compareForLens(a, b))

  // Every lens sorts by the SAME grade the column shows, worst first. The old
  // per-lens comparators had drifted: compliance sorted by descending score and
  // "last logged" by ascending days, so both actually put the healthiest client
  // at the top while the header said "worst first".
  function compareForLens(a, b) {
    const sa = clientStats[a.client_id]
    const sb = clientStats[b.client_id]

    if (sortBy === 'attention') {
      // Grade first (red, grey, amber, green, paused). Within a grade, the
      // longest silence first: a client who stopped logging needs the coach
      // before one who logs daily and misses targets. "Never logged" counts
      // from the day they joined, so a client silent since joining three
      // weeks ago ranks above one quiet for six days, not below everyone.
      const ta = attentionLevel(sa), tb = attentionLevel(sb)
      const byTone = TONE_RANK[ta.tone] - TONE_RANK[tb.tone]
      if (byTone !== 0) return byTone
      const quiet = (s, c) => s?.daysSinceLog ?? Math.floor((Date.now() - new Date(c.created_at)) / 86400000)
      const byQuiet = quiet(sb, b) - quiet(sa, a)
      if (byQuiet !== 0) return byQuiet
      return tb.reasons.length - ta.reasons.length
    }

    const grade = LENS_GRADERS[sortBy]
    if (!grade) return 0
    const byTone = lensToneRank(sortBy, grade(sa).tone) - lensToneRank(sortBy, grade(sb).tone)
    if (byTone !== 0) return byTone

    // Within a tone, order by how bad it actually is.
    if (sortBy === 'compliance') return complianceRatio(sa) - complianceRatio(sb)
    if (sortBy === 'recent') return (sb?.daysSinceLog ?? 999) - (sa?.daysSinceLog ?? 999)
    return 0
  }

  return (
    <div className="page-fade-in roster-page" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
      {/* Title and the one way to grow the roster, where every coaching app
          puts it. "Welcome, <name>" is gone: the coach knows who they are, and
          it pushed the triage line down on the screen that exists for it. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-12)' }}>
        {/* The roster's "how to read a row" help hangs off the page TITLE.
            It used to be a bare mark floating at the end of the lens bar,
            which is the shape F12 argues against — and this one had nothing to
            attach to, because the Panel below carries no title and the column
            header it explains is itself a sort BUTTON, which cannot host a tip
            without nesting a tab stop inside a role="note". The page title is
            the one non-interactive word on the screen that names the thing the
            help is about, and below 600px the mark drops entirely.

            This was a laid-out table of examples against their meanings, in
            aligned columns. It never rendered as one: `.info-tip-bubble` sets
            `white-space: pre-line`, which keeps newlines and COLLAPSES runs of
            spaces, so every column landed one space after its label. The
            examples are inline prose now, which is what it was displaying
            anyway, at half the height. */}
        <h1><InfoTip text={`How to read the list

STATUS is the one thing about each client that most needs you: "5 days no log", "No check-in", "Calories 2/7 days". Read down it for who to start with.

Colour is the grade: red now, amber soon, green on track. Grey has nothing to grade: no targets set, or paused.

Tap a tile to see only those clients.

CHECK-IN is their latest adherence and energy, out of 10.`}>Clients</InfoTip></h1>
        {clients.length > 0 && (
          <span style={{ display: 'inline-flex', gap: 'var(--space-8)', alignItems: 'center' }}>
            {!compact && !loading && (
              <ReviewButton count={summarizeRoster(clientStats).checkInsToReview} onClick={reviewClientIds.length ? openQueue : undefined} />
            )}
            <Button variant="muted" size="sm" onClick={focusInvite}><Icon name="plus" /> Invite</Button>
          </span>
        )}
      </div>

      {/* Roster triage headline */}
      {clients.length > 0 && !loading && (
        <RosterBanner
          roster={summarizeRoster(clientStats)}
          checkedIn={clients.filter(c => clientStats[c.client_id]?.checkIn).length}
          total={clients.length}
          /* To the LIST, not to whichever client waited longest. Picking for
             the coach treated clients as interchangeable — they are not, and a
             coach who knows which one is drifting wants to start there. The
             chain is still available, inside the pop-up. */
          filter={levelFilter}
          onFilter={setLevelFilter}
        />
      )}
      {compact && clients.length > 0 && !loading && (
        <ReviewButton count={summarizeRoster(clientStats).checkInsToReview} onClick={reviewClientIds.length ? openQueue : undefined} />
      )}

      {/* Client list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ ...cardStyle, padding: 'var(--space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Skeleton width="38%" height="18px" />
                  <Skeleton width="64px" height="22px" borderRadius="999px" />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
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
            /* No button: the invite form is directly below, and a button that
               only scrolled to it was a second control for one job. Once an
               invite is out, the empty list is a wait, not a to-do. */
            title={pendingInvites.length ? 'Waiting for your clients to join' : 'Add your first client'}
            description={pendingInvites.length
              ? 'They appear here once they accept their invite.'
              : 'Invite by email below. Their logging appears here once they join.'}
          />
        ) : (
          <>
            <div className="rost-lensbar" style={{ display: 'flex', gap: 'var(--space-8)', marginBottom: 'var(--space-12)', flexWrap: 'wrap', alignItems: 'center' }}>
              {clients.length > 1 && (
                <>
                <p className="rost-lenslabel" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', alignSelf: 'center', marginRight: 'var(--space-4)' }}>
                  View:
                </p>
                {/* `display: contents` on a desktop, so this wrapper is not in
                    the layout at all; a real scroll strip on a phone, where
                    four chips cannot fit a 390px line and wrapping them left
                    one chip stranded on a row of its own. */}
                <span className="rost-chips">
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
                </span>
                </>
              )}
                {compact && clients.length > 1 && (
                  /* The direction control lived in the column header, which a
                     phone no longer renders. Sorting is the chips' job here. */
                  <button
                    type="button"
                    className="ds-colhead ds-sortbtn ds-control"
                    onClick={() => setSortDir(d => (d === 'worst' ? 'best' : 'worst'))}
                    aria-label={`Sorted ${sortDir} first. Tap to reverse.`}
                  >
                    {sortDir === 'worst' ? 'Worst first' : 'Best first'}
                    <Icon name={sortDir === 'worst' ? 'down' : 'up'} size={13} strokeWidth={2.5} />
                  </button>
                )}
                {/* Find one client by name or email. Scrolling stops working as
                    the way to find someone somewhere past a screenful. */}
                {clients.length > 1 && (
                  <label className="rost-search">
                    <Icon name="search" size={15} />
                    <input
                      type="search"
                      placeholder="Search clients"
                      aria-label="Search clients"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                )}
                {groups.length > 0 && (
                  <select
                    className="rost-groupsel"
                    aria-label="Group"
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                  >
                    <option value="">All groups</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({members.filter(m => m.group_id === g.id).length})
                      </option>
                    ))}
                  </select>
                )}
                {groupFilter && sortedClients.length > 0 && (
                  <Button variant="muted" size="sm" onClick={() => setBroadcastOpen(true)}>
                    <Icon name="message" /> Message group
                  </Button>
                )}
              </div>
            {sortedClients.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', padding: 'var(--space-24)' }}>
                <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-base)' }}>
                  {q ? `No clients match "${query.trim()}"` : 'No clients here'}
                </p>
                <Button variant="ghost" size="sm" style={{ marginTop: 'var(--space-8)' }} onClick={() => { setQuery(''); setLevelFilter(null) }}>Show all clients</Button>
              </div>
            ) : (
            <Panel flush density="compact">
              {/* Column header. One row, not per-row noise — and it earns its
                  place by anchoring the tracker in TIME. Seven cells with no
                  axis are unreadable: "two green then grey" could mean a client
                  who just started or one who stopped four days ago, and a coach
                  cannot tell which end is today. */}
              {!compact && (
              <Row className="roster-row roster-head" cols="minmax(160px, 280px) minmax(160px, 1fr) 176px 212px">
                <span className="ds-colhead">Client</span>
                <button
                  type="button"
                  className="ds-colhead ds-sortbtn ds-control"
                  onClick={() => setSortDir(d => (d === 'worst' ? 'best' : 'worst'))}
                  aria-label={`${LENS_HEADERS[sortBy] ?? LENS_HEADERS.attention}, ${sortDir} first. Click to reverse.`}
                >
                  {LENS_HEADERS[sortBy] ?? LENS_HEADERS.attention}
                  <Icon name={sortDir === 'worst' ? 'down' : 'up'} size={13} strokeWidth={2.5} />
                </button>
                <span className="ds-colhead">Check-in</span>
                <span />
              </Row>
              )}
              {sortedClients.map((c) => {
                const s = clientStats[c.client_id]
                const status = rosterStatus(sortBy, s)
                const nudge = s?.pausedUntil ? null : nudgeReason({ daysSinceLog: s?.daysSinceLog, hasCheckIn: !!s?.checkInCurrent, checkinDue: s?.checkinDue })
                return (
                  compact ? (
                  <Row key={c.id} className="roster-row rost-m" cols="minmax(0, 1fr) auto">
                    {/* One link, not four cells. The whole row is the target —
                        a list row on a phone is a thing you tap, and the
                        chevron says so (D3). It carries the status `fix`
                        destination when there is one, so "No targets set"
                        still lands on targets without nesting a button inside
                        a link, which is invalid and unreachable by keyboard. */}
                    <Link
                      to={`/client/${c.client_id}${status.fix ? `?focus=${status.fix}` : ''}`}
                      className="rost-m-main ds-control"
                    >
                      <Avatar url={c.client?.avatar_url} name={c.client?.full_name || ''} size={34} />
                      <span className="rost-m-body">
                        <span className="rost-m-name">{c.client?.full_name || 'Unnamed'}</span>
                        <span
                          className="rost-m-state"
                          style={{
                            fontWeight: ['green', 'setup', 'paused'].includes(status.tone) ? 'var(--weight-normal)' : 'var(--weight-semibold)',
                            color: STATUS_TONES[status.tone] ?? 'var(--color-muted)',
                          }}
                        >
                          {status.text}
                        </span>
                        {/* The email is gone and the dash with it. A phone row
                            gets the facts that change: who, what needs doing,
                            and their own ratings when they submitted any. */}
                        {/* Only the ratings the client actually gave: a check-in
                            can arrive with either one blank, and printing the raw
                            value wrote "null/10". */}
                        {checkinLine(s) && <span className="sr-only">{checkinLine(s)}</span>}
                        {/* Only when the status is not already saying it. The
                            triage line surfaces "Locked" as its own reason, so
                            a locked client read Locked twice, once in red and
                            once under it in red. */}
                        {s?.lockInfo?.locked && status.text !== 'Locked' && (
                          <span className="rost-m-locked">Locked</span>
                        )}
                      </span>
                    </Link>
                    {/* No chevron. It cannot live inside the link without
                        sliding to the middle of any row that also has a Nudge,
                        and outside the link it is a direction cue you cannot
                        press — it looked like the target and was not one. The
                        row is a list row: it presses, it highlights, and the
                        cue it needs is behaviour rather than a mark that lies
                        about where to aim. */}
                    <span className="rost-m-tail">
                      <button type="button" className="rost-m-more ds-control" onClick={() => setMenuFor(c)} aria-label={`More for ${c.client?.full_name || 'client'}`}>
                        <Icon name="more" />
                      </button>
                      {nudge && (
                        <Button
                          onClick={() => nudgeClient(c, nudge)}
                          variant="action"
                          size="sm"
                          loading={Boolean(nudgeLoadingIds[c.client_id])}
                        >
                          Nudge
                        </Button>
                      )}
                    </span>
                    {/* The ratings get the row's full width on a line of their
                        own, under Nudge too, so they never wrap or cut off
                        beside it. A second link to the same place, hidden from
                        screen readers (the main link carries the text). */}
                    {checkinLine(s) && (
                      <Link
                        to={`/client/${c.client_id}${status.fix ? `?focus=${status.fix}` : ''}`}
                        className="rost-m-metarow tnum"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        {checkinLine(s)}
                      </Link>
                    )}
                  </Row>
                  ) : (
                  <Row
                    key={c.id}
                    className="roster-row roster-row-link"
                    cols="minmax(160px, 280px) minmax(160px, 1fr) 176px 212px"
                    /* The whole row opens the client, as a list row does in
                       every roster on the market; it was one small "Open"
                       button at the far edge. The name is the real link, for
                       the keyboard and screen readers; the buttons inside the
                       row stop the click from also opening the record. */
                    onClick={(e) => { if (!e.target.closest('button, a')) navigate(`/client/${c.client_id}`) }}
                  >
                    {/* who */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-10)', minWidth: 0 }}>
                      <Avatar url={c.client?.avatar_url} name={c.client?.full_name || ''} size={30} />
                      <div style={{ minWidth: 0 }}>
                        {/* Name only. The email under every name was half of each
                            row's text on a screen read for who needs you; it
                            stays on the client record and in search. */}
                        <Link
                          to={`/client/${c.client_id}`}
                          className="roster-name"
                          style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)', textDecoration: 'none' }}
                        >
                          {c.client?.full_name || 'Unnamed'}
                        </Link>
                      </div>
                    </div>

                    {/* state — one fact, at a fixed x-position so it scans in one pass */}
                    <div
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}
                      title={status.title}
                    >
                      {status.fix ? (
                        // A gap the coach can close in seconds should not be a
                        // dead-end label. Responds with its TYPE like the column
                        // header — it sits in a data cell, and a box here would
                        // read as a chip.
                        <button
                          type="button"
                          className="ds-fixbtn ds-control"
                          onClick={() => navigate(`/client/${c.client_id}?focus=${status.fix}`)}
                        >
                          {status.text}
                          <Icon name="right" size={12} strokeWidth={2.5} />
                        </button>
                      ) : (
                        <span style={{
                          fontSize: 'var(--text-sm)',
                          fontWeight: ['green', 'setup', 'paused'].includes(status.tone) ? 'var(--weight-normal)' : 'var(--weight-semibold)',
                          color: STATUS_TONES[status.tone] ?? 'var(--color-muted)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {status.text}
                        </span>
                      )}
                      {s?.lockInfo?.locked && (
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-error)' }}>Locked</span>
                      )}
                    </div>

                    {/* check-in self-ratings — several facts, so a strip, not a pill */}
                    <div className="roster-strip" style={{ display: 'flex' }}>
                      {s?.checkIn ? (
                        <>
                          {/* A column holds its place, so a blank rating reads as
                              a dash (formatAnswer), never "null/10". */}
                          {/* Words, not "ADH" and "NRG": an abbreviation the
                              coach has to decode on every row. */}
                          <StatCell k="Adherence" v={formatAnswer({ type: 'rating', value: s.checkIn.adherence_rating })} />
                          <StatCell k="Energy" v={formatAnswer({ type: 'rating', value: s.checkIn.energy_level })} />
                        </>
                      ) : (
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-faint)' }}>—</span>
                      )}
                    </div>

                    {/* 7 days of logging, oldest left */}
                    <div style={{ display: 'flex', gap: 'var(--space-6)', justifyContent: 'flex-end' }}>
                      {/* Rank 3 (pale). Open is what a coach does on every row, so it
                          holds rank 2; Nudge appears only on some rows and emails a real
                          person, so it should not compete with the safe, exploratory
                          action beside it. Two elevated buttons side by side is rank
                          inflation: neither reads as the answer. */}
                      {nudge && (
                        <Button
                          onClick={() => nudgeClient(c, nudge)}
                          variant="action"
                          size="sm"
                          loading={Boolean(nudgeLoadingIds[c.client_id])}
                          title={nudge.key === 'checkin' ? 'Nudge them to do this week\u2019s check-in' : 'Nudge them to log \u2014 they\u2019ve gone quiet'}
                        >
                          Nudge
                        </Button>
                      )}
                      {/* Messaging, the task coaches do most after reading this
                          list, one click from the row (TrueCoach's chat icon). */}
                      <Button onClick={() => navigate(`/client/${c.client_id}?focus=chat`)} variant="muted" size="sm" ariaLabel={`Message ${c.client?.full_name || 'client'}`}>
                        <Icon name="message" size={17} />
                      </Button>
                      <Button onClick={() => setMenuFor(c)} variant="muted" size="sm" ariaLabel={`More for ${c.client?.full_name || 'client'}`}>
                        <Icon name="more" />
                      </Button>
                      <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-faint)' }}><Icon name="right" /></span>
                    </div>
                  </Row>
                  )
                )
              })}
            </Panel>
            )}
          </>
        )}
      </div>

      <PushPanel
        id="push-checkins"
        open={queueOpen}
        title="Check-ins to review"
        backLabel="Clients"
        onBack={() => { navigate('/', { replace: true }); fetchClients({ silent: true }) }}
        under=".roster-page"
      >
        <CheckinQueue
          profile={profile}
          embedded
          openId={queueItem}
          onOpen={(id, opts) => navigate(`/?panel=checkins&ci=${id}`, opts)}
          onCloseItem={() => navigate('/?panel=checkins', { replace: true })}
        />
      </PushPanel>

      <ActionSheet
        open={Boolean(menuFor)}
        title={menuFor?.client?.full_name}
        onClose={() => setMenuFor(null)}
        actions={menuFor ? [
          clientStats[menuFor.client_id]?.pausedUntil
            ? { label: 'Resume coaching', icon: 'repeat', onSelect: () => resumeClient(menuFor) }
            : { label: 'Pause coaching', icon: 'calendar', onSelect: () => setPauseFor(menuFor) },
          { label: 'Groups', icon: 'grip', onSelect: () => setGroupsFor(menuFor) },
        ] : []}
      />

      <PauseSheet open={Boolean(pauseFor)} name={pauseFor?.client?.full_name} onClose={() => setPauseFor(null)} onSave={savePause} />

      <GroupsSheet open={Boolean(groupsFor)} clientId={groupsFor?.client_id} api={groupApi} onClose={() => setGroupsFor(null)}
        onDeleted={(g) => { if (groupFilter === g.id) setGroupFilter('') }} />

      <Modal open={broadcastOpen} title={`Message ${groups.find(g => g.id === groupFilter)?.name || 'group'}`} onClose={() => setBroadcastOpen(false)} maxWidth={480} sheet>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
          <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
            Each of the {sortedClients.length} gets it in their own conversation. "{'{first name}'}" becomes each client's first name.
          </p>
          <Textarea rows={5} value={broadcastText} maxLength={2000} onChange={(e) => setBroadcastText(e.target.value)} placeholder="Hi {first name}, ..." aria-label="Message" />
          <Button variant="primary" onClick={() => sendBroadcast(sortedClients)} loading={broadcasting} disabled={!broadcastText.trim()}>
            Send to {sortedClients.length}
          </Button>
        </div>
      </Modal>

      {/* Invite section */}
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
        <h2>Invite a client</h2>
        {/* A button PAIRED WITH A TEXT INPUT matches the input, not the 30px
            standalone control height — `stretch` is doing that here on purpose,
            and it is why this one is `md` while every free-standing button on
            these two screens is `sm`. Cloudflare's "Invite members" sits level
            with its search field for the same reason. */}
        <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap', alignItems: 'stretch' }}>
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
          <Button onClick={checkAndInvite} variant="primary" size="md" loading={inviting} disabled={inviting}>Send invite</Button>
        </div>
        {/* Sent and not yet accepted. There was no trace of an invite once the
            field cleared: a coach could not see who had not joined, chase them,
            or take an invite back (Everfit's "Waiting activation"). */}
        {pendingInvites.length > 0 && (
          <div>
            <p className="ds-colhead" style={{ margin: 'var(--space-8) 0 var(--space-4)' }}>Not joined yet</p>
            {pendingInvites.map((inv, i) => (
              <div key={inv.id} className="rost-invite" style={{ borderTop: i ? '1px solid var(--color-border)' : 'none' }}>
                <div className="rost-invite-who">
                  <p style={{ margin: 0, fontSize: 'var(--text-base)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.client_email}</p>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                    Invited {new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                <div className="rost-invite-actions">
                  <Button variant="ghost" size="sm" onClick={() => copyInviteLink(inv)}>Copy link</Button>
                  <Button variant="muted" size="sm" disabled={resentIds.has(inv.id)} onClick={() => resendInvite(inv)}>{resentIds.has(inv.id) ? 'Sent' : 'Resend'}</Button>
                  <Button variant="ghost" size="sm" onClick={() => cancelInvite(inv)}>Cancel</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {soloAccountDetected && (
          <div style={{
            padding: 'var(--space-16)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            backgroundColor: 'var(--color-bg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-10)'
          }}>
            <p style={{ fontSize: 'var(--text-base)', margin: 0 }}>
              <strong>{pendingInviteEmail}</strong> already has a Gardnr account. Send them an invite to connect as your client? Their existing data will be preserved.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {inviteEmailedTo && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success)', fontWeight: 'var(--weight-medium)', margin: 0 }}>
                <Icon name="check" /> Invite emailed to {inviteEmailedTo}
              </p>
            )}
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: 0 }}>
              {inviteEmailedTo ? 'Or share this link directly:' : 'Share this invite link:'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
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
              style={{ backgroundColor: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: 'var(--space-4) var(--space-10)', cursor: 'pointer', fontSize: 'var(--text-sm)', color: linkCopied ? 'var(--color-success)' : 'var(--color-text)', whiteSpace: 'nowrap', transition: 'color 120ms' }}
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
