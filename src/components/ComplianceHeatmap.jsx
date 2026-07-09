import { useState } from 'react'
import { toLocalDateString } from '../utils/dateHelpers'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKS = 13
const GAP = 2
const DAY_LABEL_WIDTH = 22
const DAY_LABEL_GAP = 4
// Cells are fluid (fill the container width); cap the whole grid so it fills a
// phone but doesn't blow up into giant cells on a wide desktop card.
const MAX_WIDTH = 440

function getColor(calories, target, hasLog) {
  if (!hasLog) return 'var(--color-border)'
  if (!target) return '#22c55e'

  const pct = calories / target
  // On-target is a band (90-110%); over target gets its own color so a day of
  // overeating never reads as green. Matches summarizeCompliance buckets.
  if (pct > 1.1) return '#fb923c'   // over
  if (pct >= 0.9) return '#34d399'  // on target
  if (pct >= 0.6) return '#fbbf24'  // under
  return '#f87171'                  // well under
}

function formatMonth(date) {
  return date.toLocaleDateString('en-US', { month: 'short' })
}

export default function ComplianceHeatmap({ logsByDate, calorieTarget }) {
  const [tooltip, setTooltip] = useState(null)
  const target = Number(calorieTarget) || 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const gridEnd = new Date(today)
  gridEnd.setDate(today.getDate() + (6 - today.getDay()))

  const gridStart = new Date(gridEnd)
  gridStart.setDate(gridEnd.getDate() - (WEEKS * 7 - 1))

  const cells = []
  for (let i = 0; i < WEEKS * 7; i++) {
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

  const weeks = Array.from({ length: WEEKS }, (_, weekIndex) =>
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
      <div style={{ width: '100%', maxWidth: MAX_WIDTH }}>
        {/* Month labels — mirrors the grid row (spacer + fluid week columns) */}
        <div style={{ display: 'flex', gap: DAY_LABEL_GAP, marginBottom: 4 }}>
          <div style={{ width: DAY_LABEL_WIDTH, flexShrink: 0 }} />
          <div style={{ display: 'flex', gap: GAP, flex: 1 }}>
            {weeks.map((_, weekIndex) => (
              <div key={weekIndex} style={{ flex: 1, minWidth: 0, fontSize: '0.6rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                {monthLabels.get(weekIndex) || ''}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: DAY_LABEL_GAP }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: DAY_LABEL_WIDTH, flexShrink: 0 }}>
            {DAYS.map((day, index) => (
              <div
                key={day}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  fontSize: '0.55rem',
                  color: 'var(--color-muted)',
                  paddingRight: 4,
                }}
              >
                {index % 2 === 0 ? day.slice(0, 1) : ''}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: GAP, flex: 1 }}>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: GAP, flex: 1, minWidth: 0 }}>
                {week.map((cell) => {
                  const tooltipText = formatTooltip(cell)

                  return (
                    <div
                      key={cell.dateStr}
                      role="img"
                      aria-label={tooltipText || cell.dateStr}
                      onMouseEnter={(event) => {
                        if (tooltipText) {
                          setTooltip({
                            text: tooltipText,
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                      }}
                      onMouseMove={(event) => {
                        if (tooltipText) {
                          setTooltip((current) => current && {
                            ...current,
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        borderRadius: 4,
                        backgroundColor: cell.isFuture
                          ? 'transparent'
                          : getColor(cell.calories, target, cell.hasLog),
                        border: cell.isFuture ? '1px solid var(--color-border)' : 'none',
                        opacity: cell.isFuture ? 0.2 : 1,
                        cursor: tooltipText ? 'help' : 'default',
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12, marginLeft: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { color: '#34d399', label: '90-110%' },
          { color: '#fb923c', label: '>110%' },
          { color: '#fbbf24', label: '60-89%' },
          { color: '#f87171', label: '<60%' },
          { color: 'var(--color-border)', label: 'No log' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: color }} />
            <span style={{ fontSize: '0.6rem', color: 'var(--color-muted)' }}>{label}</span>
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
            fontSize: '0.7rem',
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
