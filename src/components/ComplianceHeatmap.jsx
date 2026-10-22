import { useState } from 'react'
import { toLocalDateString } from '../utils/dateHelpers'
import { COMPLIANCE as SCALE } from '../utils/complianceScale'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GAP = 2
const DAY_LABEL_WIDTH = 22
const DAY_LABEL_GAP = 4
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
  // Which column the pointer is in, so weekly mode can ring the whole week.
  const [hotWeek, setHotWeek] = useState(null)
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
      <div style={{ width: '100%' }}>
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
                  borderRadius: 4,
                  outline: weekly && hotWeek === weekIndex ? '2px solid var(--color-primary)' : 'none',
                  outlineOffset: 2,
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
                      onMouseLeave={weekly ? undefined : () => setTooltip(null)}
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
          { color: 'var(--color-border)', label: 'No log' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color }} />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{label}</span>
          </div>
        ))}
      </div>

      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x + 12,
            top: tooltip.y - 28,
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
      )}
    </div>
  )
}
