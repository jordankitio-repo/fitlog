import { Fragment, useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import Avatar from '../components/Avatar'
import Button from '../components/Button'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { Icon, Textarea } from '../components/ui'
import { useMediaQuery } from '../hooks/useMediaQuery'
import ReportReader, { ReportArchive } from './Reports'
import { leadOf } from '../utils/reportFeed'
import { threadRows } from '../utils/coachThread'
import { dayStamp, relativeTime } from '../utils/relativeTime'

// The client's ONE coach surface.
//
// Everything from the coach used to arrive through two unrelated channels: the
// conversation through a chat bubble pinned bottom-right on every page, and the
// written reports through a section inside My Progress. Same relationship, two
// idioms, two locations, two unread counts. "What did my coach say?" had no
// single answer. It also put correspondence inside a data page: My Progress is
// stats, targets and charts, and a letter from a person is not that.
//
// The first fix brought both here and split them across two tabs, which moved
// the seam rather than closing it. A tab row is a second navigation strip 60px
// under the first one (the top bar already renders pill links), it keeps two
// unread counts, and it asks the reader to choose a CHANNEL when what they
// actually want is the latest thing their coach said.
//
// So there are no tabs. This is one thread in time order, and a report is a
// card in it — which is what a report actually is: the longest thing the coach
// sent that week, usually the thing the next few messages are about. Reading it
// still happens on its own route (C5), so the thread stays a list of choices.
// The archive keeps a link in the header, because browsing six months of
// reports is a real task but a rare one.

// Below this, the desktop sidebar does not appear and the page stays one
// column with the header link. A rail holding two rows is worse than no rail:
// it spends a third of the window announcing that there is almost nothing in
// it, which is the failure mode of every empty two-pane layout.
const RAIL_MIN_REPORTS = 3

// How far back the thread carries reports: about two months of weeklies. The
// archive holds the rest, and the header links to it.
//
// This was 24 first, which is what a merged thread gets wrong if you let it:
// a client with six months of history and three messages got a scroll region
// that was 24 near-identical report cards and nothing else, i.e. the archive
// again, with a text box under it. The thread's job is the RECENT stretch of
// the relationship, where a report and the messages about it sit together.
const THREAD_REPORTS = 8

// A report, inside the thread. It sits in the coach's column and takes the same
// envelope as their messages, because it came from the same person at that
// point in the conversation. What makes it a different KIND of thing is the
// eyebrow and the chevron, not a second colour.
function ThreadReport({ report, onOpen }) {
  const lead = leadOf(report.content)
  return (
    <button
      type="button"
      className="coach-msg coach-report ds-control"
      onClick={() => onOpen(report.id)}
    >
      <span className="coach-report-body">
        {/* The head uses the card's WIDTH: eyebrow and state at the left, date
            at the right. Stacked, these were three short lines in a wide
            column, which is a phone card wearing a desktop's space. */}
        <span className="coach-report-head">
          <span className="coach-report-kind">Weekly report</span>
          {/* C1 plain text, and B1 grades it grey: an unread report is not a
              state to escalate, it is one you have not opened. */}
          {!report.read_at && <span className="coach-report-unread">Unread</span>}
        </span>
        {/* The subject, when there is one. A report written before subjects
            existed does NOT fall back to its date here: the card already ends
            with that date, and "Report Sep 10" above "Sep 10" is the same fact
            twice. The archive's row needs the fallback because a row has no
            other lead element; this card has the eyebrow and the lead. */}
        {report.subject && <span className="coach-report-title">{report.subject}</span>}
        {lead && <span className="coach-report-lead">{lead}</span>}
      </span>
      <Icon name="right" size={16} style={{ color: 'var(--color-faint)' }} />
    </button>
  )
}

export default function Coach({ profile, archiveOpen = false }) {
  const navigate = useNavigate()
  // Set when this page is mounted at /reports/:id — the detail half of the
  // master-detail pair. The rail stays put and the report replaces the thread,
  // which is the whole reason the rail exists: clicking a row used to throw
  // the layout away and leave the report alone on a page.
  const { id: reportId } = useParams()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [coach, setCoach] = useState(null)
  const [items, setItems] = useState([])
  const [reportCount, setReportCount] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [noCoach, setNoCoach] = useState(false)
  const endRef = useRef(null)

  // One fetch for the surface, because the surface is one list. Messages and
  // reports are two tables and one timeline; they are merged here rather than
  // rendered as two stacks, which is the whole point of the page.
  const fetchThread = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const [msgRes, repRes] = await Promise.all([
      supabase.from('messages').select('*')
        .eq('client_id', session.user.id)
        .order('created_at', { ascending: true }),
      supabase.from('reports').select('id, subject, content, created_at, read_at', { count: 'exact' })
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(THREAD_REPORTS),
    ])
    if (msgRes.error) { console.error(msgRes.error); return }
    if (repRes.error) console.error(repRes.error)

    const messages = msgRes.data || []
    const reports = repRes.data || []
    setReportCount(repRes.count ?? reports.length)
    setItems([
      ...messages.map(m => ({ key: `m${m.id}`, at: m.created_at, message: m })),
      ...reports.map(r => ({ key: `r${r.id}`, at: r.created_at, report: r })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at)))

    // Opening the thread IS reading it, for messages — but only when the
    // thread is what is on screen. Arriving at /reports/:id mounts this page
    // for its rail, and marking every message read because someone followed a
    // link to a REPORT is a state the client never agreed to.
    if (reportId) return
    // Opening the thread IS reading it, for messages. A report is read when it
    // is opened, which is the reader's job: read_at belongs to the recipient
    // and it is the state the coach's sent list reports back to them, so
    // scrolling past a card must not claim it was read.
    const unread = messages.filter(m => !m.read_at && m.sender_id !== session.user.id).map(m => m.id)
    if (unread.length) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unread)
    }
  }, [reportId])

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
      await fetchThread()
    }
    load()
  }, [fetchThread])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [items.length])

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
      else { setDraft(''); await fetchThread() }
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

  // The desktop shape: the archive is a sidebar and the relationship is the
  // page, which is what the window is actually wide enough for. Two panes are
  // not the tab row coming back — tabs made the two mutually exclusive and hid
  // one behind a click; panes show both at once, which is the standard way out
  // of exactly that problem. Below 1024px the rail is display:none and this is
  // the single column it always was, with "All reports" in the header.
  // Matches the CSS breakpoint below. The rail is display:none under it, so
  // this cannot be a count alone: the element still mounts, and a phone was
  // both running the archive's query behind a hidden sidebar AND suppressing
  // the modal that was its only way to reach the same list.
  const railed = wide && reportCount >= RAIL_MIN_REPORTS

  const rows = threadRows(items)
  // The newest message the client sent that the coach has opened. Only this one
  // carries a receipt: repeated down a thread it stops being information and
  // becomes a column.
  const lastMineRead = [...items].reverse()
    .find(it => it.message && it.message.sender_id === profile?.id && it.message.read_at)?.key

  return (
    <div className={`coach-shell${railed ? ' coach-shell--railed' : ''}`}>
      {railed && (
        <aside className="coach-rail page-fade-in" aria-label="Weekly reports">
          <p className="coach-rail-head">
            <span>Reports</span>
            <span className="tnum coach-rail-count">{reportCount}</span>
          </p>
          <ReportArchive profile={profile} activeId={reportId} />
        </aside>
      )}
      <div className="coach-main">
        {reportId ? (
          <ReportReader inPane={railed} />
        ) : (
        <div className="page-fade-in coach-page">
          <div className="coach-head">
            <Avatar url={coach?.avatar_url} name={coach?.full_name || 'Coach'} size={44} />
            <div>
              <h1 style={{ margin: 0 }}>{coach?.full_name || 'Your coach'}</h1>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>Your coach</p>
            </div>
            {/* The archive is a destination, not a channel. Same shape as the
                "Show older reports" control it leads to: label, muted count, the
                one forward glyph. Rendered whenever there is a report to find, so
                the only route to that page is never conditional on a threshold. */}
            {reportCount > 0 && (
              <Link to="/coach/reports" className="ds-disclosure ds-control coach-head-link">
                <span>All reports</span>
                <span className="tnum" style={{ color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>
                  {reportCount}
                </span>
                <Icon name="right" size={14} />
              </Link>
            )}
          </div>

          <div className="coach-thread">
            {items.length === 0 ? (
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', margin: 0 }}>
                No messages yet. Say hello.
              </p>
            ) : (
              <div className="coach-msgs">
                {rows.map(row => {
                  if (row.kind === 'day') {
                    return <p key={row.key} className="coach-day">{dayStamp(row.at)}</p>
                  }
                  if (row.kind === 'report') {
                    return (
                      <ThreadReport
                        key={row.key}
                        report={row.report}
                        onOpen={(id) => navigate(`/reports/${id}`)}
                      />
                    )
                  }
                  const mine = row.message.sender_id === profile?.id
                  return (
                    <Fragment key={row.key}>
                      <div className={`coach-msg${mine ? ' coach-msg-mine' : ''}${row.cont ? ' coach-msg-cont' : ''}`}>
                        <p className="coach-msg-body">{row.message.content}</p>
                      </div>
                      {/* OUTSIDE the bubble: the receipt is the system
                          speaking, not the sender, and inside it the line
                          rendered as part of what you wrote. It sits on the
                          LAST thing you sent and nowhere else, which is where
                          it answers the only question it can: did that land.
                          Absent when unread, rather than a "Delivered" we do
                          not actually track. */}
                      {row.key === lastMineRead && (
                        <p className="coach-receipt">Read {relativeTime(row.message.read_at)}</p>
                      )}
                    </Fragment>
                  )
                })}
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
        </div>
        )}
      </div>

      {/* The archive, over the thread rather than instead of it.
          As a route it was a whole page for a list: an 800px column of rows in
          a 1700px window, with the conversation it belongs to thrown away to
          show it. A modal keeps the thread behind it, costs no layout, and
          closes on the backdrop — which is the gesture for "I was just
          looking". The URL still addresses it, so a link to /coach/reports
          opens the thread with the archive up. */}
      {/* This URL always opens the archive, at every width. It was briefly
          suppressed when the rail was up, on the grounds that a dialog over
          the list already on screen is a copy of itself — but the backdrop
          dims the rail, and a reader who asked for "all reports" should get
          all reports rather than a page that appears to ignore them. The rail
          is an ambient index; this is the answer to a request. */}
      <Modal open={archiveOpen} title="Reports" onClose={() => navigate('/coach')} maxWidth={560}>
        <ReportArchive profile={profile} />
      </Modal>
    </div>
  )
}
