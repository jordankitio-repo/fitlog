import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { computeClientStats, computeClientAlerts } from '../utils/clientStats'
import { attentionLevel } from '../utils/attentionLevel'
import { NOTIF_REFRESH } from '../utils/notifyRefresh'
import Avatar from './Avatar'
import { CountBadge } from './ui'

// Notification bell + dropdown. Two kinds of entry, deliberately handled
// differently:
//   • EVENTS — one-off things that happened (a message, a check-in, a report).
//     RECEIPTS, in the phone sense: each one stands until the reader opens it,
//     and dealing with the underlying work by another route leaves it standing.
//     Opening it navigates to the section, which renders live state and so
//     shows the work already done — which is all the reader needed to see.
//   • ALERTS — ongoing conditions (a client gone quiet, a missing check-in, a
//     locked account). Derived live from the same facts the dashboards use, so
//     they persist until the condition clears, with no tap required. The red
//     badge pings when a NEW alert appears and clears on open, but the alert
//     stays listed.
//
// Events used to be tracked by a single last-seen timestamp, which cleared the
// list when you LOOKED at it rather than when you dealt with anything: twenty
// items, one glance, fifteen gone unhandled. Acknowledgement is now per item
// and server-side (notification_dismissals — see that migration for why a
// receipt rather than a derived to-do).
const SEEN_ALERTS_KEY = 'gardnr-notif-seen-alerts'

