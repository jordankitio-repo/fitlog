import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { track } from '@vercel/analytics'
import Logo from '../components/Logo'
import {
  alsoIncluded,
  contrast as contrastContent,
  faq,
  finalCta,
  footer,
  hero,
  instruments,
  meta,
  nav,
  pain,
  pricing,
  tagline,
  trial,
  workflow,
} from './landingContent'
import './landing.css'

const signupPath = '/login?mode=signup&role=coach'
const soloSignupPath = '/login?mode=signup&role=solo'
const brandName = meta.title.split(' — ')[0]

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
      {workflow.steps.map((s) => (
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
      {trial.steps.map((step, i) => (
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
  useEffect(() => {
    track('landing_view')
  }, [])

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }

  return (
    <div className="lp">

      <Analytics />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* NAV */}
      <nav className="lp-nav">
        <Link to="/" className="lp-brand" aria-label={meta.title}>
          <Logo size={30} />
          <span className="lp-brand-name">{brandName.toLowerCase()}</span>
        </Link>
        <div className="lp-nav-links">
          {nav.links.map(([href, label]) => (
            <a key={href} href={href} className="lp-nav-link">{label}</a>
          ))}
        </div>
        <div className="lp-nav-right">
          <Link to="/login" className="lp-signin">{nav.signIn}</Link>
          <Link to={signupPath} className="lp-cta-sm" onClick={() => track('cta_click', { location: 'nav' })}>{nav.cta}</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            <span className="lp-eyebrow-label">{hero.eyebrow}</span>
          </div>
          <h1 className="lp-h1">{hero.h1}</h1>
          <p className="lp-subhead">{hero.subhead}</p>
          <div className="lp-cta-row">
            <Link to={signupPath} className="lp-cta" onClick={() => track('cta_click', { location: 'hero' })}>{hero.cta}</Link>
            <a href="#how" className="lp-link-arrow">{hero.secondaryCta} <span aria-hidden="true" style={{ opacity: 0.6 }}>→</span></a>
          </div>
          <div className="lp-trust">
            {hero.trust.map((item) => (
              <span key={item} className="lp-trust-item"><span className="lp-trust-check" aria-hidden="true">✓</span>{item}</span>
            ))}
          </div>
          <p className="lp-cta-note">{hero.ctaNote}</p>
        </div>
        <div className="lp-hero-visual">
          <ProductPreview />
        </div>
      </section>

      {/* TAGLINE BAND */}
      <div className="lp-tagline">
        <p>
          <span className="lp-tagline-accent">{tagline.accent}</span>{' '}
          {tagline.rest}
        </p>
      </div>

      {/* PAIN */}
      <section className="lp-section lp-band">
        <div className="lp-section-narrow">
          <p className="lp-eyebrow-text lp-eyebrow-red">{pain.eyebrow}</p>
          <h2 className="lp-h2">{pain.h2}</h2>
          <div className="lp-pain-grid">
            {pain.items.map((item) => (
              <div key={item.text} className="lp-pain-card">
                <span className="lp-pain-icon" aria-hidden="true">{item.icon}</span>
                <p className="lp-pain-text">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTRAST */}
      <section id="contrast" className="lp-section">
        <div className="lp-section-inner">
          <p className="lp-eyebrow-text lp-eyebrow-green">{contrastContent.eyebrow}</p>
          <h2 className="lp-h2">{contrastContent.h2}</h2>
          <div className="lp-contrast-table">
            <div className="lp-contrast-head">
              <div className="lp-contrast-head-before"><span>{contrastContent.headBefore}</span></div>
              <div className="lp-contrast-head-after"><span>{contrastContent.headAfter}</span></div>
            </div>
            {contrastContent.rows.map((row, i) => (
              <div key={i} className="lp-contrast-row">
                <div className="lp-contrast-before">
                  <span className="lp-contrast-mobile-label">{contrastContent.headBefore}</span>
                  <p>{row.before}</p>
                </div>
                <div className="lp-contrast-after">
                  <span className="lp-contrast-mobile-label">{contrastContent.headAfter}</span>
                  <p>{row.after}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INSTRUMENTS */}
      <section id="instruments" className="lp-section">
        <div className="lp-section-inner">
          <p className="lp-eyebrow-text lp-eyebrow-green">{instruments.eyebrow}</p>
          <h2 className="lp-h2">{instruments.h2}</h2>
          <div className="lp-cap-grid">
            {instruments.items.map((cap) => (
              <div key={cap.title} className="lp-cap-card">
                <span className="lp-cap-dot" />
                <h3 className="lp-cap-title">{cap.title}</h3>
                <p className="lp-cap-copy">{cap.copy}</p>
              </div>
            ))}
          </div>
          <div className="lp-also">
            <p className="lp-also-label">{alsoIncluded.label}</p>
            <div className="lp-also-list">
              {alsoIncluded.items.map((item) => <span key={item} className="lp-also-chip">{item}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section id="how" className="lp-section lp-band">
        <div className="lp-section-narrow">
          <p className="lp-eyebrow-text lp-eyebrow-green">{workflow.eyebrow}</p>
          <h2 className="lp-h2">{workflow.h2}</h2>
          <WorkflowSteps />
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="lp-section">
        <div className="lp-section-narrow">
          <p className="lp-eyebrow-text lp-eyebrow-green">{pricing.eyebrow}</p>
          <h2 className="lp-h2">{pricing.h2}</h2>
          <p className="lp-pricing-lede">{pricing.lede}</p>
          <div className="lp-pricing-card">
            <div className="lp-price"><span className="lp-price-amount">{pricing.amount}</span><span className="lp-price-period">{pricing.period}</span></div>
            <p className="lp-pricing-trial">{pricing.trialLine}</p>
            <ul className="lp-pricing-includes">
              {pricing.includes.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <Link to={signupPath} className="lp-cta lp-pricing-cta" onClick={() => track('cta_click', { location: 'pricing' })}>{pricing.cta}</Link>
            <p className="lp-trial-note">{pricing.note}</p>
          </div>
          <p className="lp-solo-line">{pricing.soloLine} <Link to={soloSignupPath}>{pricing.soloCta}</Link></p>
        </div>
      </section>

      {/* TRIAL */}
      <section id="trial" className="lp-section">
        <div className="lp-section-inner">
          <div className="lp-trial-card">
            <div className="lp-trial-glow" />
            <div className="lp-trial-left">
              <p className="lp-eyebrow-text lp-eyebrow-green">{trial.eyebrow}</p>
              <h2 className="lp-trial-h2">{trial.h2}</h2>
              <p className="lp-trial-copy">{trial.copy}</p>
              <Link to={signupPath} className="lp-trial-cta" onClick={() => track('cta_click', { location: 'trial' })}>{trial.cta}</Link>
              <p className="lp-trial-note">{trial.note}</p>
            </div>
            <TrialChecklist />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="lp-section lp-band">
        <div className="lp-section-narrow">
          <p className="lp-eyebrow-text lp-eyebrow-green">{faq.eyebrow}</p>
          <h2 className="lp-h2">{faq.h2}</h2>
          <div className="lp-faq-list">
            {faq.items.map(({ q, a }) => (
              <details key={q} className="lp-faq-item">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final">
        <div className="lp-final-inner">
          <h2 className="lp-final-h2">{finalCta.h2}</h2>
          <p className="lp-final-copy">{finalCta.copy}</p>
          <div className="lp-final-row">
            <Link to={signupPath} className="lp-cta" onClick={() => track('cta_click', { location: 'final' })}>{finalCta.cta}</Link>
            <Link to="/login" className="lp-signin">{finalCta.signIn}</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <Logo size={24} />
          <span className="lp-footer-name">{brandName.toLowerCase()}</span>
          <span className="lp-footer-tag">{footer.tagline}</span>
        </div>
        <nav className="lp-footer-nav">
          {footer.links.map(([label, path]) => (
            <Link key={path} to={path} className="lp-footer-link">{label}</Link>
          ))}
          <Link to={soloSignupPath} className="lp-footer-solo">{footer.solo}</Link>
        </nav>
      </footer>

    </div>
  )
}
