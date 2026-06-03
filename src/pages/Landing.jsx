import { Link } from 'react-router-dom'
import heroArt from '../assets/hero.png'

const signupPath = '/login?mode=signup&role=coach'

const featureCards = [
  {
    title: 'Native nutrition tracking',
    copy: 'Clients log meals, macros, weight, cardio, and steps in the same place your coaching decisions happen.',
    metric: '1 place'
  },
  {
    title: 'Compliance at a glance',
    copy: 'See 7-day adherence for calories, protein, cardio, and steps without sorting through screenshots.',
    metric: '7 days'
  },
  {
    title: 'Reports coaches can send',
    copy: 'Generate weekly coaching reports from real client data, edit the message, and send it from FitLog.',
    metric: 'AI draft'
  },
  {
    title: 'Body composition context',
    copy: 'Review weight trends alongside calorie and activity compliance so check-ins have a clear story.',
    metric: 'trend'
  }
]

const problemItems = [
  'Food screenshots scattered across text threads',
  'Manual spreadsheets for targets and weekly averages',
  'No simple way to see who is actually compliant'
]

const steps = [
  {
    label: 'Invite client',
    copy: 'Send a client invite and set their nutrition, cardio, steps, and weight targets.'
  },
  {
    label: 'Client logs',
    copy: 'Clients track food, weight, cardio, and steps from a simple web app.'
  },
  {
    label: 'Coach sees everything',
    copy: 'You review progress, compliance, check-ins, reports, notes, and messages in one view.'
  }
]

