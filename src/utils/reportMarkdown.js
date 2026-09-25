// Markdown block grammar for coach reports.
//
// Split out of ReportProse.jsx for the same reason controlStyle.js is split out
// of Field.jsx: a module that exports both a component and a plain function
// breaks React Fast Refresh, and the lint rule enforces it.
//
// The subset is deliberately the one the weekly-report prompt actually
// produces — headings, bullet and ordered lists, blank-line paragraphs.

// Block grammar: headings, bullet and ordered lists, blank-line paragraphs.
export function parseBlocks(md = '') {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let para = []
  let list = null

  const flushPara = () => {
    if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = [] }
  }
  const flushList = () => { if (list) { blocks.push(list); list = null } }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushPara(); flushList(); continue }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushPara(); flushList()
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2] })
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      flushPara()
      if (!list || list.ordered) { flushList(); list = { type: 'list', ordered: false, items: [] } }
      list.items.push(bullet[1])
      continue
    }

    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(line)
    if (ordered) {
      flushPara()
      if (!list || !list.ordered) { flushList(); list = { type: 'list', ordered: true, items: [] } }
      list.items.push(ordered[2])
      continue
    }

    flushList()
    para.push(line)
  }
  flushPara(); flushList()
  return blocks
}
