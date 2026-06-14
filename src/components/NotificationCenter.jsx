import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

// Lightweight notification center: a bell + dropdown that derives recent events
// from existing tables (no new schema) and tracks "unread" with a last-seen
// timestamp in localStorage. Coach sees client check-ins + messages; client
// sees new reports + coach messages.

const SEEN_KEY = 'gardnr-notif-seen'

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
  const [items, setItems] = useState([])
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem(SEEN_KEY)) || 0)
  const [seenSnapshot, setSeenSnapshot] = useState(0)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const uid = session.user.id
    const out = []

    if (profile?.role === 'coach') {
      const { data: rels } = await supabase.from('coach_clients').select('client_id').eq('coach_id', uid).eq('status', 'active')
      const ids = (rels || []).map((r) => r.client_id)
      const names = {}
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
        ;(profs || []).forEach((p) => { names[p.id] = p.full_name || p.email || 'A client' })
      }
      const [ci, msg] = await Promise.all([
        supabase.from('check_ins').select('id, client_id, created_at').eq('coach_id', uid).order('created_at', { ascending: false }).limit(15),
        supabase.from('messages').select('id, client_id, content, created_at').eq('coach_id', uid).neq('sender_id', uid).order('created_at', { ascending: false }).limit(15),
      ])
      ;(ci.data || []).forEach((c) => out.push({ id: 'ci' + c.id, kind: 'checkin', title: `${names[c.client_id] || 'A client'} checked in`, time: +new Date(c.created_at), href: `/client/${c.client_id}?focus=checkIn` }))
      ;(msg.data || []).forEach((m) => out.push({ id: 'm' + m.id, kind: 'message', title: `${names[m.client_id] || 'A client'} messaged you`, sub: trim(m.content), time: +new Date(m.created_at), href: `/client/${m.client_id}?focus=chat` }))
    } else if (profile?.role === 'client') {
      const [rep, msg] = await Promise.all([
        supabase.from('reports').select('id, created_at').eq('client_id', uid).order('created_at', { ascending: false }).limit(15),
        supabase.from('messages').select('id, content, created_at').eq('client_id', uid).neq('sender_id', uid).order('created_at', { ascending: false }).limit(15),
      ])
      ;(rep.data || []).forEach((r) => out.push({ id: 'r' + r.id, kind: 'report', title: 'New weekly report', sub: 'From your coach', time: +new Date(r.created_at), href: '/?focus=reports' }))
      ;(msg.data || []).forEach((m) => out.push({ id: 'm' + m.id, kind: 'message', title: 'Message from your coach', sub: trim(m.content), time: +new Date(m.created_at), href: '/?focus=chat' }))
    }

    out.sort((a, b) => b.time - a.time)
    setItems(out.slice(0, 20))
  }, [profile?.role])

  useEffect(() => {
    if (profile?.role !== 'coach' && profile?.role !== 'client') return
    async function run() { await load() }
    run()
    const onFocus = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [profile?.role, load])

  if (profile?.role !== 'coach' && profile?.role !== 'client') return null

  const unread = items.filter((i) => i.time > lastSeen).length

  function toggle() {
    const next = !open
    if (next) {
      setSeenSnapshot(lastSeen) // freeze so newly-arrived items stay highlighted while open
      const now = Date.now()
      setLastSeen(now)
      try { localStorage.setItem(SEEN_KEY, String(now)) } catch { /* ignore */ }
    }
    setOpen(next)
  }

  function go(item) {
    setOpen(false)
    navigate(item.href)
  }

  // Only show what hasn't been seen — once the panel is opened, those items are
  // marked seen (snapshot below) and drop off on the next open.
  const visible = items.filter((i) => i.time > seenSnapshot)

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
            {visible.length === 0 ? (
              <p style={{ padding: '20px 14px', fontSize: '0.85rem', color: 'var(--color-muted)', margin: 0, textAlign: 'center' }}>
                You're all caught up.
              </p>
            ) : (
              visible.map((i) => (
                <button
                  key={i.id}
                  onClick={() => go(i)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                    padding: '11px 14px', background: 'transparent',
                    border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', color: 'var(--color-text)',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{i.title}</span>
                  {i.sub && <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{i.sub}</span>}
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)' }}>{relTime(i.time)}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
