// Row model for the coach-report list.
//
// In its own module for the reason controlStyle.js and reportMarkdown.js are:
// a file that exports both a component and a plain function breaks React Fast
// Refresh, and the lint rule enforces it. Keeping it here also keeps it
// testable without mounting anything.
import { parseBlocks } from './reportMarkdown'

// The report's LEAD — its first real paragraph, with the markdown stripped, for
// a one-line summary in a list. Not the first N characters: the model is asked
// to open with an overall assessment, so the first paragraph IS the summary,
// and cutting there lands on a sentence rather than mid-word.
export function leadOf(content) {
  const blocks = parseBlocks(content)
  const lead = blocks.find(b => b.type === 'p')
  if (!lead) return ''
  return lead.text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
}

// Month separators for the archive. Derived from the loaded rows rather than
// queried, so it stays correct as pages are appended.
//
// The label is dropped for the CURRENT year — "September" beside a row reading
// "2 days ago" needs no year, and repeating it down twelve months is the kind
// of true-but-useless text that makes an archive feel like a database export.
export function byMonth(reports, now = new Date()) {
  const out = []
  let last = null
  for (const r of reports) {
    const d = new Date(r.created_at)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    if (key !== last) {
      out.push({
        kind: 'label',
        key,
        label: d.toLocaleDateString(undefined, {
          month: 'long',
          ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
        }),
      })
      last = key
    }
    out.push({ kind: 'report', report: r })
  }
  return out
}
