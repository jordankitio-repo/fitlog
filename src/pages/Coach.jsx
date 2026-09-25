import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { Pill, Textarea } from '../components/ui'
import { ReportArchive } from './Reports'
import { relativeTime } from '../utils/relativeTime'

// The client's ONE coach surface.
//
// Everything from the coach used to arrive through two unrelated channels: the
// conversation through a chat bubble pinned bottom-right on every page, and the
// written reports through a section inside My Progress. Same relationship, two
// idioms, two locations, two unread counts — and nothing on either told the
// client the other existed. "What did my coach say?" had no single answer.
//
// It also put correspondence inside a data page. My Progress is stats, targets
// and charts; a letter from a person is not that.
//
// So: one destination, two tabs, one unread count in the nav. My Progress goes
// back to being progress.
export default function Coach({ profile }) {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'reports' ? 'reports' : 'messages'
  const setTab = (t) => setParams(t === 'messages' ? {} : { tab: t }, { replace: true })

  const [coach, setCoach] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [noCoach, setNoCoach] = useState(false)
  const [unreadReports, setUnreadReports] = useState(0)
  const endRef = useRef(null)

  // Unread sits on the TAB, which is the only place it is both visible and
  // actionable: it names which half of this surface has something waiting.
  // Counted server-side — with the archive paginated, unread is not a property
  // of whichever rows happen to be loaded.
  useEffect(() => {
    async function countUnread() {
      const { count } = await supabase
        .from('reports').select('id', { count: 'exact', head: true })
        .eq('archived', false).is('read_at', null)
      setUnreadReports(count ?? 0)
    }
    countUnread()
  }, [tab])

  const fetchMessages = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data, error } = await supabase
      .from('messages').select('*')
      .eq('client_id', session.user.id)
      .order('created_at', { ascending: true })
    if (error) { console.error(error); return }
    setMessages(data)
    // Opening the thread IS reading it — the same rule the report reader uses.
    const unread = data.filter(m => !m.read_at && m.sender_id !== session.user.id).map(m => m.id)
    if (unread.length) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
    }
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: rel } = await supabase
        .from('coach_clients').select('coach_id')
        .eq('client_id', session.user.id).eq('status', 'active').maybeSingle()
      if (!rel) { setNoCoach(true); return }
      const { data: c } = await supabase
        .from('profiles').select('full_name, avatar_url')
        .eq('id', rel.coach_id).maybeSingle()
      setCoach(c || null)
      await fetchMessages()
    }
    load()
  }, [fetchMessages])

  useEffect(() => {
    if (tab === 'messages') endRef.current?.scrollIntoView({ block: 'end' })
  }, [tab, messages.length])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { data: rel } = await supabase
      .from('coach_clients').select('coach_id')
      .eq('client_id', session.user.id).eq('status', 'active').maybeSingle()
    if (rel) {
      const { error } = await supabase.from('messages').insert([{
        coach_id: rel.coach_id, client_id: session.user.id,
        sender_id: session.user.id, content: text,
      }])
      if (error) console.error(error)
      else { setDraft(''); await fetchMessages() }
    }
    setSending(false)
  }

  if (noCoach) {
    return (
      <div className="page-fade-in">
        <h1>Coach</h1>
        <EmptyState
          title="No coach connected"
          message="When you join a coaching plan, your messages and weekly reports will live here."
        />
      </div>
    )
  }

  return (
    <div className="page-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
        <Avatar url={coach?.avatar_url} name={coach?.full_name || 'Coach'} size={44} />
        <div>
          <h1 style={{ margin: 0 }}>{coach?.full_name || 'Your coach'}</h1>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>Your coach</p>
        </div>
      </div>

      {/* D2: a Pill IS a Button — `muted` inactive, `primary` selected. The
          shape is the affordance, which is the one case C1 keeps a pill for. */}
      <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
        <Pill active={tab === 'messages'} onClick={() => setTab('messages')}>Messages</Pill>
        <Pill active={tab === 'reports'} onClick={() => setTab('reports')}>
          Reports{unreadReports > 0 && <span className="tnum" style={{ opacity: 0.7 }}> · {unreadReports}</span>}
        </Pill>
      </div>

      {tab === 'messages' ? (
        <div className="coach-thread">
          {messages.length === 0 ? (
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0 }}>
              No messages yet. Say hello.
            </p>
          ) : (
            <div className="coach-msgs">
              {messages.map(m => (
                <div key={m.id} className={`coach-msg${m.sender_id === profile?.id ? ' coach-msg-mine' : ''}`}>
                  <p className="coach-msg-body">{m.content}</p>
                  <p className="coach-msg-when">{relativeTime(m.created_at)}</p>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
          <div className="coach-compose">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }}
              rows={3}
              placeholder={`Message ${coach?.full_name?.split(' ')[0] || 'your coach'}…`}
              aria-label="Message your coach"
            />
            <Button onClick={send} variant="primary" size="sm" loading={sending} disabled={!draft.trim()}>
              Send
            </Button>
          </div>
        </div>
      ) : (
        <ReportArchive profile={profile} />
      )}
    </div>
  )
}
