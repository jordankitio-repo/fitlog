import { useState } from 'react'
import { createPortal } from 'react-dom'
import { toLocalDateString } from '../utils/dateHelpers'
import { COMPLIANCE as SCALE } from '../utils/complianceScale'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GAP = 2
const DAY_LABEL_WIDTH = 22
const DAY_LABEL_GAP = 4
// Width to assume for the hover bubble when deciding which side of the pointer
// it goes. Only the SIDE depends on this (translateX(-100%) does the exact
// placement), so it is set above the longest string this renders — the weekly
// line, "Week of Sep 27 - 6/7 logged (96% of target)".
const TIP_ESTIMATE = 320
// Cells are fluid, capped per CELL rather than on the grid. 13 columns across
// a 1,066px card would be 80px squares in a grid 560px tall; the cap holds it
// at about 494px, which is the width the layout beside it is built around
// (.cv-adherence-row).
const MAX_CELL = 34
// Exported, because the layout beside the grid has to reserve exactly this —
// a second copy of the arithmetic in CSS is a constant waiting to drift.
export const gridCap = (weeks) => DAY_LABEL_WIDTH + DAY_LABEL_GAP + weeks * (MAX_CELL + GAP)


function getColor(calories, target, hasLog) {
  if (!hasLog) return SCALE.noLog
  if (!target) return SCALE.onTarget

  const pct = calories / target
  // On-target is a band (90-110%); over target gets its own color so a day of
  // overeating never reads as green. Matches summarizeCompliance buckets.
  if (pct > 1.1) return SCALE.over
  if (pct >= 0.9) return SCALE.onTarget
  if (pct >= 0.6) return SCALE.under
  return SCALE.wellUnder
}

function formatMonth(date) {
  return date.toLocaleDateString('en-US', { month: 'short' })
}

