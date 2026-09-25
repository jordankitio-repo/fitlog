import { parseBlocks } from '../utils/reportMarkdown'

// Renders a coach report's markdown as TYPE, not as source.
//
// The weekly-report edge function asks the model for "a structured weekly
// coaching report with these sections", so what comes back is markdown —
// headings, bold leads, bullet lists. Nothing rendered it. Reports were printed
// into a <p> with `white-space: pre-wrap`, so a client read their coach's
// report as `**Great week.**` and `# Weekly Report`. The structure the prompt
// asks for was not just wasted, it was actively making the page look broken.
//
// Hand-rolled rather than a markdown dependency, for one reason: every element
// here has to land on a design-system role, and a library would hand back
// default <h1>/<strong>/<ul> that then need overriding one by one. This maps
// the small subset the prompt actually produces straight onto A5's ramp. It
// also returns React elements rather than an HTML string, so there is no
// dangerouslySetInnerHTML and no injection surface for text a coach typed.

// Inline grammar: **strong**, *em*, `code`. Deliberately no links — a coach
// types prose, and an anchor here would be an unvetted destination on a page a
// client trusts.
function inline(text, key) {
  const out = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      out.push(<strong key={`${key}-s${i}`} style={{ fontWeight: 'var(--weight-semibold)' }}>{m[1]}</strong>)
    } else if (m[2] !== undefined) {
      out.push(<em key={`${key}-e${i}`}>{m[2]}</em>)
    } else {
      out.push(<code key={`${key}-c${i}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-dim)' }}>{m[3]}</code>)
    }
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// A5 roles. A report is a document, so its sections take the eyebrow role —
// small, uppercase, faint — which reads as editorial structure rather than as
// six competing headlines. h1 is the document's own title and sits one step up;
// the model is told not to emit one, but a coach editing the draft may.
const HEADING = {
  1: { fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)', letterSpacing: '-0.005em' },
  2: { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)', color: 'var(--color-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  3: { fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--color-text-dim)' },
}

// `dropLeadingH1`: the card already names the sender and dates the message, so
// a report opening with "# Weekly Report — Maya" restates its own envelope. The
// prompt tells the model not to emit one; it does anyway. Dropped at render
// rather than stripped from the stored content, which stays what the coach
// approved and sent.
export default function ReportProse({ content, color = 'var(--color-text)', style, className = '', dropLeadingH1 = false }) {
  let blocks = parseBlocks(content)
  if (dropLeadingH1 && blocks[0]?.type === 'h' && blocks[0].level === 1) blocks = blocks.slice(1)
  return (
    <div className={className} style={{ color, fontSize: 'var(--text-base)', lineHeight: 1.7, ...style }}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          const H = b.level === 1 ? 'h4' : b.level === 2 ? 'h5' : 'h6'
          const role = HEADING[Math.min(b.level, 3)]
          return (
            // A3: a section heading needs air ABOVE it and little below — that
            // gap is what groups a heading with its own body instead of
            // floating it between two.
            <H key={i} style={{ ...role, margin: i === 0 ? '0 0 var(--space-8)' : 'var(--space-20) 0 var(--space-8)' }}>
              {inline(b.text, `h${i}`)}
            </H>
          )
        }
        if (b.type === 'list') {
          const L = b.ordered ? 'ol' : 'ul'
          return (
            <L key={i} className="rp-list" style={{ margin: 'var(--space-8) 0 0', paddingLeft: '1.15em' }}>
              {b.items.map((it, j) => (
                <li key={j} style={{ margin: '0 0 var(--space-6)' }}>{inline(it, `l${i}-${j}`)}</li>
              ))}
            </L>
          )
        }
        return (
          <p key={i} style={{ margin: i === 0 ? 0 : 'var(--space-12) 0 0' }}>{inline(b.text, `p${i}`)}</p>
        )
      })}
    </div>
  )
}
