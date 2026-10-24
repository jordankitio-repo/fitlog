import Logo from './Logo'

// What a coach sees if they sign into the iOS app.
//
// The app is the CLIENT's. A coach's work is a roster, a review queue and a
// report reader, all of which want a wide screen; there was never a plan to
// ship a coach app. See src/utils/platform.js for why this is gated on the
// role rather than on a list of routes.
//
// It also happens to be what keeps Apple out of the coach subscription: the
// paywall is a coach screen, and refusing the role means no purchase path can
// render here no matter what BILLING_ENABLED is set to.
//
// Reuses the paywall's `pw-*` classes rather than adding any. Same shape, same
// job: a full-page card that is the whole screen, with a way back out.
function CoachOnWeb({ profile, onSignOut }) {
  const firstName = profile?.full_name?.trim().split(/\s+/)[0]

  return (
    <div className="pw-page">
      <div className="pw-card">
        <div className="pw-head">
          <span className="pw-head-logo"><Logo size={48} /></span>
          <h1 className="pw-title">
            {firstName ? `${firstName}, coaching lives on the web` : 'Coaching lives on the web'}
          </h1>
          <p className="pw-sub">
            Your roster, check-ins and reports need more room than a phone gives them.
            Open gardnr.fit on a computer and everything is where you left it.
          </p>
          <p className="pw-sub" style={{ marginTop: 'var(--space-sm)' }}>
            This app is for the people you coach. It reads their Apple Health data
            so their numbers reach you without anyone typing them.
          </p>
        </div>

        <div className="pw-secondary">
          <button type="button" className="pw-linkbtn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>

      <p className="pw-legal">
        <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/health-data-privacy">Health Data</a>
      </p>
    </div>
  )
}

export default CoachOnWeb
