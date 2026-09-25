import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Avatar from '../components/Avatar'
import ReportProse from '../components/ReportProse'
import { Icon } from '../components/ui'
import { relativeTime } from '../utils/relativeTime'
import { leadOf, byMonth } from '../utils/reportFeed'
import { cardStyle } from '../utils/styles'

// Reports from the coach: a LIST page and a READER page.
//
// They used to live inside a section of My Progress, expanding in place, and
// that was the thing no amount of typography was going to fix: a coach's report
// is long-form reading and every other section on that page is glanceable —
// stat tiles, charts, progress bars. A document inside a data panel can only be
// a teaser that satisfies nobody, and expanding one shoved the charts below it
// down the page.
//
// So the list is for CHOOSING and the reader is for READING, which is how a
// periodic written artifact is presented basically everywhere it has its own
// surface (a newsletter archive, a weekly-review screen). My Progress keeps a
// short, quiet entry point; this is where reading happens.

// One row of the list. Deliberately not a card: a list of choices wants rhythm
// and a hairline, not twelve boxes.
function ReportRow({ report: r, sender, onOpen }) {
  return (
    <button type="button" className="rep-row ds-control" onClick={() => onOpen(r.id)}>
      <Avatar url={sender?.avatar_url} name={sender?.full_name || 'Coach'} size={32} />
      <span className="rep-row-body">
        {/* SUBJECT first, date second — the order every archive uses, because
            a title is what makes a long list scannable and a date is not. Rows
            written before subjects existed fall back to the body's lead, so an
            old report degrades to exactly what it looked like before. */}
        <span className="rep-row-head">
          <span className="rep-row-title">{r.subject || relativeTime(r.created_at)}</span>
          {r.subject && <span className="rep-row-when">{relativeTime(r.created_at)}</span>}
          {/* C1 plain text, and B1 grades it grey — an unread report is not a
              state to escalate, it is one you have not opened. */}
          {!r.read_at && <span className="rep-row-unread">Unread</span>}
        </span>
        <span className="rep-row-lead">{leadOf(r.content)}</span>
      </span>
      <Icon name="right" size={16} style={{ color: 'var(--color-faint)', flexShrink: 0 }} />
    </button>
  )
}

// One screenful. A weekly report means ~52 a year, so an unpaginated archive is
// fine for a season and a wall after that.
const PAGE = 20