export default function ComplianceHeatmap({ logsByDate, calorieTarget, weeks: weekCount = 13, grain = 'daily' }) {
  const [tooltip, setTooltip] = useState(null)
  // What the pointer is over. Weekly tracks the column, daily the single cell;
  // either way the cells themselves darken, which is the only hover mark the
  // grid can carry without moving. An outline — the first attempt — sat OUTSIDE
  // a 38px cell and read as a box drawn around the data rather than as the data
  // being picked out, and at 2px it was heavier than the 2px gutter between
  // columns, so a ringed week looked like a different kind of object.
  const [hotWeek, setHotWeek] = useState(null)
  const [hotCell, setHotCell] = useState(null)
  const target = Number(calorieTarget) || 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const gridEnd = new Date(today)
  gridEnd.setDate(today.getDate() + (6 - today.getDay()))

  const gridStart = new Date(gridEnd)
  gridStart.setDate(gridEnd.getDate() - (weekCount * 7 - 1))

  const cells = []
  for (let i = 0; i < weekCount * 7; i++) {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + i)
    date.setHours(0, 0, 0, 0)

    const dateStr = toLocalDateString(date)
    const isFuture = date > today
    const log = logsByDate[dateStr]
    const hasLog = Boolean(log) && !isFuture
    const calories = log?.calories || 0

    cells.push({ date, dateStr, isFuture, hasLog, calories })
  }

  const weeks = Array.from({ length: weekCount }, (_, weekIndex) =>
    cells.slice(weekIndex * 7, weekIndex * 7 + 7)
  )

  const monthLabels = new Map()
  let previousMonth = null
  weeks.forEach((week, weekIndex) => {
    const month = week[0]?.date.getMonth()
    if (month !== previousMonth) {
      monthLabels.set(weekIndex, formatMonth(week[0].date))
      previousMonth = month
    }
  })

  // A week reads as a week: how many of its days were logged, and how the
  // logged ones averaged against target. Not a sum — a client who logged two
  // days would otherwise read as catastrophically under.
  function formatWeekTooltip(week) {
    const past = week.filter((c) => !c.isFuture)
    if (past.length === 0) return null
    const logged = past.filter((c) => c.hasLog)
    const label = `Week of ${past[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    if (logged.length === 0) return `${label} - no logs`
    const pct = target
      ? Math.round((logged.reduce((sum, c) => sum + c.calories, 0) / (logged.length * target)) * 100)
      : null
    return `${label} - ${logged.length}/${past.length} logged${pct !== null ? ` (${pct}% of target)` : ''}`
  }

  function formatTooltip(cell) {
    if (cell.isFuture) return null

    const dateLabel = cell.date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })

    if (!cell.hasLog) return `${dateLabel} - No log`

    const pct = target ? Math.round((cell.calories / target) * 100) : null
    return `${dateLabel} - ${cell.calories} cal${pct !== null ? ` (${pct}%)` : ''}`
  }

  return (
    <div>
      {/* No scroller and no minimum. The grid always fits the width it is given
          and the CELL size follows — the caller drops to 13 columns on a phone
          (complianceWindow.js) so that stays legible. */}
      <div style={{ width: '100%', maxWidth: gridCap(weekCount) }}>
        {/* Month labels — mirrors the grid row (spacer + fluid week columns) */}
        <div style={{ display: 'flex', gap: DAY_LABEL_GAP, marginBottom: 4 }}>
          <div style={{ width: DAY_LABEL_WIDTH, flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: GAP, flex: 1 }}>
            {weeks.map((_, weekIndex) => (
              <div key={weekIndex} style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-xs)', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                {monthLabels.get(weekIndex) || ''}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: DAY_LABEL_GAP }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: DAY_LABEL_WIDTH, flexShrink: 0 }}>
            {DAYS.map((day) => (
              <div
                key={day}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-muted)',
                  paddingRight: 4,
                }}
              >
                {/* Single letters, except Thursday.
                    Alternate rows with one initial printed S, T, T, S — two
                    rows saying S, two saying T, three saying nothing. Every row
                    is labelled now, and Thursday takes the second letter
                    because it is the one collision a single initial cannot
                    survive: Sunday and Saturday are told apart by position
                    (first row and last), but a T above a T is unreadable in
                    either direction. */}
                {day === 'Thu' ? 'Th' : day.slice(0, 1)}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: GAP, flex: 1 }}>
            {weeks.map((week, weekIndex) => {
              // In WEEKLY the column is the target: the pointer anywhere in it
              // rings the whole week and reads it as one fact. The ring is an
              // `outline`, which draws outside the box and so cannot nudge a
              // 26-column grid sideways the way a border would.
              const weekly = grain === 'weekly'
              const weekText = weekly ? formatWeekTooltip(week) : null
              const track = (event) => setTooltip((cur) => cur && { ...cur, x: event.clientX, y: event.clientY })
              return (
              <div
                key={weekIndex}
                role={weekly ? 'img' : undefined}
                aria-label={weekly ? (weekText || undefined) : undefined}
                onMouseEnter={weekly ? (e) => { setHotWeek(weekIndex); if (weekText) setTooltip({ text: weekText, x: e.clientX, y: e.clientY }) } : undefined}
                onMouseMove={weekly ? track : undefined}
                onMouseLeave={weekly ? () => { setHotWeek(null); setTooltip(null) } : undefined}
                style={{
                  display: 'flex', flexDirection: 'column', gap: GAP, flex: 1, minWidth: 0,
                  cursor: weekly && weekText ? 'help' : 'default',
                }}
              >
                {week.map((cell) => {
                  const tooltipText = formatTooltip(cell)

                  return (
                    <div
                      key={cell.dateStr}
                      role={weekly ? undefined : 'img'}
                      aria-hidden={weekly ? true : undefined}
                      aria-label={weekly ? undefined : (tooltipText || cell.dateStr)}
                      onMouseEnter={weekly ? undefined : (event) => {
                        setHotCell(cell.dateStr)
                        if (tooltipText) {
                          setTooltip({
                            text: tooltipText,
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                      }}
                      onMouseMove={weekly ? undefined : (event) => {
                        if (tooltipText) {
                          setTooltip((current) => current && {
                            ...current,
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                      }}
                      onMouseLeave={weekly ? undefined : () => { setHotCell(null); setTooltip(null) }}
                      style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        borderRadius: 4,
                        backgroundColor: cell.isFuture
                          ? 'transparent'
                          : getColor(cell.calories, target, cell.hasLog),
                        border: cell.isFuture ? '1px solid var(--color-border)' : 'none',
                        opacity: cell.isFuture ? 0.2 : 1,
                        cursor: weekly ? 'inherit' : (tooltipText ? 'help' : 'default'),
                        // The hover mark, as a multiplier on the cell's own
                        // colour so each keeps its hue and a hovered week still
                        // reads as which of its days were over, under and on
                        // target — a flat overlay would wash exactly that away.
                        // The direction is a theme token (--heat-hover): dark
                        // brightens because darkening a #242424 no-log cell
                        // moves it eleven steps and nobody can see it.
                        filter: (weekly ? hotWeek === weekIndex : hotCell === cell.dateStr) ? 'brightness(var(--heat-hover))' : 'none',
                        transition: 'filter 90ms ease',
                      }}
                    />
                  )
                })}
              </div>
            )})}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12, marginLeft: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { color: SCALE.onTarget,  label: '90-110%' },
          { color: SCALE.over,      label: '>110%' },
          { color: SCALE.under,     label: '60-89%' },
          { color: SCALE.wellUnder, label: '<60%' },
          // SCALE.noLog, not the token it currently resolves to.
          // complianceScale.js opens by saying the cells, the legend and the
          // summary tiles all read it; the legend was the one that did not, so
          // the day `noLog` changes the legend would have gone on describing
          // the colour the cells used to be.
          { color: SCALE.noLog, label: 'No log' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* PORTALED to <body>, like InfoTip's bubble and Toast. `position: fixed`
          resolves against the nearest ancestor carrying a transform or filter,
          and this grid lives inside a drag-sortable section — so mid-drag the
          tooltip would start measuring from the card instead of the viewport.
          Out here nothing can clip it or move its origin. */}
      {tooltip && createPortal((
        <div
          className="info-tip-bubble"
          style={{
            // Positioning only. Everything else — surface, border, radius,
            // padding, type, shadow, z-index — comes from the class InfoTip
            // already uses, because this is the same gesture and the app had
            // two spellings of it: 6px radius against --radius, 4px/10px
            // padding against 10px/12px, --color-surface-2 against
            // --color-surface, and no shadow at all against a 22px one.
            //
            // Flip to the LEFT of the pointer near the right edge. The bubble
            // sat at x+12, so on the last columns — exactly where a coach looks
            // first, because that is this week — it ran off the window and the
            // sentence lost its end: "Week of Sep 27 - 6/7 lo".
            // translateX(-100%) moves it by its OWN width, so the flip is exact
            // however long the text is; the estimate only decides WHEN, and is
            // deliberately generous so it flips early rather than late.
            ...(tooltip.x + TIP_ESTIMATE > window.innerWidth - 8
              ? { left: tooltip.x - 12, transform: 'translateX(-100%)' }
              : { left: tooltip.x + 12 }),
            // And never above the top of the window.
            top: Math.max(8, tooltip.y - 28),
          }}
        >
          {tooltip.text}
        </div>
      ), document.body)}
    </div>
  )
}
