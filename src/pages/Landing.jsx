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
  heroShot,
  instruments,
  meta,
  nav,
  pain,
  tagline,
  trial,
  workflow,
} from './landingContent'
import './landing.css'

const signupPath = '/login?mode=signup&role=coach'
const soloSignupPath = '/login?mode=signup&role=solo'
const brandName = meta.title.split(' — ')[0]

// ── Analytics containment ───────────────────────────────────────────────────
//
// Gardnr is a consumer health app (FTC Health Breach Notification Rule, WA My
// Health My Data). Reporting authenticated paths like /client/<id> or /log to
// an analytics vendor is the GoodRx/BetterHelp fact pattern. Our privacy policy
// states this analytics "does not run on signed-in or health-data routes" — the
// two guards below are what make that sentence true. Do not remove either.
//
// Guard 1 — `route`/`path` on <Analytics>. Mounting the component inside
// Landing is NOT sufficient on its own: @vercel/analytics `inject()` appends its
// script to document.head from an effect with no cleanup, so the script OUTLIVES
// this component. Left bare, it keeps auto-tracking history changes for the rest
// of the SPA session — straight into the authenticated app. Passing `route` sets
// `data-disable-auto-track` on the script tag, so it never patches the history
// API and only reports what we explicitly send.
//
// Guard 2 — `beforeSend`. A path allowlist, applied to every outgoing event, in
// case guard 1 ever regresses. It fails closed: no parseable URL, no send.
const MARKETING_PATHS = new Set(['/', '/login'])

function beforeSendMarketingOnly(event) {
  try {
    // NOTE: '/' is also the signed-in dashboard. That is safe only because
    // auto-tracking is off and nothing inside the app calls track() — so no
    // event ever originates there. The paths that carry health data
    // (/log, /profile, /client/<id>) are refused here regardless.
    return MARKETING_PATHS.has(new URL(event.url).pathname) ? event : null
  } catch {
    return null
  }
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

      {/* route/path are load-bearing, not cosmetic — see the note at the top of
          this file. They disable the script's history auto-tracking, which would
          otherwise follow the visitor into the authenticated app. */}
      <Analytics route="/" path="/" beforeSend={beforeSendMarketingOnly} />
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
          {/* The real coach dashboard, captured from the running app against a
              seeded roster (scripts/seed-hero-roster.mjs + scripts/shoot-hero.mjs).
              It replaces a hand-drawn mock of a dashboard that didn't exist — a
              drawing of your product is a poor thing to show someone who is
              deciding whether to trust you.

              Two sources, not one image scaled: a 1320px dashboard rendered into
              a 375px phone is unreadable, so the narrow file is a tighter crop.
              width/height are the CSS-pixel sizes so the box is reserved before
              the image lands and the hero costs no layout shift. */}
          <picture>
            <source media="(min-width: 769px)" srcSet="/hero/dashboard-wide.webp" />
            <img
              src="/hero/dashboard-narrow.webp"
              alt={heroShot.alt}
              width={760}
              height={880}
              loading="eager"
              fetchPriority="high"
              className="lp-hero-shot"
            />
          </picture>
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

      {/* No pricing section. There is no price to defend — a pricing section
          exists to answer a price objection, and while Gardnr is free there
          isn't one. All it could do here is make the page talk about our
          business model instead of the coach's problem. "Free while we're in
          early access" is stated once in the hero and answered once in the FAQ;
          that is the whole of it. Bring this section back the day there is a
          number to put in it. */}

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
          {/* Rehomed from the deleted pricing section — the free solo product is
              the lowest-commitment door Gardnr owns and shouldn't be footer-only. */}
          <p className="lp-solo-line">{finalCta.soloLine} <Link to={soloSignupPath}>{finalCta.soloCta}</Link></p>
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