// The archive itself, without page chrome, so the Coach destination can hold it
// beside the message thread rather than linking away to a second place for the
// same relationship.
export function ReportArchive({ profile }) {
  const [reports, setReports] = useState(null)
  const [people, setPeople] = useState({})
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const navigate = useNavigate()

  // Sender lookup, resolved per distinct coach rather than joined per row — a
  // client has one coach, and reports from a previous one must still render
  // with the right name.
  async function resolvePeople(rows) {
    const ids = [...new Set(rows.map(r => r.coach_id).filter(Boolean))]
    if (!ids.length) return
    const { data: profs } = await supabase
      .from('profiles').select('id, full_name, avatar_url').in('id', ids)
    setPeople(prev => ({ ...prev, ...Object.fromEntries((profs || []).map(p => [p.id, p])) }))
  }

  useEffect(() => {
    async function load() {
      const { data, error, count } = await supabase
        .from('reports').select('*', { count: 'exact' })
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .range(0, PAGE - 1)
      if (error) { console.error(error); setReports([]); return }
      setReports(data)
      setTotal(count ?? data.length)
      await resolvePeople(data)

    }
    load()
  }, [])

  async function loadOlder() {
    setLoadingMore(true)
    const from = reports.length
    const { data, error } = await supabase
      .from('reports').select('*')
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (!error && data) {
      setReports(prev => [...prev, ...data])
      await resolvePeople(data)
    }
    setLoadingMore(false)
  }

  const rows = reports ? byMonth(reports) : []
  const hasMore = reports && reports.length < total

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-24)' }}>
      {reports === null ? (
        <div style={{ ...cardStyle, padding: 0 }}>
          {[...Array(4)].map((_, i) => <Skeleton key={i} height="76px" />)}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          message={profile?.role === 'client'
            ? 'When your coach sends a weekly report, it will appear here.'
            : 'Reports from a coach appear here.'}
        />
      ) : (
        <>
          <div style={{ ...cardStyle, padding: 'var(--space-4) var(--space-24)' }}>
            {rows.map(row => row.kind === 'label' ? (
              <p key={`m-${row.key}`} className="rep-month">{row.label}</p>
            ) : (
              <ReportRow
                key={row.report.id}
                report={row.report}
                sender={people[row.report.coach_id]}
                onOpen={(id) => navigate(`/reports/${id}`)}
              />
            ))}
          </div>
          {hasMore && (
            <div>
              <button
                type="button"
                className="ds-disclosure ds-control"
                style={{ width: 'auto' }}
                onClick={loadOlder}
                disabled={loadingMore}
              >
                <Icon name="down" size={14} />
                <span>{loadingMore ? 'Loading…' : `Show older reports`}</span>
                <span style={{ color: 'var(--color-muted)', fontWeight: 'var(--weight-normal)' }}>
                  {reports.length} of {total}
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ReportReader() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [sender, setSender] = useState(null)
  const [siblings, setSiblings] = useState([])
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('reports').select('*').eq('id', id).maybeSingle()
      if (error || !data) { setMissing(true); return }
      setReport(data)
      if (data.coach_id) {
        const { data: p } = await supabase
          .from('profiles').select('id, full_name, avatar_url').eq('id', data.coach_id).maybeSingle()
        setSender(p || null)
      }
      // Opening the report IS reading it — no separate "mark as read" for the
      // reader to perform, and no way for the two states to drift apart.
      //
      // Guarded on the RECIPIENT. `read_at` is the client's state and the coach
      // reads it to know whether their report landed; a coach opening this page
      // must not answer that question for them.
      const { data: { session } } = await supabase.auth.getSession()
      if (!data.read_at && session?.user?.id === data.client_id) {
        await supabase.from('reports').update({ read_at: new Date().toISOString() })
          .eq('id', id).is('read_at', null)
      }

      // The neighbours, so the foot of the page offers the next report rather
      // than a wall. A reader who finishes one is the likeliest person in the
      // app to want another, and making them go back to a list to get it is
      // the one thing every archive that works does not do.
      const { data: all } = await supabase
        .from('reports').select('id, created_at')
        .eq('client_id', data.client_id).eq('archived', false)
        .order('created_at', { ascending: false })
      setSiblings(all || [])
    }
    load()
  }, [id])

  if (missing) {
    return (
      <div className="page-fade-in">
        <EmptyState title="Report not found" message="It may have been removed." />
      </div>
    )
  }

  const idx = siblings.findIndex(s => s.id === id)
  const newer = idx > 0 ? siblings[idx - 1] : null
  const older = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null

  return (
    // The measure is CENTRED. Left-aligned inside a full-width page, a 68ch
    // column clung to one edge and left most of a wide screen empty — a short
    // report then read as an error state rather than a focused one. Centring is
    // what makes the emptiness margin instead of void.
    <div className="page-fade-in rep-reader">
      {/* A back link names its destination. "Back" makes the reader guess
          which of two places they came from — and the destination is the coach
          surface now, not a standalone archive. */}
      <Link to="/coach?tab=reports" className="ds-disclosure ds-control" style={{ width: 'auto', textDecoration: 'none' }}>
        <Icon name="left" size={14} />
        <span>All reports</span>
      </Link>

      {!report ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)', marginTop: 'var(--space-24)' }}>
          <Skeleton height="48px" width="240px" />
          <Skeleton height="320px" />
        </div>
      ) : (
        <>
          {/* A3/A1: the page itself is not a box. A reading surface is a column
              of type on the page ground — a border round long-form prose adds a
              frame nobody asked for. */}
          <article>
            {report.subject && <h1 className="rep-reader-title">{report.subject}</h1>}
            <header className="rep-reader-head">
              <Avatar url={sender?.avatar_url} name={sender?.full_name || 'Coach'} size={40} />
              <div>
                <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 'var(--weight-medium)' }}>
                  {sender?.full_name || 'Your coach'}
                </p>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>
                  {relativeTime(report.created_at)}
                </p>
              </div>
            </header>
            {/* dropLeadingH1: the header above already says who wrote this and
                when. A report that opens "# Weekly Report — Maya" is restating
                its own envelope to the one person who cannot need it. */}
            <ReportProse content={report.content} dropLeadingH1 className="rep-reader-prose" />
          </article>

          {(newer || older) && (
            <nav className="rep-reader-nav">
              {older ? (
                <button type="button" className="rep-reader-step ds-control" onClick={() => navigate(`/reports/${older.id}`)}>
                  <Icon name="left" size={14} />
                  <span>
                    <span className="rep-reader-step-k">Previous</span>
                    <span className="rep-reader-step-v">{relativeTime(older.created_at)}</span>
                  </span>
                </button>
              ) : <span />}
              {newer && (
                <button type="button" className="rep-reader-step rep-reader-step-next ds-control" onClick={() => navigate(`/reports/${newer.id}`)}>
                  <span>
                    <span className="rep-reader-step-k">Next</span>
                    <span className="rep-reader-step-v">{relativeTime(newer.created_at)}</span>
                  </span>
                  <Icon name="right" size={14} />
                </button>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
