import { useState, useRef, useLayoutEffect } from 'react'
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
// A cell never goes below this. Twenty-six columns inside a phone's ~340px is
// 8px a cell — dots, not a calendar, with the month labels printing over each
// other ("AprMay"). F1's rule is that a layout which stops meaning anything at
// a width should be REBUILT for it rather than left to squeeze, so below the
// width where cells stay legible the grid keeps its size and scrolls instead.
// The span is unchanged, which is the point: the phone reads the same six
// months as the desktop, it just reaches them by swiping.
const MIN_CELL = 22
// No width cap. Cells are fluid and the grid always fills its container — safe
// now that the span is fixed (complianceWindow.js), because nothing can change
// the column count underneath it. The 440px grid cap this replaces, and the
// per-cell cap that replaced that, both existed to protect spans the control
// no longer offers.


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

  // Open on the RECENT end. The grid is drawn oldest-first, so a scrollable
  // one lands on last spring unless told otherwise — and the weeks a coach
  // opens a record to see are the ones at the far right.
  const scroller = useRef(null)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [weekCount])

  return (
    <div>
      <div ref={scroller} style={{ overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ width: '100%', minWidth: DAY_LABEL_WIDTH + DAY_LABEL_GAP + weekCount * (MIN_CELL + GAP) }}>
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
          {/* Sticky, or scrolling right takes the day letters with it and the
              rows stop being identifiable. */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: GAP,
            width: DAY_LABEL_WIDTH, flexShrink: 0,
            position: 'sticky', left: 0, zIndex: 1,
            background: 'var(--color-surface)',
          }}>
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
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12, marginLeft: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { color: SCALE.onTarget,  label: '90-110%' },
          { color: SCALE.over,      label: '>110%' },
          { color: SCALE.under,     label: '60-89%' },
          { color: SCALE.wellUnder, label: '<60%' },
          { color: 'var(--color-border)', label: 'No log' },
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
          style={{
            position: 'fixed',
            // Flip to the LEFT of the pointer near the right edge. The bubble is
            // nowrap and sat at x+12, so on the last columns — exactly where a
            // coach looks first, because that is this week — it ran off the
            // window and the sentence lost its end: "Week of Sep 27 - 6/7 lo".
            // translateX(-100%) moves it by its OWN width, so the flip is exact
            // however long the text is; the estimate below only decides WHEN,
            // and is deliberately generous so it flips early rather than late.
            ...(tooltip.x + TIP_ESTIMATE > window.innerWidth - 8
              ? { left: tooltip.x - 12, transform: 'translateX(-100%)' }
              : { left: tooltip.x + 12 }),
            // And never above the top of the window.
            top: Math.max(8, tooltip.y - 28),
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text)',
            pointerEvents: 'none',
            zIndex: 1000,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.text}
        </div>
      ), document.body)}
    </div>
  )
}
