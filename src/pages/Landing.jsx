import { useState } from 'react'
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
  { before: 'Generic check-in questions',   after: "Reports and call prep grounded in the client's actual data" },
  { before: 'Guessing who needs attention', after: 'Dashboard sorted by compliance and last log' },
]

const steps = [
  { n: '01', title: 'Set the targets',          copy: 'Invite a client, set calories, macros, cardio, steps, and weight goals.' },
  { n: '02', title: 'Clients log from the web', copy: 'No app download required. Clients record what you need from any browser.' },
  { n: '03', title: 'Coach from the evidence',  copy: 'One view for compliance, messages, check-ins, notes, reports, and trends.' },
]

const trialSteps = [
  'Invite one client and set their targets',
  'Have them log a normal week from the web app',
  'Review their compliance before the check-in',
  'Generate, edit, and send the weekly report',
]

const badgeLabels = { ready: 'Ready', watch: 'Watch', nudge: 'Nudge' }

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return <span className={`lp-badge lp-badge-${status}`}>{badgeLabels[status]}</span>
}

function ProductPreview() {
  const [sel, setSel] = useState(0)
  const c = clients[sel]
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
              onMouseEnter={() => setSel(i)}
              onClick={() => setSel(i)}
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
              <span className="lp-pp-report-status">{c.reportStatus}</span>
            </div>
            <p className="lp-pp-report-text">{c.report}</p>
          </div>

          <div className="lp-pp-cta"><span>Review and send →</span></div>
        </div>
      </div>
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

      {/* WORKFLOW */}
      <section id="how" className="lp-section lp-band">
        <div className="lp-section-narrow">
          <p className="lp-eyebrow-text lp-eyebrow-green">Workflow</p>
          <h2 className="lp-h2">Invite, log, coach.</h2>
          <div className="lp-step-grid">
            {steps.map((s) => (
              <div key={s.n} className="lp-step">
                <span className="lp-step-num">{s.n}</span>
                <h3 className="lp-step-title">{s.title}</h3>
                <p className="lp-step-copy">{s.copy}</p>
              </div>
            ))}
          </div>
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
              <p className="lp-trial-note">$19/month after the trial. Cancel anytime before you're charged.</p>
            </div>
            <div className="lp-trial-checklist">
              {trialSteps.map((step, i) => (
                <div key={step} className="lp-trial-item">
                  <span className="lp-trial-num">{i + 1}</span>
                  <p className="lp-trial-text">{step}</p>
                </div>
              ))}
            </div>
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