function Landing() {
  return (
    <div className="landing-page page-fade-in">
      <header className="landing-nav">
        <Link to="/" className="landing-brand" aria-label="FitLog home">
          <span className="landing-brand-mark">F</span>
          <span>FitLog</span>
        </Link>
        <nav className="landing-nav-links" aria-label="Landing navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#demo">Book a demo</a>
          <Link to="/login">Sign in</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-media" aria-hidden="true">
          <img src={heroArt} alt="" className="landing-hero-art" />
          <div className="landing-product-preview">
            <div className="preview-topbar">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-grid">
              <div className="preview-panel preview-panel-wide">
                <div>
                  <p>Client compliance</p>
                  <strong>86%</strong>
                </div>
                <div className="preview-bars">
                  <span style={{ width: '92%', backgroundColor: '#34d399' }} />
                  <span style={{ width: '78%', backgroundColor: '#4f8ef7' }} />
                  <span style={{ width: '64%', backgroundColor: '#fbbf24' }} />
                </div>
              </div>
              <div className="preview-panel">
                <p>Protein</p>
                <strong>6/7</strong>
              </div>
              <div className="preview-panel">
                <p>Steps</p>
                <strong>5/7</strong>
              </div>
              <div className="preview-panel preview-chart">
                <span style={{ height: '34%' }} />
                <span style={{ height: '54%' }} />
                <span style={{ height: '48%' }} />
                <span style={{ height: '74%' }} />
                <span style={{ height: '67%' }} />
                <span style={{ height: '86%' }} />
              </div>
              <div className="preview-panel preview-report">
                <p>Weekly report</p>
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>

          {/* Compliance card */}
          <div style={{
            position: 'absolute', bottom: '12%', left: '5%',
            backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: '14px 18px',
            display: 'flex', flexDirection: 'column', gap: '8px',
            opacity: 0.75, filter: 'blur(0.4px)', minWidth: '200px'
          }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>7-day compliance</p>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                ['Calories', '5/7', '#34d399'],
                ['Protein', '4/7', '#4f8ef7'],
                ['Cardio', '3/7', '#fbbf24'],
                ['Steps', '6/7', '#34d399']
              ].map(([label, val, color]) => (
                <span key={label} style={{ fontSize: '0.7rem', fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: '999px', padding: '2px 8px' }}>{label} {val}</span>
              ))}
            </div>
          </div>

          {/* Message thread card */}
          <div style={{
            position: 'absolute', top: '18%', right: '3%',
            backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: '14px 18px',
            display: 'flex', flexDirection: 'column', gap: '8px',
            opacity: 0.7, filter: 'blur(0.4px)', minWidth: '220px'
          }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Messages</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ alignSelf: 'flex-start', backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '12px 12px 12px 2px', padding: '6px 12px', fontSize: '0.75rem', maxWidth: '160px' }}>Great job hitting protein today</div>
              <div style={{ alignSelf: 'flex-end', backgroundColor: '#4f8ef7', borderRadius: '12px 12px 2px 12px', padding: '6px 12px', fontSize: '0.75rem', color: '#fff', maxWidth: '160px' }}>Thanks! Felt good today</div>
            </div>
          </div>

          {/* Weight trend card */}
          <div style={{
            position: 'absolute', bottom: '20%', right: '8%',
            backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: '14px 18px',
            opacity: 0.7, filter: 'blur(0.4px)', minWidth: '180px'
          }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Weight trend</p>
            <svg viewBox="0 0 160 60" width="160" height="60">
              <polyline points="0,50 30,44 60,38 90,35 120,28 160,20" fill="none" stroke="#4f8ef7" strokeWidth="2" strokeLinecap="round" />
              <circle cx="160" cy="20" r="3" fill="#4f8ef7" />
            </svg>
            <p style={{ fontSize: '0.75rem', color: '#34d399', margin: 0, fontWeight: 600 }}>↓ 4.2 lbs this month</p>
          </div>

          {/* Weekly report card */}
          <div style={{
            position: 'absolute', top: '55%', left: '3%',
            backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)', padding: '14px 18px',
            opacity: 0.65, filter: 'blur(0.6px)', minWidth: '190px'
          }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Weekly report</p>
            {['Overall solid week', 'Protein on target 4/7 days', 'Recommend increasing cardio', 'Weight down 1.2 lbs'].map((line, i) => (
              <div key={line} style={{ height: '6px', backgroundColor: 'var(--color-border)', borderRadius: '3px', marginBottom: '6px', width: `${[90, 75, 85, 60][i]}%` }} />
            ))}
            <span style={{ fontSize: '0.65rem', color: '#4f8ef7', fontWeight: 600 }}>AI generated · May 24-30</span>
          </div>
        </div>

        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Nutrition coaching software for online coaches</p>
          <h1>The nutrition and body composition layer your coaching business is missing.</h1>
          <p className="landing-subhead">
            FitLog helps coaches set targets, track macro compliance, monitor body composition, and send data-backed weekly reports without depending on screenshots or spreadsheets.
          </p>
          <div className="landing-actions">
            <Link to={signupPath} className="landing-button landing-button-primary">
              Start free
            </Link>
            <a href="#demo" className="landing-button landing-button-secondary">
              Book a demo
            </a>
          </div>
        </div>
      </section>

      <section className="landing-section landing-problem" aria-labelledby="problem-heading">
        <div>
          <p className="landing-eyebrow">The problem</p>
          <h2 id="problem-heading">Nutrition coaching still runs on manual work.</h2>
        </div>
        <div className="landing-problem-list">
          {problemItems.map((item) => (
            <div className="landing-problem-item" key={item}>
              <span />
              <p>{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section" id="features" aria-labelledby="features-heading">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Why coaches care</p>
          <h2 id="features-heading">The data you need before every check-in.</h2>
        </div>
        <div className="landing-feature-grid">
          {featureCards.map((feature) => (
            <article className="landing-card" key={feature.title}>
              <div className="landing-card-metric">{feature.metric}</div>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-how" id="how-it-works" aria-labelledby="how-heading">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">How it works</p>
          <h2 id="how-heading">Invite, log, coach.</h2>
        </div>
        <div className="landing-steps">
          {steps.map((step, index) => (
            <article className="landing-step" key={step.label}>
              <div className="landing-step-number">{index + 1}</div>
              <h3>{step.label}</h3>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-demo" id="demo" aria-labelledby="demo-heading">
        <div>
          <p className="landing-eyebrow">Get started</p>
          <h2 id="demo-heading">Start with a free coach account.</h2>
          <p>
            Try the coach dashboard, invite a client, and see how nutrition compliance and weekly reporting fit into your workflow.
          </p>
        </div>
        <div className="landing-demo-actions">
          <Link to={signupPath} className="landing-button landing-button-primary">
            Start free
          </Link>
          <Link to="/login" className="landing-button landing-button-secondary">
            Sign in
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Landing
