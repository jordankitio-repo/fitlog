import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { computeClientStats, computeClientAlerts } from '../utils/clientStats'
import { attentionLevel } from '../utils/attentionLevel'
import { NOTIF_REFRESH } from '../utils/notifyRefresh'
import Avatar from './Avatar'

// Notification bell + dropdown. Two kinds of entry, deliberately handled
// differently (see the day/night-mode-era decision to mirror PagerDuty/Linear):
//   • EVENTS — one-off things that happened (a message, a check-in, a report).
//     Tracked by a last-seen timestamp; they drop off the list once seen.
//   • ALERTS — ongoing conditions (a client gone quiet, a missing check-in, a
//     locked account). Derived live from the same facts the dashboards use, so
//     they persist until the condition clears. The red badge pings when a NEW
//     alert appears and clears on open, but the alert stays listed.
// All derived from existing tables — no new schema.

const SEEN_KEY = 'gardnr-notif-seen'
const SEEN_ALERTS_KEY = 'gardnr-notif-seen-alerts'
const LEVEL_RANK = { red: 0, yellow: 1 }
const LEVEL_COLOR = { red: '#f87171', yellow: '#fbbf24' }

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
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem(SEEN_KEY)) || 0)
  const [seenSnapshot, setSeenSnapshot] = useState(0)
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
      const [ci, msg] = await Promise.all([
        ids.length
          ? supabase.from('check_ins').select('id, client_id, created_at').in('client_id', ids).order('created_at', { ascending: false }).limit(15)
          : Promise.resolve({ data: [] }),
        supabase.from('messages').select('id, client_id, content, created_at').eq('coach_id', uid).neq('sender_id', uid).order('created_at', { ascending: false }).limit(15),
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
      const [rep, msg, rev] = await Promise.all([
        supabase.from('reports').select('id, created_at').eq('client_id', uid).order('created_at', { ascending: false }).limit(15),
        supabase.from('messages').select('id, content, created_at').eq('client_id', uid).neq('sender_id', uid).order('created_at', { ascending: false }).limit(15),
        supabase.from('check_ins').select('id, coach_comment, reviewed_at').eq('client_id', uid).not('reviewed_at', 'is', null).order('reviewed_at', { ascending: false }).limit(15),
      ])
      ;(rep.data || []).forEach((r) => ev.push({ id: 'r' + r.id, kind: 'report', title: 'New weekly report', sub: 'From your coach', time: +new Date(r.created_at), href: '/?focus=reports', avatarUrl: coachAvatar, avatarName: coachName }))
      ;(msg.data || []).forEach((m) => ev.push({ id: 'm' + m.id, kind: 'message', title: 'Message from your coach', sub: trim(m.content), time: +new Date(m.created_at), href: '/?focus=chat', avatarUrl: coachAvatar, avatarName: coachName }))
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
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: notifs } = await supabase.from('notifications')
      .select('id, title, body, href, created_at')
      .eq('user_id', uid).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(15)
    ;(notifs || []).forEach((n) => ev.push({ id: 'n' + n.id, kind: 'notif', title: n.title, sub: n.body, time: +new Date(n.created_at), href: n.href || '/' }))

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

  const newEvents = events.filter((e) => e.time > lastSeen).length
  const newAlerts = alerts.filter((a) => !seenAlerts.has(a.id)).length
  const unread = newEvents + newAlerts

  function toggle() {
    const next = !open
    if (next) {
      setSeenSnapshot(lastSeen) // freeze so newly-arrived events stay listed while open
      const now = Date.now()
      setLastSeen(now)
      try { localStorage.setItem(SEEN_KEY, String(now)) } catch { /* ignore */ }
      // Acknowledge every alert currently showing — replacing the set also prunes
      // ones that have since resolved, so a re-trigger later pings again.
      const ids = alerts.map((a) => a.id)
      setSeenAlerts(new Set(ids))
      try { localStorage.setItem(SEEN_ALERTS_KEY, JSON.stringify(ids)) } catch { /* ignore */ }
    }
    setOpen(next)
  }

  function go(href) {
    setOpen(false)
    navigate(href)
  }

  // Events drop off once seen; alerts persist until their condition clears.
  const visibleEvents = events.filter((e) => e.time > seenSnapshot)
  const empty = alerts.length === 0 && visibleEvents.length === 0

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 10, background: 'none', border: 'none',
          color: 'var(--color-muted)', cursor: 'pointer',
        }}
      >
        <BellIcon />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 8, background: '#f87171', color: '#fff', fontSize: '0.62rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--color-surface)',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 110 }} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 320, maxWidth: '92vw',
            maxHeight: '70vh', overflowY: 'auto', zIndex: 120,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: '0.9rem' }}>
              Notifications
            </div>

            {empty ? (
              <p style={{ padding: '20px 14px', fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0, textAlign: 'center' }}>
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
                          onClick={() => go(a.href)}
                          style={{
                            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 9,
                            padding: '11px 14px', background: isNew ? 'var(--color-primary-dim)' : 'transparent',
                            border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text)',
                          }}
                        >
                          {a.avatarName ? (
                            <span style={{ position: 'relative', flexShrink: 0, marginTop: 1, display: 'inline-flex' }}>
                              <Avatar url={a.avatarUrl} name={a.avatarName} size={30} />
                              <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: LEVEL_COLOR[a.level], border: '2px solid var(--color-surface)' }} />
                            </span>
                          ) : (
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: LEVEL_COLOR[a.level], marginTop: 5, flexShrink: 0 }} />
                          )}
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{a.title}</span>
                            {a.sub && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{a.sub}</span>}
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
                        onClick={() => go(i.href)}
                        style={{
                          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 9,
                          padding: '11px 14px', background: 'transparent',
                          border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text)',
                        }}
                      >
                        {i.avatarName && <Avatar url={i.avatarUrl} name={i.avatarName} size={30} style={{ marginTop: 1 }} />}
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{i.title}</span>
                          {i.sub && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{i.sub}</span>}
                          <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>{relTime(i.time)}</span>
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
      padding: '8px 14px 4px', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--color-muted)',
    }}>
      {children}
    </div>
  )
}
