// Row model for the coach thread: the timestamps and the grouping.
//
// In its own module for the reason reportFeed.js is: a file exporting both a
// component and a plain function breaks React Fast Refresh, and the lint rule
// enforces it. Keeping it here also keeps it testable without mounting
// anything.

// A DAY SEPARATOR, not a stamp under every bubble.
//
// Every message used to carry its own date, which put "Sep 16" under both
// halves of a two-line exchange and made the time an attribute of each bubble
// rather than structure in the thread. Time belongs between messages: it says
// when the conversation broke, which is the only thing a reader wants from it.
//
// The break is the calendar DAY, not an elapsed-hours threshold. Messages.app
// uses roughly an hour because phone chat is bursty; a coaching thread is one
// or two items a day, so an hourly rule would put a separator above nearly
// every row and cost more chrome than the per-bubble stamps it replaced.
export function threadRows(items) {
  const out = []
  let lastDay = null
  let lastSender = null
  for (const it of items) {
    const d = new Date(it.at)
    const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (day !== lastDay) {
      out.push({ kind: 'day', key: `d-${day}`, at: it.at })
      lastSender = null
    }
    // A report is never a continuation: it is a different KIND of thing, and
    // the gap before it is what says so.
    const sender = it.report ? null : it.message.sender_id
    out.push({
      ...it,
      kind: it.report ? 'report' : 'message',
      cont: sender !== null && sender === lastSender,
    })
    lastDay = day
    lastSender = sender
  }
  return out
}
