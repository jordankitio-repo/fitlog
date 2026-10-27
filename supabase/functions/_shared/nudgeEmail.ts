// The nudge email, in one place: the coach's Nudge button (nudge-client) and
// the coach's automatic rule (auto-nudge) send the same message, so a client
// cannot tell which one sent it and the wording cannot drift between them.

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type NudgeReason = 'log' | 'checkin' | 'checkin_request' | 'measurements' | 'photos'

export function buildNudgeEmail(opts: {
  reason?: string
  days?: number | null
  coachName: string
  clientName: string
}) {
  const safeCoachName = escapeHtml(opts.coachName)
  const safeClientName = escapeHtml(opts.clientName)
  const GREEN = '#22c55e'
  const dayCount = typeof opts.days === 'number' ? opts.days : null
  let subject, heading, body, ctaLabel, ctaHref
  if (opts.reason === 'checkin') {
    subject = 'Time for your weekly check-in'
    heading = 'Your weekly check-in is waiting'
    body = `${safeCoachName} is waiting on this week's check-in. It takes two minutes and helps them tune your plan.`
    ctaLabel = 'Check in'
    ctaHref = 'https://www.gardnr.fit/'
  } else if (opts.reason === 'checkin_request') {
    // Off schedule: the coach wants one now, whatever the cadence says.
    subject = 'Your coach asked for a check-in'
    heading = 'Quick check-in?'
    body = `${safeCoachName} would like a check-in from you now, outside your usual schedule. It takes two minutes.`
    ctaLabel = 'Check in'
    ctaHref = 'https://www.gardnr.fit/'
  } else if (opts.reason === 'measurements') {
    // Asked ON DEMAND, outside the tape cadence (measurementCadence.js keeps
    // the routine). No day count: the client is not behind on a schedule.
    subject = 'Your coach asked for body measurements'
    heading = 'Time for a tape check'
    body = `${safeCoachName} would like your latest body measurements. Grab a tape measure when you get a moment — it takes a couple of minutes, and it shows the progress the scale misses.`
    ctaLabel = 'Add measurements'
    ctaHref = 'https://www.gardnr.fit/log'
  } else if (opts.reason === 'photos') {
    // Asked on demand, like measurements: no schedule, no day count.
    subject = 'Your coach asked for progress photos'
    heading = 'Time for progress photos'
    body = `${safeCoachName} would like a new set of progress photos: front, side and back, in the same spot and light as last time. Only you and your coach can see them.`
    ctaLabel = 'Add photos'
    ctaHref = 'https://www.gardnr.fit/log'
  } else {
    // 'log' (default): re-engage a client who's gone quiet.
    subject = 'Time to log your day'
    heading = "Let's get back to it"
    const gap = dayCount === null ? "haven't logged yet" : dayCount >= 2 ? `haven't logged in ${dayCount} days` : "haven't logged today"
    body = `${safeCoachName} noticed you ${gap}. A quick log today keeps your momentum going.`
    ctaLabel = 'Log now'
    ctaHref = 'https://www.gardnr.fit/log'
  }
  const html = `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
            <h2 style="color: ${GREEN};">${heading}</h2>
            <p>Hi ${safeClientName},</p>
            <p>${body}</p>
            <a href="${ctaHref}" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background-color: ${GREEN}; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
              ${ctaLabel} &rarr;
            </a>
            <p style="margin-top: 24px; color: #888; font-size: 0.875rem;">Gardnr — your nutrition coaching platform</p>
          </div>
        `
  return { subject, html }
}