// How far back an EVENT counts as news. Server pushes were always read inside
// this window; the derived events had no floor at all, and took "the latest 15"
// however old they were. That was survivable only because a glance used to wipe
// the list: a coach with a quiet roster now accumulates every check-in they
// never clicked, and six-week-old ones queue up behind today's reading as if
// they had just happened. A notice that old is not a notice. The live-alert
// half is unaffected — a condition is true now or it isn't, so it has no window.
const EVENT_WINDOW_DAYS = 30
const eventFloor = () => new Date(Date.now() - EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
const LEVEL_RANK = { red: 0, yellow: 1 }
// Tokens, not hex. These slipped past the lint rule because it only matches a
// property literally named `color`, and here the keys are the levels.
const LEVEL_COLOR = { red: 'var(--color-error)', yellow: 'var(--color-warning)' }

function readSeenAlerts() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_ALERTS_KEY) || '[]')) } catch { return new Set() }
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function relTime(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const trim = (s) => (s && s.length > 70 ? s.slice(0, 70) + '…' : s)

export default function NotificationCenter({ profile }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState([])
  const [alerts, setAlerts] = useState([])
  // Keys of events this reader has opened or cleared. Server-side, so the
  // phone and the laptop agree about what has been dealt with.
  const [dismissed, setDismissed] = useState(() => new Set())
  const [seenAlerts, setSeenAlerts] = useState(readSeenAlerts)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const uid = session.user.id
    const ev = []
    let al = []

    if (profile?.role === 'coach') {
      const { data: rels } = await supabase.from('coach_clients')
        .select('client_id, created_at, lock_cleared_at, checkin_interval_weeks').eq('coach_id', uid).eq('status', 'active')
      const relationships = rels || []
      const ids = relationships.map((r) => r.client_id)
      const names = {}
      const avatars = {}
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, email, avatar_url').in('id', ids)
        ;(profs || []).forEach((p) => { names[p.id] = p.full_name || p.email || 'A client'; avatars[p.id] = p.avatar_url })
      }

      // Events. check_ins is keyed by client_id (no coach_id column), so scope
      // to this coach's clients — filtering by coach_id 400s and silently drops
      // every "client checked in" event from the bell.
      const floor = eventFloor()
      const [ci, msg] = await Promise.all([
        ids.length
          ? supabase.from('check_ins').select('id, client_id, created_at').in('client_id', ids).gte('created_at', floor).order('created_at', { ascending: false }).limit(15)
          : Promise.resolve({ data: [] }),
        supabase.from('messages').select('id, client_id, content, created_at').eq('coach_id', uid).neq('sender_id', uid).gte('created_at', floor).order('created_at', { ascending: false }).limit(15),
      ])
      ;(ci.data || []).forEach((c) => ev.push({ id: 'ci' + c.id, kind: 'checkin', title: `${names[c.client_id] || 'A client'} checked in`, time: +new Date(c.created_at), href: `/client/${c.client_id}?focus=checkIn`, avatarUrl: avatars[c.client_id], avatarName: names[c.client_id] }))
      ;(msg.data || []).forEach((m) => ev.push({ id: 'm' + m.id, kind: 'message', title: `${names[m.client_id] || 'A client'} messaged you`, sub: trim(m.content), time: +new Date(m.created_at), href: `/client/${m.client_id}?focus=chat`, avatarUrl: avatars[m.client_id], avatarName: names[m.client_id] }))

      // Alerts — one per client that needs attention, from the same triage the
      // coach dashboard uses.
      if (ids.length) {
        const stats = await computeClientStats(ids, relationships)
        ids.forEach((id) => {
          const t = attentionLevel(stats[id])
          if (t.level === 'red' || t.level === 'yellow') {
            al.push({
              id: 'al:' + id, level: t.level,
              title: names[id] || 'A client',
              sub: t.reasons.slice(0, 2).join(' · '),
              href: `/client/${id}`,
              avatarUrl: avatars[id], avatarName: names[id],
            })
          }
        })
        al.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
      }
    } else if (profile?.role === 'client') {
      // The client's coach (name + avatar) — every coach-sourced item shows it.
      let coachAvatar = null
      const { data: rel } = await supabase.from('coach_clients').select('coach_id').eq('client_id', uid).eq('status', 'active').maybeSingle()
      let coachName = 'your coach'
      if (rel) {
        const { data: c } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', rel.coach_id).maybeSingle()
        if (c) { coachName = c.full_name || coachName; coachAvatar = c.avatar_url }
      }

      // Events
      //
      // NO messages and NO reports. Both live on /coach, and that tab now
      // carries its own unread badge (hooks/useCoachUnread). Counting them
      // here too would be one thing announced twice, in two widgets, cleared
      // by two different gestures: open the thread and the tab badge zeroes
      // while the bell still claims three. What stays is what has nowhere
      // else to point.
      const floor = eventFloor()
      const [rev] = await Promise.all([
        // Filtered on reviewed_at, not created_at: the event is the review, and
        // a coach catching up on a month-old check-in IS news to the client.
        supabase.from('check_ins').select('id, coach_comment, reviewed_at').eq('client_id', uid).not('reviewed_at', 'is', null).gte('reviewed_at', floor).order('reviewed_at', { ascending: false }).limit(15),
      ])
      ;(rev.data || []).forEach((c) => ev.push({ id: 'rev' + c.id, kind: 'review', title: 'Your coach reviewed your check-in', sub: c.coach_comment ? trim(c.coach_comment) : 'From your coach', time: +new Date(c.reviewed_at), href: '/?focus=checkin', avatarUrl: coachAvatar, avatarName: coachName }))

      // Alerts — the client's own action-items (lock, due check-in, coach nudge).
      const act = await computeClientAlerts(uid)
      if (act.lock?.locked) {
        al.push({ id: 'al:lock', level: 'red', title: 'Progress view paused', sub: `No nutrition logged for ${act.lock.days} ${act.lock.days === 1 ? 'day' : 'days'}`, href: '/' })
      } else if (act.lock?.reason === 'coach-unlocked') {
        al.push({ id: 'al:unlock', level: 'yellow', title: 'Logging window open', sub: '48 hours to log before your view locks again', href: '/' })
      }
      if (act.checkInDue) {
        al.push({ id: 'al:checkin', level: 'yellow', title: 'Weekly check-in due', sub: 'Let your coach know how your week went', href: '/?focus=checkin' })
      }
      if (act.nudged) {
        al.push({ id: 'al:nudge', level: 'yellow', title: 'Your coach nudged you', sub: 'Log your nutrition today to stay on track', href: '/log', avatarUrl: coachAvatar, avatarName: coachName })
      }
      al.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
    }

    // Server-pushed notifications (role-agnostic) — events that leave no other
    // readable trace, e.g. a client leaving (the coach loses RLS access to the
    // departed client's profile, so the name is snapshotted server-side).
    // These carry their own read_at, so they are acknowledged in place rather
    // than through the dismissals table — the column exists for exactly this.
    const [{ data: notifs }, { data: dis }] = await Promise.all([
      supabase.from('notifications')
        .select('id, title, body, href, created_at')
        .eq('user_id', uid).is('read_at', null).gte('created_at', eventFloor())
        .order('created_at', { ascending: false }).limit(15),
      supabase.from('notification_dismissals').select('key').eq('user_id', uid),
    ])
    ;(notifs || []).forEach((n) => ev.push({ id: 'n' + n.id, kind: 'notif', title: n.title, sub: n.body, time: +new Date(n.created_at), href: n.href || '/' }))

    // Set before the events, in the same tick, so React batches them and no
    // already-acknowledged row gets a frame on screen.
    setDismissed(new Set((dis || []).map((d) => d.key)))

    ev.sort((a, b) => b.time - a.time)
    setEvents(ev.slice(0, 20))
    setAlerts(al)
  }, [profile?.role])

  useEffect(() => {
    if (profile?.role !== 'coach' && profile?.role !== 'client') return
    async function run() { await load() }
    run()
    const onFocus = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener(NOTIF_REFRESH, run)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener(NOTIF_REFRESH, run)
    }
  }, [profile?.role, load])

  if (profile?.role !== 'coach' && profile?.role !== 'client') return null

  // Events drop off only when acknowledged; alerts when their condition
  // clears. So the badge keeps counting an unopened event however many times
  // the bell has been looked at — which is the point.
  const visibleEvents = events.filter((e) => !dismissed.has(e.id))
  const newAlerts = alerts.filter((a) => !seenAlerts.has(a.id)).length
  const unread = visibleEvents.length + newAlerts

  function toggle() {
    const next = !open
    if (next) {
      // Opening acknowledges the alert PING only. It deliberately does nothing
      // to the events: looking at a list is not doing the things on it.
      // Acknowledge every alert currently showing — replacing the set also prunes
      // ones that have since resolved, so a re-trigger later pings again.
      const ids = alerts.map((a) => a.id)
      setSeenAlerts(new Set(ids))
      try { localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
    }
    setOpen(next)
  }

  // Write the acknowledgement for one event. Optimistic: the row has to leave
  // the list on the same frame the reader clicks it, because the next thing
  // that happens is a navigation away from here.
  async function acknowledge(items) {
    if (!items.length) return
    setDismissed((prev) => { const n = new Set(prev); items.forEach((i) => n.add(i.id)); return n })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    // Server pushes own their read_at; everything else is a derived event whose
    // id exists only in this component, so it goes in the dismissals table.
    const pushed = items.filter((i) => i.kind === 'notif').map((i) => i.id.slice(1))
    const derived = items.filter((i) => i.kind !== 'notif').map((i) => ({ user_id: session.user.id, key: i.id }))
    await Promise.all([
      // ignoreDuplicates, i.e. ON CONFLICT DO NOTHING: clicking a row twice
      // before the panel closes, or clearing a list that holds something
      // already acknowledged on another device, must not 409. Deliberately NOT
      // a DO UPDATE upsert — that needs an UPDATE policy on a table whose rows
      // have no field worth changing, and the table is write-once by design.
      derived.length
        ? supabase.from('notification_dismissals').upsert(derived, { onConflict: 'user_id,key', ignoreDuplicates: true })
        : null,
      pushed.length ? supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', pushed) : null,
    ].filter(Boolean))
  }

  function openEvent(item) {
    setOpen(false)
    acknowledge([item])
    navigate(item.href)
  }

  // Alerts are NOT acknowledged on click — the condition is still true until
  // the work is done, and the roster grades the same client at the same moment.
  function openAlert(href) {
    setOpen(false)
    navigate(href)
  }

  const empty = alerts.length === 0 && visibleEvents.length === 0

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="gnav-util gnav-util--icon ds-control"
        /* Shape and hover come from .gnav-util, the same class Feedback uses —
           matching them by construction instead of by copying numbers. Only
           `position` stays inline, for the unread badge anchored to it. */
        style={{ position: 'relative' }}
      >
        <BellIcon />
      </button>
      {/* The badge hangs off the WRAPPER, not the button. Inside a 38px button
          that already centres a 20px bell there is nowhere for a 24px-wide
          "9+" to go: at top/right 4px it covered the bell's whole upper half,
          so the glyph read as clipped rather than badged. Out here it can sit
          past the corner and overlap nothing. aria-hidden because the button's
          aria-label already announces the count. */}
      <CountBadge count={unread} />

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 110 }} />
          <div className="notif-panel" style={{
            position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 360, maxWidth: '92vw',
            // 360, not 320: the reason strings are the same --text-sm the roster
            // uses for status, and at 320 the longer ones wrapped to two lines and
            // made the rows uneven. Widening the panel beats shrinking the type,
            // because the type has to match the column it mirrors.
            maxHeight: '70vh', overflowY: 'auto', zIndex: 120,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-dropdown)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-8)',
              padding: 'var(--space-12) var(--space-16)', borderBottom: '1px solid var(--color-border)',
              fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-body)',
            }}>
              <span>Notifications</span>
              {/* The escape hatch that per-item acknowledgement requires. The
                  list caps at twenty; without this, a week away from the bell
                  costs twenty clicks, and the old glance-clears-everything
                  behaviour would start looking like a feature.

                  "Clear all", by the user's call, over "Clear 15". The count
                  was there because this takes the notices and not the alerts
                  sitting above them, so the label named its own scope — but
                  nobody arrives at a bell looking for "Clear 15", and a button
                  you have to read a number off is a worse button than one you
                  recognise. The alerts stay put when it is pressed, which reads
                  as what it is: they are conditions, and the panel still shows
                  them because they are still true. */}
              {visibleEvents.length > 1 && (
                <button type="button" className="notif-clear ds-control" onClick={() => acknowledge(visibleEvents)}>
                  Clear all
                </button>
              )}
            </div>

            {empty ? (
              <p style={{ padding: 'var(--space-20) var(--space-16)', fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0, textAlign: 'center' }}>
                You're all caught up.
              </p>
            ) : (
              <>
                {alerts.length > 0 && (
                  <>
                    <GroupLabel>Needs attention</GroupLabel>
                    {alerts.map((a) => {
                      const isNew = !seenAlerts.has(a.id)
                      return (
                        <button
                          key={a.id}
                          onClick={() => openAlert(a.href)}
                          style={{
                            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-8)',
                            padding: 'var(--space-12) var(--space-16)', background: isNew ? 'var(--color-primary-dim)' : 'transparent',
                            border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text)',
                          }}
                        >
                          {a.avatarName && (
                            <Avatar url={a.avatarUrl} name={a.avatarName} size={30} style={{ flexShrink: 0, marginTop: 'var(--space-2)' }} />
                          )}
                          {/* C1: severity is the TEXT's colour, never a dot. The
                              roster grades this same client with red/amber words
                              in its status column — a dot here meant one fact was
                              encoded two different ways on the same screen, and
                              the reason string was left grey as if it were meta. */}
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
                            <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)' }}>{a.title}</span>
                            {a.sub && <span style={{ fontSize: 'var(--text-sm)', color: LEVEL_COLOR[a.level], fontWeight: 'var(--weight-semibold)' }}>{a.sub}</span>}
                          </span>
                        </button>
                      )
                    })}
                  </>
                )}

                {visibleEvents.length > 0 && (
                  <>
                    <GroupLabel>Recent</GroupLabel>
                    {visibleEvents.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => openEvent(i)}
                        style={{
                          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-8)',
                          padding: 'var(--space-12) var(--space-16)', background: 'transparent',
                          border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text)',
                        }}
                      >
                        {i.avatarName && <Avatar url={i.avatarUrl} name={i.avatarName} size={30} style={{ flexShrink: 0, marginTop: 'var(--space-2)' }} />}
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', minWidth: 0 }}>
                          <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)' }}>{i.title}</span>
                          {i.sub && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{i.sub}</span>}
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{relTime(i.time)}</span>
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function GroupLabel({ children }) {
  return (
    <div style={{
      /* Same treatment as the roster's .ds-colhead — an eyebrow labelling what
         the group holds, so it must read identically in both places. */
      padding: 'var(--space-8) var(--space-16) var(--space-4)', fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-medium)', letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--color-faint)',
    }}>
      {children}
    </div>
  )
}
