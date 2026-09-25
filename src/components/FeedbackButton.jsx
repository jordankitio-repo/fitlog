// A top-bar utility, NOT a page action.
//
// This was <Button variant="muted">, which made it identical to Nudge — so the
// chrome bar and the client record used the same control for "email the team a
// note" and "email this client a reminder". A top bar is a place you leave
// from, not a place you act in: its items are labels that darken on hover, the
// way Cloudflare's Ask AI / Support sit beside their avatar. Raised buttons up
// there compete with the one real action on the page below.
function FeedbackButton({ userEmail = '', userName = '' }) {
  function handleClick() {
    const subject = encodeURIComponent('Gardnr feedback')
    const body = encodeURIComponent([
      'Hi Gardnr team,',
      '',
      '',
      '',
      userName || userEmail ? 'Account context:' : '',
      userName ? `Name: ${userName}` : '',
      userEmail ? `Email: ${userEmail}` : '',
    ].filter(Boolean).join('\n'))

    window.location.href = `mailto:digigardenllc@gmail.com?subject=${subject}&body=${body}`
  }

  return (
    <button type="button" onClick={handleClick} className="gnav-util ds-control">
      {/* 20px / stroke 2 — the notification bell's exact metrics. These two sit
          side by side in the same bar, so anything smaller reads as a mistake
          rather than a hierarchy. */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* An envelope, not a speech bubble: this opens the mail client, and
            the bubble already means "messages with this client" in the rail. */}
        <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22 6 12 13 2 6" />
      </svg>
      Feedback
    </button>
  )
}

export default FeedbackButton
