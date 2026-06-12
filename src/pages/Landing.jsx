import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import './landing.css'

const signupPath = '/login?mode=signup&role=coach'

// ── Data ────────────────────────────────────────────────────────────────────

// Each client tells a story the hover reveals: a winner, a watch, and a lapse.
const clients = [
  {
    name: 'Maya Chen', goal: 'Cut phase', lastLog: 'Today', status: 'ready',
    pills: [
      { label: 'Calories', value: '5/7', tone: 'good' },
      { label: 'Protein',  value: '6/7', tone: 'good' },
      { label: 'Cardio',   value: '3/7', tone: 'warn' },
      { label: 'Steps',    value: '6/7', tone: 'good' },
    ],
    bars: [82, 76, 71, 67, 62, 58, 54],
    reportStatus: 'Draft ready',
    report: 'Protein on target 6/7 days. Cardio dipped midweek — weight still trending down.',
  },
  {
    name: 'Jordan Lee', goal: 'Reverse diet', lastLog: 'Yesterday', status: 'watch',
    pills: [
      { label: 'Calories', value: '4/7', tone: 'warn' },
      { label: 'Protein',  value: '5/7', tone: 'good' },
      { label: 'Cardio',   value: '2/7', tone: 'warn' },
      { label: 'Steps',    value: '4/7', tone: 'warn' },
    ],
    bars: [60, 63, 61, 64, 62, 65, 64],
    reportStatus: 'Draft ready',
    report: 'Weekend calories crept up. Weight holding flat — on plan for a reverse.',
  },
  {
    name: 'Sam Rivera', goal: 'Maintenance', lastLog: '3 days', status: 'nudge',
    pills: [
      { label: 'Calories', value: '2/7', tone: 'bad' },
      { label: 'Protein',  value: '2/7', tone: 'bad' },
      { label: 'Cardio',   value: '1/7', tone: 'bad' },
      { label: 'Steps',    value: '3/7', tone: 'warn' },
    ],
    bars: [54, 48, 0, 0, 46, 0, 40],
    reportStatus: 'Nudge sent',
    report: 'Logging stopped 3 days ago. Nudge sent — waiting on re-engagement.',
  },
]

const pains = [
  { icon: '📲', text: 'Food screenshots buried in three different message threads' },
  { icon: '📊', text: 'Rebuilding the same compliance spreadsheet every week' },
  { icon: '🤔', text: 'Starting every check-in by asking "how did your week go?"' },
]

const contrast = [
  { before: 'Screenshots and text threads', after: 'Daily nutrition, weight, cardio, and steps — all tied to the client' },
  { before: 'Manual weekly averages',       after: '7-day compliance across calories, protein, cardio, and steps' },
  { before: 'Generic check-in questions',   after: "Reports and meeting prep grounded in the client's actual data" },
  { before: 'Guessing who needs attention', after: 'Dashboard sorted by compliance and last log' },
]

const steps = [
  { n: '01', kind: 'targets', title: 'Set the targets',          copy: 'Invite a client, set calories, macros, cardio, steps, and weight goals.' },
  { n: '02', kind: 'log',     title: 'Clients log from the web', copy: 'No app download required. Clients record what you need from any browser.' },
  { n: '03', kind: 'chart',   title: 'Coach from the evidence',  copy: 'One view for compliance, messages, check-ins, notes, reports, and trends.' },
]

const trialSteps = [
  'Invite one client and set their targets',
  'Have them log a normal week from the web app',
  'Review their compliance before the check-in',
  'Generate, edit, and send the weekly report',
]

