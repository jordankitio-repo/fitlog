import { useState } from 'react'
import { toLocalDateString } from '../utils/dateHelpers'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKS = 13

function getColor(calories, target, hasLog) {
  if (!hasLog) return 'var(--color-border)'
  if (!target) return '#4f8ef7'

  const pct = calories / target
  if (pct >= 0.9) return '#34d399'
  if (pct >= 0.6) return '#fbbf24'
  return '#f87171'
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
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', marginLeft: 28, marginBottom: 4 }}>
        {weeks.map((_, weekIndex) => (
          <div key={weekIndex} style={{ width: 27, flexShrink: 0 }}>
            {monthLabels.has(weekIndex) && (
              <span style={{ fontSize: '0.6rem', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                {monthLabels.get(weekIndex)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginRight: 4 }}>
          {DAYS.map((day, index) => (
            <div
              key={day}
              style={{
                height: 24,
                width: 24,
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

        <div style={{ display: 'flex', gap: 3 }}>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {week.map((cell) => {
                const tooltipText = formatTooltip(cell)

                return (
                  <div
                    key={cell.dateStr}
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
                      width: 24,
                      height: 24,
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

      <div style={{ display: 'flex', gap: 12, marginTop: 12, marginLeft: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { color: '#34d399', label: '>=90% target' },
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
            background: '#1a1a1a',
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