const capabilities = [
  { title: 'Attention triage',     copy: 'Your dashboard ranks who needs you first — by compliance and last log. Ready, watch, or nudge.' },
  { title: 'Compliance breakdown', copy: 'Weekday vs weekend, on-target vs over vs under. You see why a client is slipping, not just that they are.' },
  { title: 'Energy balance read',  copy: 'Empirical maintenance and weight trajectory, read from their real intake and weigh-ins — not a formula.' },
  { title: 'Meeting prep',         copy: 'A private brief of what changed since you last talked, so you walk into every check-in already up to speed.' },
  { title: 'Smart nudges',         copy: 'One tap sends a contextual email — a log reminder or a check-in — tailored to why they went quiet.' },
  { title: 'Weekly reports',       copy: "Drafted from the week's data in your voice. Review, edit, and send in a minute." },
]

const badgeLabels = { ready: 'Ready', watch: 'Watch', nudge: 'Nudge' }

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return <span className={`lp-badge lp-badge-${status}`}>{badgeLabels[status]}</span>
}

function ProductPreview() {
  const [sel, setSel] = useState(0)
  const [cta, setCta] = useState('idle') // idle | sending | sent
  const timers = useRef([])
  const c = clients[sel]

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function clearTimers() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  function selectClient(i) {
    clearTimers()
    setCta('idle')
    setSel(i)
  }
  function sendReport() {
    if (cta !== 'idle') return
    clearTimers()
    setCta('sending')
    timers.current.push(setTimeout(() => setCta('sent'), 650))
    timers.current.push(setTimeout(() => setCta('idle'), 2600))
  }

  const ctaLabel = cta === 'sending' ? 'Sending…' : cta === 'sent' ? 'Sent ✓' : 'Review and send →'

  return (
    <div className="lp-pp">
      {/* Chrome */}
      <div className="lp-pp-chrome">
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span key={c} className="lp-pp-dot" style={{ background: c }} />
        ))}
        <span className="lp-pp-url">gardnr.fit — Coach dashboard</span>
      </div>

      <div className="lp-pp-grid">
        {/* Left: client list */}
        <div className="lp-pp-left">
          <div className="lp-pp-listhead">
            <span>Active clients</span>
            <span className="lp-pp-sort">Sort: compliance</span>
          </div>

          {clients.map((client, i) => (
            <div
              key={client.name}
              className={`lp-pp-client${i === sel ? ' is-sel' : ''}`}
              onMouseEnter={() => selectClient(i)}
              onClick={() => selectClient(i)}
            >
              <div>
                <p className="lp-pp-client-name">{client.name}</p>
                <p className="lp-pp-client-meta">{client.goal} · {client.lastLog}</p>
              </div>
              <StatusBadge status={client.status} />
            </div>
          ))}

          <div className="lp-pp-pills">
            <p className="lp-pp-pills-label">{c.name} · 7-day compliance</p>
            <div className="lp-pp-pills-row">
              {c.pills.map((p) => (
                <span key={p.label} className={`lp-pp-pill lp-pp-pill-${p.tone}`}>
                  {p.label} {p.value}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: client detail — driven by the hovered client */}
        <div className="lp-pp-right">
          <p className="lp-pp-label">Client view</p>
          <p className="lp-pp-client-title">{c.name}</p>

          <div className="lp-pp-card">
            <p className="lp-pp-card-label">Weight trend</p>
            <div className="lp-pp-chart">
              {c.bars.map((h, i) => (
                <span
                  key={i}
                  className={`lp-pp-bar${i === c.bars.length - 1 ? ' lp-pp-bar-last' : ''}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          <div className="lp-pp-card">
            <div className="lp-pp-report-head">
              <p className="lp-pp-card-label" style={{ margin: 0 }}>Weekly report</p>
              <span className={`lp-pp-report-status${cta === 'sent' ? ' is-sent' : ''}`}>
                {cta === 'sent' ? 'Sent ✓' : c.reportStatus}
              </span>
            </div>
            <p className="lp-pp-report-text">{c.report}</p>
          </div>

          <button type="button" className={`lp-pp-cta lp-pp-cta-${cta}`} onClick={sendReport}>
            <span>{ctaLabel}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// Tracks whether an element is in the viewport. `once` stops observing after
// the first entry; otherwise it toggles on every enter/leave (so animations
// can replay when the user scrolls away and comes back).
function useInView({ threshold = 0.3, once = false } = {}) {
  const ref = useRef(null)
  // No IntersectionObserver (SSR / ancient browsers) → treat as always in view.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => {
      setInView(e.isIntersecting)
      if (e.isIntersecting && once) io.disconnect()
    }, { threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [threshold, once])
  return [ref, inView]
}

// A tiny ambient animation per workflow step, dramatizing the action.
function StepViz({ kind }) {
  if (kind === 'targets') {
    return (
      <div className="lp-viz lp-viz-targets" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="lp-viz-track"><span className="lp-viz-fill" style={{ '--i': i }} /></div>
        ))}
      </div>
    )
  }
  if (kind === 'log') {
    return (
      <div className="lp-viz lp-viz-log" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className="lp-viz-cell" style={{ '--i': i }} />
        ))}
      </div>
    )
  }
  return (
    <div className="lp-viz lp-viz-chart" aria-hidden="true">
      {[40, 62, 50, 74, 66, 86].map((h, i) => (
        <span key={i} className="lp-viz-bar" style={{ '--h': `${h}%`, '--i': i }} />
      ))}
    </div>
  )
}

// Workflow steps — the per-step animations play when the section scrolls into
// view, settle, and stop; they replay each time you scroll away and back.
function WorkflowSteps() {
  const [ref, inView] = useInView({ threshold: 0.3 })
  return (
    <div ref={ref} className={`lp-step-grid${inView ? ' is-playing' : ''}`}>
      {steps.map((s) => (
        <div key={s.n} className="lp-step">
          <span className="lp-step-num">{s.n}</span>
          <h3 className="lp-step-title">{s.title}</h3>
          <p className="lp-step-copy">{s.copy}</p>
          <StepViz kind={s.kind} />
        </div>
      ))}
    </div>
  )
}

// Trial checklist: steps light up one after another once scrolled into view.
function TrialChecklist() {
  const [ref, shown] = useInView({ threshold: 0.35, once: true })
  return (
    <div ref={ref} className={`lp-trial-checklist${shown ? ' is-shown' : ''}`}>
      {trialSteps.map((step, i) => (
        <div key={step} className="lp-trial-item" style={{ '--i': i }}>
          <span className="lp-trial-num">{i + 1}</span>
          <p className="lp-trial-text">{step}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="lp">

      {/* NAV */}
      <nav className="lp-nav">
        <Link to="/" className="lp-brand">
          <Logo size={30} />
          <span className="lp-brand-name">gardnr</span>
        </Link>
        <div className="lp-nav-right">
          <div className="lp-nav-links">
            {[['#how', 'Workflow'], ['#trial', 'The trial']].map(([href, label]) => (
              <a key={href} href={href} className="lp-nav-link">{label}</a>
            ))}
          </div>
          <Link to="/login" className="lp-signin">Sign in</Link>
          <Link to={signupPath} className="lp-cta-sm">Start free trial</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            <span className="lp-eyebrow-label">Nutrition coaching intelligence</span>
          </div>
          <h1 className="lp-h1">Stop guessing how your clients' week actually went.</h1>
          <p className="lp-subhead">
            Your coaching runs on food screenshots and rebuilt spreadsheets. Gardnr gives you one
            place where client logging, compliance, and weekly reports actually live.
          </p>
          <div className="lp-cta-row">
            <Link to={signupPath} className="lp-cta">Start 30-day free trial</Link>
            <a href="#how" className="lp-link-arrow">See the workflow <span style={{ opacity: 0.6 }}>→</span></a>
          </div>
          <div className="lp-trust">
            {['30 days free', '$19/month after trial', 'No app download for clients'].map((t) => (
              <span key={t} className="lp-trust-item"><span className="lp-trust-check">✓</span>{t}</span>
            ))}
          </div>
        </div>
        <div className="lp-hero-visual">
          <ProductPreview />
        </div>
      </section>

      {/* TAGLINE BAND */}
      <div className="lp-tagline">
        <p>
          <span className="lp-tagline-accent">Coaches don't build physiques.</span>{' '}
          They create conditions for growth.
        </p>
      </div>

      {/* PAIN */}
      <section className="lp-section lp-band">
        <div className="lp-section-narrow">
          <p className="lp-eyebrow-text lp-eyebrow-red">The problem</p>
          <h2 className="lp-h2">Nutrition coaching still loses the signal.</h2>
          <div className="lp-pain-grid">
            {pains.map((p) => (
              <div key={p.text} className="lp-pain-card">
                <span className="lp-pain-icon">{p.icon}</span>
                <p className="lp-pain-text">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTRAST */}
      <section id="contrast" className="lp-section">
        <div className="lp-section-inner">
          <p className="lp-eyebrow-text lp-eyebrow-green">What changes</p>
          <h2 className="lp-h2">Replace scattered proof with one coaching record.</h2>
          <div className="lp-contrast-table">
            <div className="lp-contrast-head">
              <div className="lp-contrast-head-before"><span>Without Gardnr</span></div>
              <div className="lp-contrast-head-after"><span>With Gardnr</span></div>
            </div>
            {contrast.map((row, i) => (
              <div key={i} className="lp-contrast-row">
                <div className="lp-contrast-before"><p>{row.before}</p></div>
                <div className="lp-contrast-after"><p>{row.after}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INSTRUMENTS */}
      <section id="instruments" className="lp-section">
        <div className="lp-section-inner">
          <p className="lp-eyebrow-text lp-eyebrow-green">The layer between tracking and coaching</p>
          <h2 className="lp-h2">Instruments that turn logging into coaching.</h2>
          <div className="lp-cap-grid">
            {capabilities.map((cap) => (
              <div key={cap.title} className="lp-cap-card">
                <span className="lp-cap-dot" />
                <h3 className="lp-cap-title">{cap.title}</h3>
                <p className="lp-cap-copy">{cap.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section id="how" className="lp-section lp-band">
        <div className="lp-section-narrow">
          <p className="lp-eyebrow-text lp-eyebrow-green">Workflow</p>
          <h2 className="lp-h2">Invite, log, coach.</h2>
          <WorkflowSteps />
        </div>
      </section>

      {/* TRIAL */}
      <section id="trial" className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-trial-card">
            <div className="lp-trial-glow" />
            <div className="lp-trial-left">
              <p className="lp-eyebrow-text lp-eyebrow-green">The proof plan</p>
              <h2 className="lp-trial-h2">Use the trial to run one real check-in.</h2>
              <p className="lp-trial-copy">
                30 days to run a real coaching cycle. See compliance, send reports, message
                clients — everything in one place from day one.
              </p>
              <Link to={signupPath} className="lp-trial-cta">Start your 30-day trial</Link>
              <p className="lp-trial-note">$19/month after the trial. Cancel anytime.</p>
            </div>
            <TrialChecklist />
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final">
        <div className="lp-final-inner">
          <h2 className="lp-final-h2">Start your next check-in from Gardnr.</h2>
          <p className="lp-final-copy">
            Everything your coaching workflow needs, in one place. 30 days free, $19/month after.
          </p>
          <div className="lp-final-row">
            <Link to={signupPath} className="lp-cta">Start 30-day free trial</Link>
            <Link to="/login" className="lp-signin">Sign in</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo size={24} />
          <span className="lp-footer-name">gardnr</span>
          <span className="lp-footer-tag">Create conditions for growth.</span>
        </div>
        <nav className="lp-footer-nav">
          {[['Sign in', '/login'], ['Terms', '/terms'], ['Privacy', '/privacy']].map(([label, path]) => (
            <Link key={path} to={path} className="lp-footer-link">{label}</Link>
          ))}
          <Link to="/login?mode=signup&role=solo" className="lp-footer-solo">Training solo? Start free →</Link>
        </nav>
      </footer>

    </div>
  )
}
